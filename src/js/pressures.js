// Linear pressures on plates, in SkyCiv's format: load_distribution "linear", a single component along load_direction ("X",
// "Y" or "Z" of its axes) whose magnitude varies linearly over the plate, given at three points (p1..p3_point_id, node IDs,
// with p1..p3_magnitude): the magnitude at any point of the plate is on the plane through those three values (e.g. a
// hydrostatic pressure, zero at the water level). Both solvers take them as they are.

const DIRECTIONS = ["X", "Y", "Z"];
const POINT_KEYS = ["p1", "p2", "p3"];
const AXES = ["x", "y", "z"];

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * @param {import("../submodules/paramele-parsers/types").s3d_pressure} pressure
 * @returns {boolean} Whether its magnitude varies over the plate
 */
function isLinear(pressure) {
  return pressure?.load_distribution === "linear";
}

/**
 * Magnitude of a linear pressure at a point: on the plane through its three values, measured in the plane of its three points
 * @param {import("../submodules/paramele-parsers/types").s3d_pressure} pressure
 * @param {Object<string, {x: number, y: number, z: number}>} nodes
 * @returns {function({x: number, y: number, z: number}): number|null} null when a point is missing
 */
function getLinearField(pressure, nodes) {
  let points = POINT_KEYS.map((key) => nodes[pressure[`${key}_point_id`]]);
  let magnitudes = POINT_KEYS.map((key) => Number(pressure[`${key}_magnitude`]) || 0);
  if (points.some((point) => !point)) return null;
  // Gradient in the plane of the points: g = a e1 + b e2, with g · e1 = m2 - m1 and g · e2 = m3 - m1
  let e1 = sub(points[1], points[0]);
  let e2 = sub(points[2], points[0]);
  let [g11, g12, g22] = [dot(e1, e1), dot(e1, e2), dot(e2, e2)];
  let determinant = g11 * g22 - g12 * g12;
  let [d1, d2] = [magnitudes[1] - magnitudes[0], magnitudes[2] - magnitudes[0]];
  // Points in a line: only the first magnitude is known everywhere
  if (!(Math.abs(determinant) > 1e-12 * g11 * g22)) return () => magnitudes[0];
  let a = (d1 * g22 - d2 * g12) / determinant;
  let b = (d2 * g11 - d1 * g12) / determinant;
  let gradient = { x: a * e1.x + b * e2.x, y: a * e1.y + b * e2.y, z: a * e1.z + b * e2.z };
  return (point) => magnitudes[0] + dot(gradient, sub(point, points[0]));
}

/**
 * Components of a pressure at the points of its plate, in the axes of the pressure (global, or the plate's local axes)
 * @param {import("../submodules/paramele-parsers/types").s3d_pressure} pressure
 * @param {Object<string, {x: number, y: number, z: number}>} nodes
 * @returns {function({x: number, y: number, z: number}): {x: number, y: number, z: number}}
 */
function getPressureField(pressure, nodes) {
  if (!isLinear(pressure)) {
    let components = Object.fromEntries(AXES.map((axis) => [axis, Number(pressure[`${axis}_mag`]) || 0]));
    return () => components;
  }
  let field = getLinearField(pressure, nodes);
  let direction = String(pressure.load_direction || "").toLowerCase();
  return (point) => {
    let magnitude = field && AXES.includes(direction) ? field(point) : 0;
    return Object.fromEntries(AXES.map((axis) => [axis, axis === direction ? magnitude : 0]));
  };
}

/**
 * Largest magnitude a pressure has at its points (to scale the loads drawn)
 * @param {import("../submodules/paramele-parsers/types").s3d_pressure} pressure
 */
function getMaxMagnitude(pressure) {
  if (isLinear(pressure)) return Math.max(...POINT_KEYS.map((key) => Math.abs(Number(pressure[`${key}_magnitude`]) || 0)));
  return Math.hypot(...AXES.map((axis) => Number(pressure[`${axis}_mag`]) || 0));
}

const pressures = { DIRECTIONS, POINT_KEYS, isLinear, getPressureField, getMaxMagnitude };
export default pressures;
