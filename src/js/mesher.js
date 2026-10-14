// All-quad mesher for the plates of a structural model, written in the SkyCiv S3D format: the mesh nodes are added to
// `nodes`, the elements to `meshed_plates` (node_A..node_D, parent_plate, rotZ) and the meshed plates get isMeshed: true.
//
// PyNite only has quad shell elements, so every plate is meshed into quads:
// - Rectilinear plates (rectangles, L, T, U shapes... with their edges along their local axes) are cut into cells by lines
//   through their corners and the nodes on them, and get a grid of rectangles.
// - Other convex 4-node plates with nothing on them get a structured grid (transfinite interpolation of their sides).
// - Any other plate is triangulated (constrained Delaunay over a square lattice), the triangles are recombined into
//   quads in pairs, and every element is split into quads (quads into 4, triangles into 3), then smoothed.
// Plates that share an edge get the same nodes on it, and the structural nodes that lie on a plate (on its edges or
// inside it) become mesh nodes, so loads, supports and members there are connected to the plate.
import cdt2d from "cdt2d";

// Tolerance to find nodes on a plate, relative to the size of the plate
const RELATIVE_TOLERANCE = 1e-6;
// Plates with more than 4 nodes must be flat, up to this distance relative to their size
const RELATIVE_FLATNESS = 1e-3;
// Lowest quality (1 - largest corner angle deviation from 90 degrees / 90) of the quads made of two triangles
const MIN_RECOMBINE_QUALITY = 0.35;
const SMOOTHING_PASSES = 6;
// Breakpoints spread from plate to plate through their shared edges, this caps the rounds
const MAX_BREAKPOINT_ITERATIONS = 20;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const norm = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => scale(a, 1 / norm(a));
const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Meshes all the plates of a structural model. The model is not changed, a meshed copy is returned.
 * @param {import("../submodules/paramele-parsers/types").s3d_model} structure
 * @param {{mesh_size: number}} options mesh_size is the target element size, in length units
 * @returns {import("./types").ParamEleMeshResult}
 */
function meshStructure(structure, { mesh_size }) {
  const meshed = { ...structure, nodes: { ...structure.nodes }, plates: { ...structure.plates }, meshed_plates: {} };
  const result = { structure: meshed, node_ids: [], element_count: 0, meshed_plate_ids: [], skipped: [] };
  const plate_ids = Object.keys(structure.plates);
  if (plate_ids.length === 0 || !(mesh_size > 0)) return result;

  let next_node_id = Math.max(0, ...Object.keys(structure.nodes).map(Number).filter(Number.isFinite)) + 1;
  const addNode = (point) => {
    const node_id = next_node_id++;
    meshed.nodes[node_id] = { x: point.x, y: point.y, z: point.z };
    result.node_ids.push(node_id);
    return node_id;
  };
  const getPoint = (node_id) => meshed.nodes[node_id];
  const original_nodes = Object.entries(structure.nodes).map(([node_id, node]) => ({ id: Number(node_id), point: node }));

  // 1. Geometry of every plate, and the segments of its edges between the nodes found on them
  const plates = [];
  plate_ids.forEach((plate_id) => {
    const plate = preparePlate(plate_id, structure.plates[plate_id], structure.nodes, original_nodes);
    if (plate.error) {
      result.skipped.push({ plate_id, reason: plate.error });
      meshed.plates[plate_id] = { ...structure.plates[plate_id], isMeshed: false };
    } else {
      plates.push(plate);
    }
  });

  // 2. Breakpoints: rectilinear plates are cut into cells by lines through their corners and the nodes on them. The
  // cuts that reach an edge split it, and the plates that share that edge get the split too (repeated until nothing
  // changes), so all of them have nodes at the same places.
  const breakpoints = {};
  const getSegmentBreakpoints = ({ key, a, b }) => {
    if (!breakpoints[key]) breakpoints[key] = { a: Math.min(a, b), b: Math.max(a, b), points: [] };
    return breakpoints[key];
  };
  const addBreakpoint = (segment, point_3d) => {
    const entry = getSegmentBreakpoints(segment);
    const point_a = getPoint(entry.a);
    const vector = sub(getPoint(entry.b), point_a);
    const length = norm(vector);
    const t = dot(sub(point_3d, point_a), vector) / (length * length);
    if (t * length <= segment.tolerance || (1 - t) * length <= segment.tolerance) return false;
    if (entry.points.some((point) => Math.abs(point.t - t) * length <= segment.tolerance)) return false;
    entry.points.push({ t, node_id: addNode(add(point_a, scale(vector, t))) });
    return true;
  };
  const rectilinear_plates = plates.filter((plate) => plate.rectilinear);
  for (let iteration = 0, changed = true; changed && iteration < MAX_BREAKPOINT_ITERATIONS; iteration++) {
    changed = false;
    rectilinear_plates.forEach((plate) => {
      const { xs, ys } = getCutLines(plate, breakpoints, getPoint);
      plate.sides.forEach((side) =>
        side.forEach((segment) => {
          const [start, end] = [segment.a, segment.b].map((node_id) => plate.to2D(getPoint(node_id)));
          // Horizontal edges (along x) are cut by the vertical lines, and the other way around
          const axis = Math.abs(end[0] - start[0]) > Math.abs(end[1] - start[1]) ? 0 : 1;
          const [low, high] = [Math.min(start[axis], end[axis]), Math.max(start[axis], end[axis])];
          (axis === 0 ? xs : ys).forEach((cut) => {
            if (cut <= low + plate.tolerance || cut >= high - plate.tolerance) return;
            const point_2d = axis === 0 ? [cut, start[1]] : [start[0], cut];
            if (addBreakpoint({ ...segment, tolerance: plate.tolerance }, plate.to3D(point_2d))) changed = true;
          });
        })
      );
    });
  }
  // The sides of the plates as lists of sub-segments between their breakpoints
  plates.forEach((plate) => {
    plate.sides = plate.sides.map((side) =>
      side.flatMap((segment) => {
        const entry = breakpoints[segment.key];
        if (!entry || entry.points.length === 0) return [segment];
        let chain = [entry.a, ...[...entry.points].sort((p, q) => p.t - q.t).map(({ node_id }) => node_id), entry.b];
        if (chain[0] !== segment.a) chain.reverse();
        return chain.slice(0, -1).map((a, i) => ({ key: edgeKey(a, chain[i + 1]), a, b: chain[i + 1] }));
      })
    );
    if (plate.rectilinear) plate.kind = "grid";
    else if (plate.convex_quad && plate.inner_nodes.length === 0 && plate.sides.every((side) => side.length === 1)) plate.kind = "structured";
    else plate.kind = "unstructured";
  });

  // 3. Number of divisions of each sub-segment. They are shared by every plate with that sub-segment, so the meshes
  // match. Opposite sides of a structured plate, and the edges and cuts of a grid plate along the same column or row,
  // need the same divisions: they are grouped (union-find) and use the largest. The unstructured plates seed every
  // other node and get the rest when they split, so their sub-segments need an even number of divisions.
  const segments = {};
  const parents = {};
  const required = {};
  const needs_even = new Set();
  const find = (key) => {
    while (parents[key] !== key) {
      parents[key] = parents[parents[key]];
      key = parents[key];
    }
    return key;
  };
  const union = (key_a, key_b) => {
    parents[find(key_a)] = find(key_b);
  };
  const addVariable = (key, length) => {
    if (parents[key] === undefined) parents[key] = key;
    required[key] = Math.max(required[key] || 1, Math.ceil(length / mesh_size - 1e-9));
  };
  plates.forEach((plate) => {
    plate.sides.forEach((side) =>
      side.forEach(({ key, a, b }) => {
        if (!segments[key]) segments[key] = { a: Math.min(a, b), b: Math.max(a, b) };
        addVariable(key, norm(sub(getPoint(b), getPoint(a))));
        if (plate.kind === "unstructured") needs_even.add(key);
      })
    );
    if (plate.kind === "structured") {
      union(plate.sides[0][0].key, plate.sides[2][0].key);
      union(plate.sides[1][0].key, plate.sides[3][0].key);
    } else if (plate.kind === "grid") {
      const { xs, ys } = getCutLines(plate, breakpoints, getPoint);
      plate.xs = xs;
      plate.ys = ys;
      xs.slice(0, -1).forEach((x, i) => addVariable(`plate${plate.id}-x${i}`, xs[i + 1] - x));
      ys.slice(0, -1).forEach((y, j) => addVariable(`plate${plate.id}-y${j}`, ys[j + 1] - y));
      plate.sides.forEach((side) =>
        side.forEach(({ key, a, b }) => {
          const [start, end] = [a, b].map((node_id) => plate.to2D(getPoint(node_id)));
          const axis = Math.abs(end[0] - start[0]) > Math.abs(end[1] - start[1]) ? 0 : 1;
          const middle = (start[axis] + end[axis]) / 2;
          const cuts = axis === 0 ? xs : ys;
          const interval = cuts.findIndex((cut, i) => i < cuts.length - 1 && middle > cut && middle < cuts[i + 1]);
          union(key, `plate${plate.id}-${axis === 0 ? "x" : "y"}${interval}`);
        })
      );
    }
  });
  const group_divisions = {};
  Object.keys(parents).forEach((key) => {
    const root = find(key);
    group_divisions[root] = Math.max(group_divisions[root] || 1, required[key]);
  });
  needs_even.forEach((key) => {
    const root = find(key);
    group_divisions[root] = Math.max(2, group_divisions[root] + (group_divisions[root] % 2));
  });
  const getDivisions = (key) => group_divisions[find(key)];
  Object.entries(segments).forEach(([key, segment]) => {
    segment.divisions = getDivisions(key);
    // Nodes of the segment, from its lower node ID to the higher one
    const point_a = getPoint(segment.a);
    const point_b = getPoint(segment.b);
    segment.node_ids = [segment.a];
    for (let i = 1; i < segment.divisions; i++) segment.node_ids.push(addNode(add(point_a, scale(sub(point_b, point_a), i / segment.divisions))));
    segment.node_ids.push(segment.b);
  });
  // Nodes along one side of a plate, in the order of the plate
  const getSideNodes = (side) => {
    let side_nodes = [];
    side.forEach(({ key, a }) => {
      let segment_nodes = segments[key].node_ids;
      if (segment_nodes[0] !== a) segment_nodes = [...segment_nodes].reverse();
      side_nodes.push(...(side_nodes.length > 0 ? segment_nodes.slice(1) : segment_nodes));
    });
    return side_nodes;
  };

  // 4. Mesh every plate
  let next_element_id = 1;
  plates.forEach((plate) => {
    let quads = null;
    try {
      if (plate.kind === "grid") quads = meshGrid(plate, getDivisions, getSideNodes, getPoint, addNode);
      else if (plate.kind === "structured") quads = meshStructured(plate, getSideNodes, getPoint, addNode);
      else quads = meshUnstructured(plate, mesh_size, getSideNodes, getPoint, addNode);
    } catch (error) {
      console.error(`Plate ${plate.id} could not be meshed`, error);
    }
    if (!quads || quads.length === 0) {
      result.skipped.push({ plate_id: plate.id, reason: "mesh_failed" });
      meshed.plates[plate.id] = { ...structure.plates[plate.id], isMeshed: false };
      return;
    }
    quads.forEach((quad) => {
      meshed.meshed_plates[next_element_id++] = {
        node_A: quad[0],
        node_B: quad[1],
        node_C: quad[2],
        node_D: quad[3],
        parent_plate: Number(plate.id),
        rotZ: getElementRotZ(quad.map(getPoint), plate.local_x),
      };
    });
    meshed.plates[plate.id] = { ...structure.plates[plate.id], isMeshed: true };
    result.meshed_plate_ids.push(plate.id);
    result.element_count += quads.length;
  });

  // Segment nodes of plates that failed afterwards are left unused, drop them
  const used_nodes = new Set(original_nodes.map(({ id }) => id));
  Object.values(meshed.meshed_plates).forEach(({ node_A, node_B, node_C, node_D }) =>
    [node_A, node_B, node_C, node_D].forEach((id) => used_nodes.add(id))
  );
  result.node_ids = result.node_ids.filter((node_id) => {
    if (used_nodes.has(node_id)) return true;
    delete meshed.nodes[node_id];
    return false;
  });
  return result;
}

/**
 * Plane, local axes, and edges of a plate, with the structural nodes that lie on it
 */
function preparePlate(plate_id, plate_data, nodes, original_nodes) {
  let node_ids = plate_data.nodes;
  if (typeof node_ids === "string") node_ids = node_ids.split(",");
  if (!Array.isArray(node_ids)) return { error: "invalid_nodes" };
  node_ids = node_ids.map(Number);
  // A closed list repeats its first node at the end
  if (node_ids.length > 3 && node_ids[0] === node_ids[node_ids.length - 1]) node_ids = node_ids.slice(0, -1);
  if (node_ids.length < 3 || new Set(node_ids).size !== node_ids.length) return { error: "invalid_nodes" };
  if (node_ids.some((node_id) => !nodes[node_id])) return { error: "invalid_nodes" };
  const points = node_ids.map((node_id) => nodes[node_id]);

  // Plane through the centroid with Newell's normal, which follows the order of the nodes
  const centroid = scale(points.reduce(add, { x: 0, y: 0, z: 0 }), 1 / points.length);
  let normal = { x: 0, y: 0, z: 0 };
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    normal = add(normal, { x: (a.y - b.y) * (a.z + b.z), y: (a.z - b.z) * (a.x + b.x), z: (a.x - b.x) * (a.y + b.y) });
  });
  let size = 0;
  points.forEach((a) => points.forEach((b) => (size = Math.max(size, norm(sub(a, b))))));
  if (size === 0 || norm(normal) < 1e-12 * size * size) return { error: "degenerate" };
  normal = normalize(normal);
  const tolerance = RELATIVE_TOLERANCE * size;
  const flatness = Math.max(...points.map((point) => Math.abs(dot(sub(point, centroid), normal))));
  if (flatness > RELATIVE_FLATNESS * size && points.length > 4) return { error: "not_flat" };

  // Local axes: x along the first edge (turned rotZ degrees about the normal, as in SkyCiv), y = z cross x
  let axis_x = sub(points[1], points[0]);
  axis_x = normalize(sub(axis_x, scale(normal, dot(axis_x, normal))));
  const axis_y = cross(normal, axis_x);
  const rot_z = ((Number(plate_data.rotZ) || 0) * Math.PI) / 180;
  const local_x = add(scale(axis_x, Math.cos(rot_z)), scale(axis_y, Math.sin(rot_z)));
  const to2D = (point) => {
    const relative = sub(point, points[0]);
    return [dot(relative, axis_x), dot(relative, axis_y)];
  };
  const to3D = ([u, v]) => add(add(points[0], scale(axis_x, u)), scale(axis_y, v));
  const polygon = points.map(to2D);
  if (isSelfIntersecting(polygon)) return { error: "self_intersecting" };

  // Structural nodes on the plate: on its edges they split the edges, inside it they are fixed mesh nodes
  const corner_ids = new Set(node_ids);
  const edge_nodes = node_ids.map(() => []);
  const inner_nodes = [];
  const found = polygon.map((point_2d, i) => ({ id: node_ids[i], point_2d }));
  original_nodes.forEach(({ id, point }) => {
    if (corner_ids.has(id) || Math.abs(dot(sub(point, centroid), normal)) > Math.max(tolerance, flatness * 1.01)) return;
    const point_2d = to2D(point);
    // Nodes on top of one already found (duplicated nodes) are left out
    if (found.some((other) => dist2(other.point_2d, point_2d) <= tolerance)) return;
    const edge_i = polygon.findIndex((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      const length = dist2(a, b);
      const t = ((point_2d[0] - a[0]) * (b[0] - a[0]) + (point_2d[1] - a[1]) * (b[1] - a[1])) / (length * length);
      return t > 0 && t < 1 && Math.abs(cross2(a, b, point_2d)) / length <= tolerance;
    });
    if (edge_i >= 0) {
      const a = polygon[edge_i];
      edge_nodes[edge_i].push({ id, t: dist2(a, point_2d) });
    } else if (isInsidePolygon(point_2d, polygon)) {
      inner_nodes.push({ id, point_2d });
    } else {
      return;
    }
    found.push({ id, point_2d });
  });

  // Each side is the list of segments between the nodes along one edge of the plate
  const sides = node_ids.map((node_id, i) => {
    const chain = [node_id, ...edge_nodes[i].sort((a, b) => a.t - b.t).map(({ id }) => id), node_ids[(i + 1) % node_ids.length]];
    return chain.slice(0, -1).map((a, j) => {
      const b = chain[j + 1];
      return { key: `${Math.min(a, b)}-${Math.max(a, b)}`, a, b };
    });
  });

  const convex_quad = node_ids.length === 4 && isConvex(polygon);
  const is_flat = flatness <= RELATIVE_FLATNESS * size;
  // Warped plates can only be meshed as a structured quad, which follows the 4 corners
  if (!is_flat && !(convex_quad && inner_nodes.length === 0 && edge_nodes.every((list) => list.length === 0))) return { error: "not_flat" };
  // Edges along the local axes only (L, T, U shapes...): meshed as a grid
  const rectilinear =
    is_flat &&
    polygon.every((a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return Math.abs(a[0] - b[0]) <= tolerance || Math.abs(a[1] - b[1]) <= tolerance;
    });
  return { id: plate_id, node_ids, polygon, sides, inner_nodes, convex_quad, rectilinear, tolerance, local_x, to2D, to3D };
}

/**
 * Lines that cut a rectilinear plate into cells: through its corners, the nodes on it and the breakpoints of its edges
 * @returns {{xs: number[], ys: number[]}} sorted local coordinates
 */
function getCutLines(plate, breakpoints, getPoint) {
  const points = [...plate.polygon, ...plate.inner_nodes.map(({ point_2d }) => point_2d)];
  plate.sides.forEach((side) =>
    side.forEach(({ key, a }) => {
      points.push(plate.to2D(getPoint(a)));
      (breakpoints[key] ? breakpoints[key].points : []).forEach(({ node_id }) => points.push(plate.to2D(getPoint(node_id))));
    })
  );
  const unique = (values) => values.sort((a, b) => a - b).filter((value, i, sorted) => i === 0 || value - sorted[i - 1] > plate.tolerance);
  return { xs: unique(points.map((point) => point[0])), ys: unique(points.map((point) => point[1])) };
}

/**
 * Grid of a rectilinear plate: its cells (between the cut lines) are divided as their column and row
 * @returns {number[][]} quads, as lists of 4 node IDs
 */
function meshGrid(plate, getDivisions, getSideNodes, getPoint, addNode) {
  const getCoordinates = (cuts, axis) => {
    const coordinates = [cuts[0]];
    cuts.slice(0, -1).forEach((cut, i) => {
      const divisions = getDivisions(`plate${plate.id}-${axis}${i}`);
      for (let k = 1; k <= divisions; k++) coordinates.push(k === divisions ? cuts[i + 1] : cut + ((cuts[i + 1] - cut) * k) / divisions);
    });
    return coordinates;
  };
  const us = getCoordinates(plate.xs, "x");
  const vs = getCoordinates(plate.ys, "y");
  // Nodes already on the plate: on its edges and inside it
  const known = [];
  plate.sides.forEach((side) => getSideNodes(side).forEach((node_id) => known.push({ node_id, point_2d: plate.to2D(getPoint(node_id)) })));
  plate.inner_nodes.forEach(({ id, point_2d }) => known.push({ node_id: id, point_2d }));
  const grid = us.map(() => vs.map(() => null));
  const getNode = (i, j) => {
    if (grid[i][j] === null) {
      const point_2d = [us[i], vs[j]];
      const match = known.find((other) => dist2(other.point_2d, point_2d) <= plate.tolerance * 10);
      if (match) grid[i][j] = match.node_id;
      else if (distanceToPolygon(point_2d, plate.polygon) <= plate.tolerance * 10) throw new Error(`No boundary node at ${point_2d}`);
      else grid[i][j] = addNode(plate.to3D(point_2d));
    }
    return grid[i][j];
  };
  const quads = [];
  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < vs.length - 1; j++) {
      if (!isInsidePolygon([(us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2], plate.polygon)) continue;
      quads.push([getNode(i, j), getNode(i + 1, j), getNode(i + 1, j + 1), getNode(i, j + 1)]);
    }
  }
  return quads;
}

/**
 * Structured grid of a convex 4-node plate (transfinite interpolation of its sides, also fine for warped plates)
 * @returns {number[][]} quads, as lists of 4 node IDs
 */
function meshStructured(plate, getSideNodes, getPoint, addNode) {
  const bottom = getSideNodes(plate.sides[0]); // corner 0 -> 1
  const right = getSideNodes(plate.sides[1]); // corner 1 -> 2
  const top = getSideNodes(plate.sides[2]).reverse(); // corner 3 -> 2
  const left = getSideNodes(plate.sides[3]).reverse(); // corner 0 -> 3
  const n_u = bottom.length - 1;
  const n_v = right.length - 1;
  const [c0, c1, c2, c3] = [bottom[0], bottom[n_u], top[n_u], top[0]].map(getPoint);
  const grid = [];
  for (let i = 0; i <= n_u; i++) {
    grid.push([]);
    for (let j = 0; j <= n_v; j++) {
      let node_id;
      if (j === 0) node_id = bottom[i];
      else if (j === n_v) node_id = top[i];
      else if (i === 0) node_id = left[j];
      else if (i === n_u) node_id = right[j];
      else {
        const u = i / n_u;
        const v = j / n_v;
        let point = add(
          add(scale(getPoint(bottom[i]), 1 - v), scale(getPoint(top[i]), v)),
          add(scale(getPoint(left[j]), 1 - u), scale(getPoint(right[j]), u))
        );
        const bilinear = add(add(scale(c0, (1 - u) * (1 - v)), scale(c1, u * (1 - v))), add(scale(c2, u * v), scale(c3, (1 - u) * v)));
        node_id = addNode(sub(point, bilinear));
      }
      grid[i].push(node_id);
    }
  }
  const quads = [];
  for (let i = 0; i < n_u; i++) {
    for (let j = 0; j < n_v; j++) quads.push([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]);
  }
  return quads;
}

/**
 * Triangulates the plate over a square lattice, recombines the triangles into quads and splits every element into quads
 * @returns {number[][]} quads, as lists of 4 node IDs
 */
function meshUnstructured(plate, mesh_size, getSideNodes, getPoint, addNode) {
  // Points of the coarse mesh (twice the mesh size, splitting halves it): node ID, or null for new nodes
  const points = [];
  const point_ids = [];
  const fixed = new Set();
  const addPoint = (point_2d, node_id = null) => {
    points.push(point_2d);
    point_ids.push(node_id);
    return points.length - 1;
  };

  // Boundary: every other node of each side, the nodes in between are the midpoints of the coarse boundary edges
  const boundary = [];
  const boundary_midpoints = {};
  plate.sides.forEach((side) => {
    const side_nodes = getSideNodes(side);
    for (let i = 0; i < side_nodes.length - 1; i += 2) {
      boundary.push(side_nodes[i]);
      boundary_midpoints[edgeKey(side_nodes[i], side_nodes[i + 2])] = side_nodes[i + 1];
    }
  });
  const boundary_index = boundary.map((node_id) => addPoint(plate.to2D(getPoint(node_id)), node_id));
  boundary_index.forEach((index) => fixed.add(index));
  const constraints = boundary_index.map((index, i) => [index, boundary_index[(i + 1) % boundary_index.length]]);
  const boundary_2d = boundary_index.map((index) => points[index]);

  plate.inner_nodes.forEach(({ id, point_2d }) => fixed.add(addPoint(point_2d, id)));

  // Square lattice along the local axes, away from the boundary and the fixed nodes
  const spacing = 2 * mesh_size;
  const xs = boundary_2d.map((point) => point[0]);
  const ys = boundary_2d.map((point) => point[1]);
  const [min_x, max_x, min_y, max_y] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const n_x = Math.round((max_x - min_x) / spacing);
  const n_y = Math.round((max_y - min_y) / spacing);
  const step_x = (max_x - min_x) / Math.max(1, n_x);
  const step_y = (max_y - min_y) / Math.max(1, n_y);
  const fixed_points = [...fixed].map((index) => points[index]);
  for (let i = 1; i < n_x; i++) {
    for (let j = 1; j < n_y; j++) {
      const point = [min_x + i * step_x, min_y + j * step_y];
      if (!isInsidePolygon(point, boundary_2d)) continue;
      if (distanceToPolygon(point, boundary_2d) < 0.45 * spacing) continue;
      if (fixed_points.some((other) => dist2(other, point) < 0.6 * spacing)) continue;
      addPoint(point);
    }
  }

  // Constrained Delaunay triangulation, counter-clockwise triangles
  const triangles = cdt2d(points, constraints, { exterior: false }).map((triangle) =>
    cross2(...triangle.map((index) => points[index])) < 0 ? [triangle[0], triangle[2], triangle[1]] : triangle
  );

  // Recombine pairs of triangles into quads, best quality first
  const triangles_by_edge = {};
  triangles.forEach((triangle, t) =>
    triangle.forEach((a, k) => {
      const key = edgeKey(a, triangle[(k + 1) % 3]);
      (triangles_by_edge[key] = triangles_by_edge[key] || []).push(t);
    })
  );
  const candidates = [];
  Object.values(triangles_by_edge).forEach((pair) => {
    if (pair.length !== 2) return;
    const [t1, t2] = pair;
    const quad = mergeTriangles(triangles[t1], triangles[t2]);
    const quality = quadQuality(quad.map((index) => points[index]));
    if (quality >= MIN_RECOMBINE_QUALITY) candidates.push({ t1, t2, quad, quality });
  });
  candidates.sort((a, b) => b.quality - a.quality);
  const used = new Set();
  const elements = [];
  candidates.forEach(({ t1, t2, quad }) => {
    if (used.has(t1) || used.has(t2)) return;
    used.add(t1);
    used.add(t2);
    elements.push(quad);
  });
  triangles.forEach((triangle, t) => {
    if (!used.has(t)) elements.push(triangle);
  });

  // Split: quads into 4 and triangles into 3, through the midpoints of their edges and their centers
  const midpoints = {};
  const getMidpoint = (a, b) => {
    const key = edgeKey(a, b);
    if (midpoints[key] === undefined) {
      const boundary_node = point_ids[a] !== null && point_ids[b] !== null ? boundary_midpoints[edgeKey(point_ids[a], point_ids[b])] : undefined;
      const point = [(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2];
      midpoints[key] = addPoint(boundary_node !== undefined ? plate.to2D(getPoint(boundary_node)) : point, boundary_node ?? null);
      if (boundary_node !== undefined) fixed.add(midpoints[key]);
    }
    return midpoints[key];
  };
  let quads = [];
  elements.forEach((element) => {
    const center = addPoint([0, 1].map((k) => element.reduce((sum, index) => sum + points[index][k], 0) / element.length));
    const mids = element.map((a, k) => getMidpoint(a, element[(k + 1) % element.length]));
    element.forEach((corner, k) => quads.push([corner, mids[k], center, mids[(k + element.length - 1) % element.length]]));
  });

  smooth(points, quads, fixed);

  // New nodes for the points that are not structural nodes yet
  const node_ids = points.map((point, index) => point_ids[index] ?? null);
  quads.forEach((quad) =>
    quad.forEach((index) => {
      if (node_ids[index] === null) node_ids[index] = addNode(plate.to3D(points[index]));
    })
  );
  return quads.map((quad) => quad.map((index) => node_ids[index]));
}

/**
 * Laplacian smoothing of the free points, a move is only kept if the quads around the point stay convex
 */
function smooth(points, quads, fixed) {
  const neighbors = points.map(() => new Set());
  const quads_of_point = points.map(() => []);
  quads.forEach((quad, q) =>
    quad.forEach((a, k) => {
      const b = quad[(k + 1) % 4];
      neighbors[a].add(b);
      neighbors[b].add(a);
      quads_of_point[a].push(q);
    })
  );
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    points.forEach((point, index) => {
      if (fixed.has(index) || neighbors[index].size === 0) return;
      const around = [...neighbors[index]];
      const target = [0, 1].map((k) => around.reduce((sum, other) => sum + points[other][k], 0) / around.length);
      points[index] = target;
      if (!quads_of_point[index].every((q) => isConvex(quads[q].map((other) => points[other])))) points[index] = point;
    });
  }
}

/**
 * Quad from two counter-clockwise triangles that share an edge, counter-clockwise too
 */
function mergeTriangles(t1, t2) {
  for (let k = 0; k < 3; k++) {
    const a = t1[k];
    const b = t1[(k + 1) % 3];
    if (t2.includes(a) && t2.includes(b)) {
      const opposite_1 = t1[(k + 2) % 3];
      const opposite_2 = t2.find((index) => index !== a && index !== b);
      return [a, opposite_2, b, opposite_1];
    }
  }
  return null;
}

/**
 * 1 for a rectangle, 0 or less for a quad with a corner of 180 degrees or that is not convex
 */
function quadQuality(quad_points) {
  if (!isConvex(quad_points)) return -1;
  let worst = 0;
  quad_points.forEach((point, k) => {
    const previous = quad_points[(k + 3) % 4];
    const next = quad_points[(k + 1) % 4];
    const u = [previous[0] - point[0], previous[1] - point[1]];
    const v = [next[0] - point[0], next[1] - point[1]];
    const angle = (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))) * 180) / Math.PI;
    worst = Math.max(worst, Math.abs(angle - 90));
  });
  return 1 - worst / 90;
}

/**
 * Whether a polygon is strictly convex, in either orientation
 */
function isConvex(polygon) {
  let sign = 0;
  for (let k = 0; k < polygon.length; k++) {
    const turn = cross2(polygon[k], polygon[(k + 1) % polygon.length], polygon[(k + 2) % polygon.length]);
    if (Math.abs(turn) < 1e-14) return false;
    if (sign === 0) sign = Math.sign(turn);
    else if (Math.sign(turn) !== sign) return false;
  }
  return true;
}

function isInsidePolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    // The edge crosses the horizontal line through the point, to its right
    const above_i = yi > y;
    const above_j = yj > y;
    if (above_i !== above_j && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point, polygon) {
  let distance = Infinity;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const length_2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length_2));
    distance = Math.min(distance, dist2(point, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]));
  });
  return distance;
}

function isSelfIntersecting(polygon) {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Edges that share a node
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const [a, b] = [polygon[i], polygon[(i + 1) % n]];
      const [c, d] = [polygon[j], polygon[(j + 1) % n]];
      if (Math.sign(cross2(a, b, c)) !== Math.sign(cross2(a, b, d)) && Math.sign(cross2(c, d, a)) !== Math.sign(cross2(c, d, b))) return true;
    }
  }
  return false;
}

/**
 * Angle in degrees, about the element normal, from the element's local x axis (node A to node B) to the parent plate's
 * local x axis. This is the rotZ of the meshed plates in SkyCiv.
 */
function getElementRotZ([a, b, , d], parent_x) {
  const element_x = normalize(sub(b, a));
  const element_z = normalize(cross(sub(b, a), sub(d, a)));
  return (Math.atan2(dot(cross(element_x, parent_x), element_z), dot(element_x, parent_x)) * 180) / Math.PI;
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Removes the mesh of a model (as in SkyCiv files): the meshed plates and the nodes that only they use
 * @param {import("../submodules/paramele-parsers/types").s3d_model} structure
 * @returns {{structure: import("../submodules/paramele-parsers/types").s3d_model, element_count: number, node_count: number}}
 */
function removeMesh(structure) {
  const meshed_plates = structure.meshed_plates || {};
  const element_count = Object.keys(meshed_plates).length;
  if (element_count === 0) return { structure, element_count: 0, node_count: 0 };
  const mesh_nodes = new Set();
  Object.values(meshed_plates).forEach(({ node_A, node_B, node_C, node_D }) =>
    [node_A, node_B, node_C, node_D].forEach((node_id) => node_id !== null && node_id !== undefined && mesh_nodes.add(String(node_id)))
  );
  // Nodes used by anything else stay
  const keep = (node_id) => node_id !== null && node_id !== undefined && mesh_nodes.delete(String(node_id));
  Object.values(structure.plates || {}).forEach(({ nodes }) => (typeof nodes === "string" ? nodes.split(",") : nodes || []).forEach(keep));
  Object.values(structure.members || {}).forEach(({ node_A, node_B }) => [node_A, node_B].forEach(keep));
  ["supports", "point_loads", "moments", "nodal_masses", "settlements"].forEach((key) =>
    Object.values(structure[key] || {}).forEach(({ node }) => keep(node))
  );
  const nodes = Object.fromEntries(Object.entries(structure.nodes).filter(([node_id]) => !mesh_nodes.has(node_id)));
  const plates = Object.fromEntries(Object.entries(structure.plates || {}).map(([plate_id, plate]) => [plate_id, { ...plate, isMeshed: false }]));
  return { structure: { ...structure, nodes, plates, meshed_plates: {} }, element_count, node_count: mesh_nodes.size };
}

/**
 * Triangles that fill the polygon of a plate, so a concave plate is drawn with its own shape and not its convex hull
 * @param {{x: number, y: number, z: number}[]} points Corners of the plate, in order
 * @returns {number[][]} triangles, as lists of 3 indexes of `points`
 */
function triangulatePolygon(points) {
  const fan = points.slice(2).map((_, i) => [0, i + 1, i + 2]);
  // Newell's normal, then the corners in a plane along it
  let normal = { x: 0, y: 0, z: 0 };
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    normal = add(normal, { x: (a.y - b.y) * (a.z + b.z), y: (a.z - b.z) * (a.x + b.x), z: (a.x - b.x) * (a.y + b.y) });
  });
  const first_edge = points.length > 1 ? sub(points[1], points[0]) : null;
  if (points.length < 4 || norm(normal) === 0 || !first_edge || norm(first_edge) === 0) return fan;
  normal = normalize(normal);
  const axis_x = normalize(sub(first_edge, scale(normal, dot(first_edge, normal))));
  const axis_y = cross(normal, axis_x);
  const polygon = points.map((point) => [dot(sub(point, points[0]), axis_x), dot(sub(point, points[0]), axis_y)]);
  if (isSelfIntersecting(polygon)) return fan;
  try {
    const constraints = polygon.map((_, i) => [i, (i + 1) % polygon.length]);
    const triangles = cdt2d(polygon, constraints, { exterior: false });
    return triangles.length > 0 ? triangles : fan;
  } catch {
    return fan;
  }
}

/**
 * Local axes of a plate (as in SkyCiv: x along the first edge turned rotZ degrees about the normal, z the normal by the order
 * of the nodes, y = z cross x), points spread over it, at the centers of a grid of cells along its axes, and points along
 * its edges (its corners included), about a cell apart
 * @param {{x: number, y: number, z: number}[]} points Corners of the plate, in order
 * @param {number} [rot_z] rotZ of the plate, in degrees
 * @param {number} [divisions] Cells along the longest side
 * @returns {{axes: {x: object, y: object, z: object}, centroid: object, points: {x: number, y: number, z: number}[],
 *  edge_points: {x: number, y: number, z: number}[]}|null}
 */
function getPlateSurfacePoints(points, rot_z = 0, divisions = 5) {
  if (points.length < 3) return null;
  let normal = { x: 0, y: 0, z: 0 };
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    normal = add(normal, { x: (a.y - b.y) * (a.z + b.z), y: (a.z - b.z) * (a.x + b.x), z: (a.x - b.x) * (a.y + b.y) });
  });
  const first_edge = sub(points[1], points[0]);
  if (norm(normal) === 0 || norm(first_edge) === 0) return null;
  normal = normalize(normal);
  const edge_x = normalize(sub(first_edge, scale(normal, dot(first_edge, normal))));
  const edge_y = cross(normal, edge_x);
  const angle = ((Number(rot_z) || 0) * Math.PI) / 180;
  const axis_x = add(scale(edge_x, Math.cos(angle)), scale(edge_y, Math.sin(angle)));
  const axis_y = cross(normal, axis_x);
  const centroid = scale(points.reduce(add, { x: 0, y: 0, z: 0 }), 1 / points.length);
  const polygon = points.map((point) => [dot(sub(point, points[0]), axis_x), dot(sub(point, points[0]), axis_y)]);
  const us = polygon.map(([u]) => u);
  const vs = polygon.map(([, v]) => v);
  const [u_min, u_max, v_min, v_max] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const cell = Math.max(u_max - u_min, v_max - v_min) / divisions;
  const u_cells = Math.max(1, Math.round((u_max - u_min) / cell));
  const v_cells = Math.max(1, Math.round((v_max - v_min) / cell));
  const surface_points = [];
  for (let i = 0; i < u_cells; i++) {
    for (let j = 0; j < v_cells; j++) {
      const u = u_min + ((i + 0.5) * (u_max - u_min)) / u_cells;
      const v = v_min + ((j + 0.5) * (v_max - v_min)) / v_cells;
      if (isInsidePolygon([u, v], polygon)) surface_points.push(add(add(points[0], scale(axis_x, u)), scale(axis_y, v)));
    }
  }
  // A thin or odd shape may leave every cell center outside
  if (surface_points.length === 0) surface_points.push(centroid);
  const edge_points = [];
  points.forEach((a, i) => {
    const edge = sub(points[(i + 1) % points.length], a);
    const segments = Math.max(1, Math.round(norm(edge) / cell));
    for (let k = 0; k < segments; k++) edge_points.push(add(a, scale(edge, k / segments)));
  });
  return { axes: { x: axis_x, y: axis_y, z: normal }, centroid, points: surface_points, edge_points };
}

const mesher = { meshStructure, removeMesh, triangulatePolygon, getPlateSurfacePoints };
export default mesher;
