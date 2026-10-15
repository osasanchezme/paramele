// Solids of the 3D view: the sections extruded along the members and the plates with their thickness. Section dimensions and
// plate thicknesses are in section_length units (mm, as in SkyCiv), the nodes in length units.
import { units } from "../submodulesAPI";
import mesher from "./mesher";
import resultsLayer from "./resultsLayer";

// Points of the outline of a circular section
const CIRCLE_SEGMENTS = 16;
const SOLID_LIGHTING = { ambient: 0.65, diffuse: 0.5, specular: 0.05, roughness: 1, fresnel: 0 };

/**
 * Factor from section_length units to length units, 1 when the units are unknown
 * @param {{length?: string, section_length?: string}} [model_units]
 */
function getSectionScale(model_units) {
  if (!model_units?.section_length || !model_units?.length) return 1;
  try {
    return units.convert(1, model_units.section_length, model_units.length);
  } catch {
    return 1;
  }
}

/**
 * Outline of a section in its plane as [y, z] points in length units, h along the local y axis and b along z (as the solver
 * takes them), null for sections without a shape (generic sections)
 * @param {object} section
 * @param {number} scale From section_length to length units
 * @returns {number[][]|null}
 */
function getSectionOutline(section, scale) {
  let { shape, dimensions = {} } = section?.info || {};
  if (shape === "rectangle") {
    let h = (Number(dimensions.h) * scale) / 2;
    let b = (Number(dimensions.b) * scale) / 2;
    if (!(h > 0 && b > 0)) return null;
    return [
      [-h, -b],
      [h, -b],
      [h, b],
      [-h, b],
    ];
  }
  if (shape === "circle") {
    let radius = (Number(dimensions.D) * scale) / 2;
    if (!(radius > 0)) return null;
    return Array.from({ length: CIRCLE_SEGMENTS }, (_, k) => {
      let angle = (2 * Math.PI * k) / CIRCLE_SEGMENTS;
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    });
  }
  return null;
}

function getEmptySolid(color, opacity) {
  return { x: [], y: [], z: [], i: [], j: [], k: [], type: "mesh3d", color, opacity, hoverinfo: "none", flatshading: true, lighting: SOLID_LIGHTING };
}

/**
 * Adds a prism to a solid: two rings of the same outline, joined by their sides and closed by caps
 * @param {object} solid mesh3d trace
 * @param {{x: number, y: number, z: number}[]} ring_a
 * @param {{x: number, y: number, z: number}[]} ring_b Same points as ring_a, moved
 * @param {number[][]} cap_triangles Triangles of the outline, as indices of the ring points
 */
function addPrism(solid, ring_a, ring_b, cap_triangles) {
  let first = solid.x.length;
  let count = ring_a.length;
  [...ring_a, ...ring_b].forEach((point) => {
    solid.x.push(point.x);
    solid.y.push(point.y);
    solid.z.push(point.z);
  });
  let addTriangle = (a, b, c) => {
    solid.i.push(first + a);
    solid.j.push(first + b);
    solid.k.push(first + c);
  };
  for (let n = 0; n < count; n++) {
    let next = (n + 1) % count;
    addTriangle(n, next, count + next);
    addTriangle(n, count + next, count + n);
  }
  cap_triangles.forEach(([a, b, c]) => {
    addTriangle(a, b, c);
    addTriangle(count + a, count + b, count + c);
  });
}

/**
 * The sections extruded along the members, one trace per color
 * @param {object} structure
 * @param {function(object): string} getColor Color of a member
 * @param {number} opacity
 * @returns {object[]}
 */
function getMemberSolidTraces(structure, getColor, opacity) {
  let scale = getSectionScale(structure.settings?.units);
  let outlines = {};
  let solids = {};
  Object.values(structure.members || {}).forEach((member) => {
    let section_id = member.section_id;
    if (!outlines.hasOwnProperty(section_id)) outlines[section_id] = getSectionOutline(structure.sections?.[section_id], scale);
    let outline = outlines[section_id];
    let node_A = structure.nodes[member.node_A];
    let node_B = structure.nodes[member.node_B];
    if (!outline || !node_A || !node_B) return;
    if (Math.hypot(node_B.x - node_A.x, node_B.y - node_A.y, node_B.z - node_A.z) === 0) return;
    let axes = resultsLayer.getMemberAxes(node_A, node_B);
    // The section turns about the member's local x axis
    let angle = ((Number(member.rotation_angle) || 0) * Math.PI) / 180;
    let [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    let axis_y = axes.y.map((value, n) => value * cos + axes.z[n] * sin);
    let axis_z = axes.z.map((value, n) => value * cos - axes.y[n] * sin);
    let getRing = (node) =>
      outline.map(([y, z]) => ({
        x: node.x + y * axis_y[0] + z * axis_z[0],
        y: node.y + y * axis_y[1] + z * axis_z[1],
        z: node.z + y * axis_y[2] + z * axis_z[2],
      }));
    let color = getColor(member);
    solids[color] = solids[color] || getEmptySolid(color, opacity);
    // The outlines are convex: a fan closes the ends
    let caps = outline.slice(2).map((_, n) => [0, n + 1, n + 2]);
    addPrism(solids[color], getRing(node_A), getRing(node_B), caps);
  });
  return Object.values(solids);
}

/**
 * Normal of a polygon by Newell's method, null for a degenerate one
 * @param {{x: number, y: number, z: number}[]} points
 */
function getPolygonNormal(points) {
  let normal = { x: 0, y: 0, z: 0 };
  points.forEach((a, n) => {
    let b = points[(n + 1) % points.length];
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  });
  let length = Math.hypot(normal.x, normal.y, normal.z);
  return length > 0 ? { x: normal.x / length, y: normal.y / length, z: normal.z / length } : null;
}

/**
 * A plate as a slab with its thickness, centered on its nodes, null when it has no thickness
 * @param {object} structure
 * @param {object} plate
 * @param {string} color
 * @param {number} opacity
 * @returns {object|null}
 */
function getPlateSolidTrace(structure, plate, color, opacity) {
  let thickness = Number(plate.thickness) * getSectionScale(structure.settings?.units);
  let points = (plate.nodes || []).map((node_id) => structure.nodes[node_id]).filter(Boolean);
  let normal = points.length >= 3 && getPolygonNormal(points);
  if (!(thickness > 0) || !normal) return null;
  let offset = (point, distance) => ({ x: point.x + normal.x * distance, y: point.y + normal.y * distance, z: point.z + normal.z * distance });
  let solid = getEmptySolid(color, opacity);
  addPrism(
    solid,
    points.map((point) => offset(point, -thickness / 2)),
    points.map((point) => offset(point, thickness / 2)),
    mesher.triangulatePolygon(points)
  );
  return solid;
}

const solidsLayer = { getMemberSolidTraces, getPlateSolidTrace };
export default solidsLayer;
