// Meshes of the mesh boxes and the supports on soil of the surface support boxes.
//
// A surface support is a Winkler foundation: every node of the mesh gets a spring k = ks · A along the global axis its
// plates face, where ks is the modulus of subgrade reaction (force / length³) and A the area of the plates the node takes
// (mesher.getNodalAreas, the same weights as the consistent loads of a uniform pressure). Supports have no local axes, so
// the plates must face a global axis.
import mesher from "./mesher";

const AXES = ["x", "y", "z"];
// A plate faces an axis when its normal is along it, up to this
const AXIS_TOLERANCE = 1e-6;
const RESTRAINT_CODE = /^[FRS]{6}$/;

/**
 * Global axis a plate faces, or null when its normal is not along one
 * @param {import("../submodules/paramele-parsers/types").s3d_model} structure
 * @param {string} plate_id
 * @returns {"x"|"y"|"z"|null}
 */
function getPlateAxis(structure, plate_id) {
  let node_ids = structure.plates[plate_id]?.nodes;
  if (typeof node_ids === "string") node_ids = node_ids.split(",");
  const points = (node_ids || []).map((node_id) => structure.nodes[node_id]).filter(Boolean);
  const normal = points.length >= 3 ? mesher.getPlateNormal(points) : null;
  if (!normal) return null;
  return AXES.find((axis) => Math.abs(Math.abs(normal[axis]) - 1) <= AXIS_TOLERANCE) || null;
}

/**
 * Plate IDs given to a box, as one ID or lists of them
 * @param {any} value
 * @returns {string[]}
 */
function getPlateIds(value) {
  const plate_ids = [value]
    .flat(Infinity)
    .filter((plate_id) => plate_id !== null && plate_id !== undefined && plate_id !== "")
    .map((plate_id) => String(Number(plate_id)))
    .filter((plate_id) => plate_id !== "NaN");
  return [...new Set(plate_ids)];
}

/**
 * What a mesh box gives: its plates, the nodes of their mesh and the area each node takes of the plates facing each axis
 * @param {import("../submodules/paramele-parsers/types").s3d_model} structure Meshed
 * @param {string[]} plate_ids Plates of the box
 * @param {number} mesh_size
 * @param {{plate_id: string, reason: string}[]} skipped Plates of the box that could not be meshed
 * @returns {import("./types").ParamEleMesh}
 */
function describeMesh(structure, plate_ids, mesh_size, skipped) {
  const elements_by_plate = {};
  Object.values(structure.meshed_plates || {}).forEach((element) => {
    const plate_id = String(element.parent_plate);
    (elements_by_plate[plate_id] = elements_by_plate[plate_id] || []).push(element);
  });
  const meshed_plate_ids = plate_ids.filter((plate_id) => elements_by_plate[plate_id]);
  const node_ids = new Set();
  const areas = { x: {}, y: {}, z: {} };
  const skewed_plate_ids = [];
  let element_count = 0;
  meshed_plate_ids.forEach((plate_id) => {
    const elements = elements_by_plate[plate_id];
    element_count += elements.length;
    elements.forEach(({ node_A, node_B, node_C, node_D }) => [node_A, node_B, node_C, node_D].forEach((node_id) => node_ids.add(Number(node_id))));
    const axis = getPlateAxis(structure, plate_id);
    if (!axis) {
      skewed_plate_ids.push(plate_id);
      return;
    }
    Object.entries(mesher.getNodalAreas(structure.nodes, elements)).forEach(([node_id, area]) => {
      areas[axis][node_id] = (areas[axis][node_id] || 0) + area;
    });
  });
  return {
    plate_ids: meshed_plate_ids,
    mesh_size,
    element_count,
    node_ids: [...node_ids].sort((a, b) => a - b),
    areas,
    skewed_plate_ids,
    skipped: skipped.filter(({ plate_id }) => plate_ids.includes(String(plate_id))),
  };
}

/**
 * Spring supports of a surface support: one on each node of the plates that face a direction with an S in the restraint
 * code, k = ks · A along it. F and R are kept as they are in the other directions.
 * @param {import("./types").ParamEleMesh|null|undefined} mesh From a mesh box
 * @param {number} ks Modulus of subgrade reaction, force / length³
 * @param {string} restraint_code Global directions, e.g. FFSRRR for a slab on soil
 * @returns {{supports: object[], plate_ids: string[], error: string|null}} error is a copy key of the box errors
 */
function getSurfaceSupports(mesh, ks, restraint_code) {
  const failed = (error) => ({ supports: [], plate_ids: mesh?.plate_ids || [], error });
  if (!mesh || !Array.isArray(mesh.node_ids) || mesh.node_ids.length === 0) return failed("surface_support_no_mesh");
  const code = String(restraint_code ?? "")
    .trim()
    .toUpperCase();
  if (!RESTRAINT_CODE.test(code) || code.slice(3).includes("S")) return failed("surface_support_code");
  const spring_axes = AXES.filter((axis, i) => code[i] === "S");
  if (spring_axes.length === 0) return failed("surface_support_code");
  if (!(Number(ks) > 0)) return failed("surface_support_ks");
  if (mesh.skewed_plate_ids.length > 0) return failed("surface_support_skewed");
  if (spring_axes.some((axis) => Object.keys(mesh.areas[axis]).length === 0)) return failed("surface_support_not_facing");
  const supports = [];
  mesh.node_ids.forEach((node_id) => {
    const stiffness = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };
    let node_code = "";
    AXES.forEach((axis, i) => {
      if (code[i] !== "S") {
        node_code += code[i];
        return;
      }
      stiffness[`t${axis}`] = Number(ks) * (mesh.areas[axis][node_id] || 0);
      node_code += stiffness[`t${axis}`] > 0 ? "S" : "R";
    });
    // Nodes only on plates that face other directions are left free
    if (!node_code.includes("S")) return;
    supports.push({ node: node_id, restraint_code: node_code + code.slice(3), direction_code: "BBBBBB", ...stiffness, type: "node" });
  });
  return { supports, plate_ids: mesh.plate_ids, error: null };
}

const surfaceSupports = { getPlateAxis, getPlateIds, describeMesh, getSurfaceSupports };
export default surfaceSupports;
