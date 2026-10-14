import mesher from "./mesher";

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => Math.sqrt(dot(a, a));

function makeStructure(nodes, plates) {
  return {
    nodes: Object.fromEntries(nodes.map(([x, y, z], i) => [String(i + 1), { x, y, z }])),
    plates: Object.fromEntries(plates.map((node_ids, i) => [String(i + 1), { nodes: node_ids, thickness: 200, material_id: 1, rotZ: 0 }])),
    meshed_plates: {},
  };
}

function quadsOf(structure, plate_id) {
  return Object.values(structure.meshed_plates)
    .filter(({ parent_plate }) => plate_id === undefined || parent_plate === Number(plate_id))
    .map(({ node_A, node_B, node_C, node_D }) => [node_A, node_B, node_C, node_D]);
}

// Area vector of a polygon (its length is the area, its direction the normal)
function areaVector(points) {
  let total = { x: 0, y: 0, z: 0 };
  points.forEach((a, i) => {
    const c = cross(a, points[(i + 1) % points.length]);
    total = { x: total.x + c.x / 2, y: total.y + c.y / 2, z: total.z + c.z / 2 };
  });
  return total;
}

/**
 * Every quad is convex, faces the plate normal, and the quads cover the plate exactly
 */
function expectValidMesh(structure, plate_id) {
  const plate_points = structure.plates[plate_id].nodes.map((id) => structure.nodes[id]);
  const plate_area = areaVector(plate_points);
  const normal = { x: plate_area.x / norm(plate_area), y: plate_area.y / norm(plate_area), z: plate_area.z / norm(plate_area) };
  let total_area = 0;
  const quads = quadsOf(structure, plate_id);
  expect(quads.length).toBeGreaterThan(0);
  quads.forEach((quad) => {
    const points = quad.map((id) => structure.nodes[id]);
    expect(new Set(quad).size).toBe(4);
    points.forEach((point, k) => {
      const turn = cross(sub(points[(k + 1) % 4], point), sub(points[(k + 2) % 4], points[(k + 1) % 4]));
      expect(dot(turn, normal)).toBeGreaterThan(0);
    });
    total_area += dot(areaVector(points), normal);
  });
  expect(total_area).toBeCloseTo(norm(plate_area), 6);
}

/**
 * Every element edge is shared by two elements, unless it is on the outline of the plates (no hanging nodes)
 */
function expectConforming(structure, outline_edges) {
  const count = {};
  quadsOf(structure).forEach((quad) =>
    quad.forEach((a, k) => {
      const b = quad[(k + 1) % 4];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      count[key] = (count[key] || 0) + 1;
    })
  );
  Object.entries(count).forEach(([key, times]) => {
    if (times === 2) return;
    expect(times).toBe(1);
    const [a, b] = key.split("-").map((id) => structure.nodes[id]);
    const on_outline = outline_edges.some(([p, q]) => {
      const [P, Q] = [structure.nodes[p], structure.nodes[q]];
      return norm(cross(sub(Q, P), sub(a, P))) < 1e-9 && norm(cross(sub(Q, P), sub(b, P))) < 1e-9;
    });
    expect(on_outline).toBe(true);
  });
}

test("meshes a rectangle into a structured grid", () => {
  const structure = makeStructure(
    [
      [0, 0, 0],
      [2, 0, 0],
      [2, 1, 0],
      [0, 1, 0],
    ],
    [[1, 2, 3, 4]]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.5 });
  expect(result.skipped).toEqual([]);
  expect(result.element_count).toBe(8);
  expect(result.node_ids.length).toBe(15 - 4);
  expect(result.structure.plates["1"].isMeshed).toBe(true);
  expectValidMesh(result.structure, "1");
  // The input is not changed
  expect(Object.keys(structure.nodes).length).toBe(4);
  expect(structure.meshed_plates).toEqual({});
});

test("meshes a rotated, vertical plate", () => {
  const structure = makeStructure(
    [
      [0, 0, 0],
      [3, 3, 0],
      [3, 3, 2],
      [0, 0, 2],
    ],
    [[1, 2, 3, 4]]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.5 });
  expectValidMesh(result.structure, "1");
  Object.values(result.structure.nodes).forEach(({ x, y }) => expect(x).toBeCloseTo(y, 9));
});

test("meshes a concave polygon and a triangle with shared nodes on their common edges", () => {
  // L-shaped plate and a triangle on its top edge, in a vertical XZ plane
  const structure = makeStructure(
    [
      [0, 0, 0],
      [3, 0, 0],
      [3, 0, 1],
      [1, 0, 1],
      [1, 0, 3],
      [0, 0, 3],
      [0.5, 0, 4],
    ],
    [
      [1, 2, 3, 4, 5, 6],
      [6, 5, 7],
    ]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.3 });
  expect(result.skipped).toEqual([]);
  expectValidMesh(result.structure, "1");
  expectValidMesh(result.structure, "2");
  expectConforming(result.structure, [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 7],
    [7, 6],
    [6, 1],
  ]);
});

test("structured plates next to each other share the divisions of their common edges", () => {
  // A wide and a narrow rectangle side by side, and a trapezoid below the wide one
  const structure = makeStructure(
    [
      [0, 0, 0],
      [4, 0, 0],
      [4, 2, 0],
      [0, 2, 0],
      [5, 0, 0],
      [5, 2, 0],
      [0.5, -1, 0],
      [3, -1, 0],
    ],
    [
      [1, 2, 3, 4],
      [2, 5, 6, 3],
      [7, 8, 2, 1],
    ]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.45 });
  ["1", "2", "3"].forEach((plate_id) => expectValidMesh(result.structure, plate_id));
  expectConforming(result.structure, [
    [1, 4],
    [4, 6],
    [6, 5],
    [5, 2],
    [2, 8],
    [8, 7],
    [7, 1],
  ]);
});

test("nodes on a plate become mesh nodes", () => {
  // Square with a node in the middle (a point load) and a node on one edge (a column)
  const structure = makeStructure(
    [
      [0, 0, 0],
      [4, 0, 0],
      [4, 4, 0],
      [0, 4, 0],
      [2.1, 1.7, 0],
      [4, 1.3, 0],
      [2, 2, 5],
    ],
    [[1, 2, 3, 4]]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.5 });
  expectValidMesh(result.structure, "1");
  const used = new Set(quadsOf(result.structure).flat());
  expect(used.has(5)).toBe(true);
  expect(used.has(6)).toBe(true);
  // Not on the plate
  expect(used.has(7)).toBe(false);
});

test("reads plates with their nodes as a string, as in SkyCiv files", () => {
  const structure = makeStructure(
    [
      [1.4, -0.6, 0],
      [1.4, 1.4, 0],
      [-0.6, 1.4, 0],
      [0, 0.6, 0],
      [-0.6, 0.6, 0],
      [0, 0, 0],
    ],
    []
  );
  structure.plates["1"] = { nodes: "1,2,3,4,5,6", thickness: 5, material_id: 1, rotZ: 0 };
  const result = mesher.meshStructure(structure, { mesh_size: 0.2 });
  expect(result.skipped).toEqual([]);
  result.structure.plates["1"].nodes = [1, 2, 3, 4, 5, 6];
  expectValidMesh(result.structure, "1");
});

test("rotZ is the angle from the element x axis (A to B) to the plate x axis (first edge)", () => {
  const structure = makeStructure(
    [
      [0, 0, 0],
      [0, 2, 0],
      [-2, 2, 0],
      [-2, 1, 0],
      [-1, 1, 0],
      [-1, 0, 0],
    ],
    [[1, 2, 3, 4, 5, 6]]
  );
  const { structure: meshed } = mesher.meshStructure(structure, { mesh_size: 0.25 });
  Object.values(meshed.meshed_plates).forEach(({ node_A, node_B, rotZ }) => {
    const [a, b] = [meshed.nodes[node_A], meshed.nodes[node_B]];
    // The plate x axis is +Y, rotating the element x axis by rotZ about +Z must give it
    const angle = Math.atan2(b.y - a.y, b.x - a.x) + (rotZ * Math.PI) / 180;
    expect(Math.cos(angle)).toBeCloseTo(0, 9);
    expect(Math.sin(angle)).toBeCloseTo(1, 9);
  });
});

test("skips plates that cannot be meshed and keeps going", () => {
  const structure = makeStructure(
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [2, 0, 0],
      [2, 1, 1],
      [3, 1, 0],
      [3, 0, 0.5],
      [2.5, 0.5, 3],
    ],
    [
      [1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [1, 3, 2, 4],
    ]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.5 });
  expect(result.skipped.map(({ plate_id }) => plate_id).sort()).toEqual(["2", "3"]);
  expect(result.structure.plates["2"].isMeshed).toBe(false);
  expectValidMesh(result.structure, "1");
});

/**
 * Largest deviation from 90 degrees of a corner of the quads of a plate
 */
function worstAngle(structure, plate_id) {
  let worst = 0;
  quadsOf(structure, plate_id).forEach((quad) => {
    const points = quad.map((id) => structure.nodes[id]);
    points.forEach((point, k) => {
      const u = sub(points[(k + 1) % 4], point);
      const v = sub(points[(k + 3) % 4], point);
      const angle = (Math.acos(dot(u, v) / (norm(u) * norm(v))) * 180) / Math.PI;
      worst = Math.max(worst, Math.abs(angle - 90));
    });
  });
  return worst;
}

test("meshes rectilinear plates into rectangles, through the nodes on them", () => {
  // L-shaped plate, tilted out of the XY plane, with a node inside it
  const tilt = (x, y) => [x, y * Math.cos(0.4), y * Math.sin(0.4)];
  const structure = makeStructure(
    [tilt(6, 0), tilt(9, 0), tilt(9, 1.5), tilt(7.5, 1.5), tilt(7.5, 4), tilt(6, 4), tilt(6.8, 2.3)],
    [[1, 2, 3, 4, 5, 6]]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.5 });
  expectValidMesh(result.structure, "1");
  expect(worstAngle(result.structure, "1")).toBeLessThan(1e-6);
  expect(new Set(quadsOf(result.structure).flat()).has(7)).toBe(true);
});

test("the cuts of a rectilinear plate spread to its neighbors through their shared edges", () => {
  // An L-shaped slab, a rectangle on its long edge (its inner corner cuts that edge), a trapezoid next to the
  // rectangle, and a wall below the slab
  const structure = makeStructure(
    [
      [0, 0, 0],
      [4, 0, 0],
      [4, 1.3, 0],
      [1.7, 1.3, 0],
      [1.7, 3, 0],
      [0, 3, 0],
      [-2, 0, 0],
      [-2, 3, 0],
      [-3, 0.5, 0],
      [-3, 2.5, 0],
      [0, 0, -2],
      [4, 0, -2],
    ],
    [
      [1, 2, 3, 4, 5, 6],
      [7, 1, 6, 8],
      [9, 7, 8, 10],
      [11, 12, 2, 1],
    ]
  );
  const result = mesher.meshStructure(structure, { mesh_size: 0.4 });
  expect(result.skipped).toEqual([]);
  ["1", "2", "3", "4"].forEach((plate_id) => expectValidMesh(result.structure, plate_id));
  ["1", "2", "4"].forEach((plate_id) => expect(worstAngle(result.structure, plate_id)).toBeLessThan(1e-6));
  expectConforming(result.structure, [
    [9, 7],
    [7, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 8],
    [8, 10],
    [10, 9],
    [1, 11],
    [11, 12],
    [12, 2],
  ]);
});

test("removing the mesh keeps the nodes used by anything else", () => {
  const structure = makeStructure(
    [
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
      [0, 2, 0],
      [1, 1, 0],
    ],
    [[1, 2, 3, 4]]
  );
  structure.point_loads = { 1: { node: 5, x_mag: 0, y_mag: 0, z_mag: -10, load_group: "LG", type: "N" } };
  const { structure: meshed, node_ids } = mesher.meshStructure(structure, { mesh_size: 0.5 });
  const { structure: unmeshed, element_count, node_count } = mesher.removeMesh(meshed);
  expect(element_count).toBe(Object.keys(meshed.meshed_plates).length);
  expect(node_count).toBe(node_ids.length);
  expect(Object.keys(unmeshed.nodes).sort()).toEqual(["1", "2", "3", "4", "5"]);
  expect(unmeshed.meshed_plates).toEqual({});
  expect(unmeshed.plates["1"].isMeshed).toBe(false);
});

test("a concave polygon is triangulated inside its own outline", () => {
  // L shape in a vertical plane: its convex hull would cover the missing corner [1..2, 1..2]
  const points = [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ].map(([u, v]) => ({ x: u, y: 0, z: v }));
  const triangles = mesher.triangulatePolygon(points);
  expect(triangles).toHaveLength(4);
  const area = triangles.reduce((total, [a, b, c]) => {
    const [p, q, r] = [points[a], points[b], points[c]];
    return total + Math.abs((q.x - p.x) * (r.z - p.z) - (r.x - p.x) * (q.z - p.z)) / 2;
  }, 0);
  expect(area).toBeCloseTo(3);
});
