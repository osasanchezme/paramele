// 3D symbols of the supports, built from their restraint code (Tx Ty Tz Rx Ry Rz, each F fixed, R released or S spring):
// - Vertical restraint (Tz): a pyramid under the node, or a block when no rotation is released. A spring in Tz adds a coil above it.
// - Horizontal restraints (Tx, Ty) under a vertical one: hatched ground when both are fixed, rollers along the released ones
//   (cylinders for one direction, balls for both). A horizontal spring adds a coil from the base to a wall.
// - Without a vertical restraint, each restrained horizontal direction gets its own pyramid (or coil) against a wall.
// - Released rotations are marks around their axis at the node: arches over it for Rx and Ry, a ring for Rz. Rotational springs
//   are the same marks, wavy. A rotation without a mark is fixed.

const SUPPORT_SIZE = 0.6;
const SOLID_COLOR = "#A0AEC0";
const LINE_COLOR = "#2D3748";
const ROTATION_COLOR = "#2B6CB0";
const CIRCLE_SEGMENTS = 24;
const AXES = ["x", "y", "z"];
// Frames of the restraint along each axis: w points from the node to the ground, u and v span the ground
const FRAMES = {
  x: { u: [0, 1, 0], v: [0, 0, 1], w: [-1, 0, 0] },
  y: { u: [1, 0, 0], v: [0, 0, 1], w: [0, -1, 0] },
  z: { u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, -1] },
};
const UNIT = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
// a + b·kb + c·kc + d·kd
const offset = (a, b, kb, c = UNIT.x, kc = 0, d = UNIT.x, kd = 0) => add(add(add(a, scale(b, kb)), scale(c, kc)), scale(d, kd));
const perpendicular = (axis) => AXES.filter((other) => other !== axis).map((other) => UNIT[other]);

/**
 * Restraint of each degree of freedom, anything that is not F or S is released
 * @param {string} restraint_code
 * @returns {{t: Object<string, "F"|"R"|"S">, r: Object<string, "F"|"R"|"S">}}
 */
function parseRestraintCode(restraint_code) {
  let code = String(restraint_code || "FFFFFF").toUpperCase();
  let dof = (index) => (code[index] === "F" || code[index] === "S" ? code[index] : "R");
  return { t: { x: dof(0), y: dof(1), z: dof(2) }, r: { x: dof(3), y: dof(4), z: dof(5) } };
}

function createBuilder() {
  return { mesh: { x: [], y: [], z: [], i: [], j: [], k: [] }, lines: { x: [], y: [], z: [] }, rotation_lines: { x: [], y: [], z: [] } };
}

function pushVertices(builder, points) {
  let first = builder.mesh.x.length;
  points.forEach(([x, y, z]) => {
    builder.mesh.x.push(x);
    builder.mesh.y.push(y);
    builder.mesh.z.push(z);
  });
  return first;
}

function pushTriangles(builder, first, triangles) {
  triangles.forEach(([a, b, c]) => {
    builder.mesh.i.push(first + a);
    builder.mesh.j.push(first + b);
    builder.mesh.k.push(first + c);
  });
}

// Polylines are separated by nulls, so all the supports fit in one trace
function pushPolyline(lines, points) {
  points.forEach(([x, y, z]) => {
    lines.x.push(x);
    lines.y.push(y);
    lines.z.push(z);
  });
  lines.x.push(null);
  lines.y.push(null);
  lines.z.push(null);
}

/** Arc from angle from to angle to, wave makes its radius go up and down by that fraction (a spring) */
function arcPoints(center, a, b, radius, from, to, wave = 0) {
  let points = [];
  let segments = Math.max(2, Math.round((CIRCLE_SEGMENTS * Math.abs(to - from)) / (2 * Math.PI)));
  if (wave) segments *= 4;
  for (let s = 0; s <= segments; s++) {
    let angle = from + ((to - from) * s) / segments;
    let r = radius * (1 + wave * Math.sin(12 * angle));
    points.push(offset(center, a, r * Math.cos(angle), b, r * Math.sin(angle)));
  }
  return points;
}

function circlePoints(center, a, b, radius) {
  return arcPoints(center, a, b, radius, 0, 2 * Math.PI);
}

/** Corners of a square of side 2·half centered at center, in the plane of a and b */
function squareCorners(center, a, b, half) {
  return [offset(center, a, -half, b, -half), offset(center, a, half, b, -half), offset(center, a, half, b, half), offset(center, a, -half, b, half)];
}

function addPyramid(builder, apex, { u, v, w }, height, half) {
  let base = squareCorners(offset(apex, w, height), u, v, half);
  let first = pushVertices(builder, [apex, ...base]);
  pushTriangles(builder, first, [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [1, 2, 3],
    [1, 3, 4],
  ]);
  base.forEach((corner) => pushPolyline(builder.lines, [apex, corner]));
  pushPolyline(builder.lines, [...base, base[0]]);
}

/** Box whose top face is centered at top and that goes down along w */
function addBlock(builder, top, { u, v, w }, half, height) {
  let top_corners = squareCorners(top, u, v, half);
  let bottom_corners = top_corners.map((corner) => offset(corner, w, height));
  let first = pushVertices(builder, [...top_corners, ...bottom_corners]);
  pushTriangles(builder, first, [
    [0, 1, 2],
    [0, 2, 3],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ]);
  pushPolyline(builder.lines, [...top_corners, top_corners[0]]);
  pushPolyline(builder.lines, [...bottom_corners, bottom_corners[0]]);
  top_corners.forEach((corner, index) => pushPolyline(builder.lines, [corner, bottom_corners[index]]));
}

/** Ground under a support: a square with hatching that goes away from the support along w */
function addGround(builder, center, { u, v, w }, half) {
  let corners = squareCorners(center, u, v, half);
  pushPolyline(builder.lines, [...corners, corners[0]]);
  let hatch_length = 0.18 * SUPPORT_SIZE;
  let hatches = 5;
  corners.forEach((corner, index) => {
    let next = corners[(index + 1) % 4];
    for (let h = 0; h < hatches; h++) {
      let t = (h + 0.5) / hatches;
      let start = add(scale(corner, 1 - t), scale(next, t));
      pushPolyline(builder.lines, [start, offset(start, w, hatch_length, u, -hatch_length * 0.6)]);
    }
  });
}

/** Cylinder of the given radius and half length along axis */
function addCylinder(builder, center, axis, a, b, radius, half_length) {
  let ends = [offset(center, axis, -half_length), offset(center, axis, half_length)];
  let rings = ends.map((end) => circlePoints(end, a, b, radius).slice(0, CIRCLE_SEGMENTS));
  let first = pushVertices(builder, [...rings[0], ...rings[1], ...ends]);
  let triangles = [];
  for (let s = 0; s < CIRCLE_SEGMENTS; s++) {
    let next = (s + 1) % CIRCLE_SEGMENTS;
    triangles.push([s, next, CIRCLE_SEGMENTS + next], [s, CIRCLE_SEGMENTS + next, CIRCLE_SEGMENTS + s]);
    triangles.push([2 * CIRCLE_SEGMENTS, s, next], [2 * CIRCLE_SEGMENTS + 1, CIRCLE_SEGMENTS + next, CIRCLE_SEGMENTS + s]);
  }
  pushTriangles(builder, first, triangles);
  rings.forEach((ring) => pushPolyline(builder.lines, [...ring, ring[0]]));
}

function addBall(builder, center, radius) {
  let rows = 6;
  let columns = 10;
  let points = [];
  for (let r = 0; r <= rows; r++) {
    let polar = (Math.PI * r) / rows;
    for (let c = 0; c < columns; c++) {
      let azimuth = (2 * Math.PI * c) / columns;
      points.push(
        offset(
          center,
          UNIT.x,
          radius * Math.sin(polar) * Math.cos(azimuth),
          UNIT.y,
          radius * Math.sin(polar) * Math.sin(azimuth),
          UNIT.z,
          radius * Math.cos(polar)
        )
      );
    }
  }
  let first = pushVertices(builder, points);
  let triangles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      let a = r * columns + c;
      let b = r * columns + ((c + 1) % columns);
      triangles.push([a, b, b + columns], [a, b + columns, a + columns]);
    }
  }
  pushTriangles(builder, first, triangles);
  let equator = circlePoints(center, UNIT.x, UNIT.y, radius);
  pushPolyline(builder.lines, equator);
}

/** Coil from start along direction, its zigzag goes along side */
function addSpring(lines, start, direction, side, length) {
  let lead = 0.15 * length;
  let zigs = 6;
  let amplitude = 0.12 * SUPPORT_SIZE;
  let points = [start, offset(start, direction, lead)];
  for (let z = 0; z < zigs; z++) {
    let t = lead + ((z + 0.5) / zigs) * (length - 2 * lead);
    points.push(offset(start, direction, t, side, z % 2 === 0 ? amplitude : -amplitude));
  }
  points.push(offset(start, direction, length - lead), offset(start, direction, length));
  pushPolyline(lines, points);
}

/** Rollers between a support's base (centered at base) and the ground, along the released horizontal directions */
function addRollers(builder, base, frame, half, free) {
  let radius = 0.1 * SUPPORT_SIZE;
  let center = offset(base, frame.w, radius);
  // Rollers stick out of the body's footprint, so they can be seen from above
  if (free.x && free.y) {
    let spots = [-half, half];
    spots.forEach((du) => spots.forEach((dv) => addBall(builder, offset(center, frame.u, du, frame.v, dv), radius)));
  } else {
    // Cylinders roll along the released direction, their axis is the other one
    let roll = free.x ? frame.u : frame.v;
    let axis = free.x ? frame.v : frame.u;
    [-0.6 * half, 0.6 * half].forEach((d) => addCylinder(builder, offset(center, roll, d), axis, roll, frame.w, radius, half * 1.3));
  }
  return 2 * radius;
}

function addRotationMarks(builder, node, rotations) {
  let radius = 0.3 * SUPPORT_SIZE;
  AXES.forEach((axis) => {
    if (rotations[axis] === "F") return;
    let [a, b] = perpendicular(axis);
    // Rx and Ry are arches over the node (b is Z), so they stay out of the support's body: both together make a dome, a ball joint
    let points = axis === "z" ? circlePoints(node, a, b, radius) : arcPoints(node, a, b, radius, 0, Math.PI);
    // A rotational spring is the same mark, wavy
    if (rotations[axis] === "S") points = arcPoints(node, a, b, radius, 0, axis === "z" ? 2 * Math.PI : Math.PI, 0.12);
    pushPolyline(builder.rotation_lines, points);
  });
}

/**
 * Adds the symbol of one support to the builder
 * @returns {{x: number, y: number, z: number}} Point to click the support
 */
function addSupport(builder, restraint_code, node) {
  let { t, r } = parseRestraintCode(restraint_code);
  let size = SUPPORT_SIZE;
  let half = size / 2;
  let origin = [node.x, node.y, node.z];
  let handle = origin;
  addRotationMarks(builder, origin, r);
  let any_rotation_released = AXES.some((axis) => r[axis] !== "F");

  if (t.z !== "R") {
    let frame = FRAMES.z;
    let top = origin;
    if (t.z === "S") {
      addSpring(builder.lines, origin, frame.w, frame.u, 0.5 * size);
      top = offset(origin, frame.w, 0.5 * size);
    }
    let body_height = any_rotation_released ? 0.75 * size : 0.4 * size;
    if (any_rotation_released) addPyramid(builder, top, frame, body_height, half);
    else addBlock(builder, top, frame, half, body_height);
    let base = offset(top, frame.w, body_height);
    handle = offset(top, frame.w, body_height / 2);
    let free = { x: t.x !== "F", y: t.y !== "F" };
    if (free.x || free.y) base = offset(base, frame.w, addRollers(builder, base, frame, half, free));
    addGround(builder, base, frame, half * 1.4);
    // A horizontal spring goes from the middle of the base to a wall
    ["x", "y"].forEach((axis) => {
      if (t[axis] !== "S") return;
      let side_frame = FRAMES[axis];
      let start = offset(top, frame.w, body_height * 0.8, side_frame.w, half * 0.8);
      addSpring(builder.lines, start, side_frame.w, frame.w, 0.6 * size);
      addGround(builder, offset(start, side_frame.w, 0.6 * size), side_frame, half * 0.4);
    });
    return { x: handle[0], y: handle[1], z: handle[2] };
  }

  let drawn = false;
  ["x", "y"].forEach((axis) => {
    if (t[axis] === "R") return;
    let frame = FRAMES[axis];
    let length = t[axis] === "F" ? 0.6 * size : size;
    if (t[axis] === "F") addPyramid(builder, origin, frame, length, half * 0.7);
    else addSpring(builder.lines, origin, frame.w, frame.v, length);
    addGround(builder, offset(origin, frame.w, length), frame, half * 0.7);
    if (!drawn) handle = offset(origin, frame.w, length / 2);
    drawn = true;
  });
  // Only rotations restrained: a small block at the node so the support can be seen and clicked
  if (!drawn && !AXES.every((axis) => r[axis] === "R")) addBlock(builder, offset(origin, FRAMES.z.w, -0.1 * size), FRAMES.z, 0.1 * size, 0.2 * size);
  return { x: handle[0], y: handle[1], z: handle[2] };
}

/** Plotly traces of all the supports' symbols (empty traces are left out) */
function getTraces(builder) {
  let traces = [];
  if (builder.mesh.i.length > 0)
    traces.push({
      ...builder.mesh,
      type: "mesh3d",
      color: SOLID_COLOR,
      hoverinfo: "none",
      flatshading: true,
      lighting: { ambient: 0.6, diffuse: 0.6, specular: 0.05, roughness: 0.9, fresnel: 0 },
      lightposition: { x: 1000, y: 2000, z: 3000 },
    });
  if (builder.lines.x.length > 0)
    traces.push({ ...builder.lines, type: "scatter3d", mode: "lines", hoverinfo: "none", line: { width: 2, color: LINE_COLOR } });
  if (builder.rotation_lines.x.length > 0)
    traces.push({ ...builder.rotation_lines, type: "scatter3d", mode: "lines", hoverinfo: "none", line: { width: 3, color: ROTATION_COLOR } });
  return traces;
}

const supportGlyphs = { createBuilder, addSupport, getTraces, parseRestraintCode };
export default supportGlyphs;
