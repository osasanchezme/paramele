import state from "../state";
import getState from "../getState";
import utils from "../utils";
import mesher from "./mesher";
import settings_template from "../settings_template.json";
import modelLinks from "./modelLinks";
import units from "./units";
import unitInference from "./unitInference";
import supportGlyphs from "./supportGlyphs";
import surfaceSupports from "./surfaceSupports";

const STRUCTURAL_RESULT_TYPES = new Set([
  "node",
  "member",
  "support",
  "point_load",
  "distributed_load",
  "pressure",
  "plate",
  "moment",
  "section",
  "material",
]);
const ACCUMULATED_LIST_TYPES = new Set(["member_list", "node_list"]);
// Outputs that add several elements to the structure at once, named after their structure key (e.g. supports_out-ids),
// as {supports: [...elements], plate_ids}. They give the list of their IDs
const STRUCTURAL_LIST_KEYS = new Set(["supports"]);
const MESH_BOX_TYPE = "structuralMesh";
// Gap between stacked possibilities, as a fraction of the larger of their two heights
const COMBINATION_GAP_RATIO = 0.5;
// Flat possibilities (beams, slabs) are given at least this fraction of their plan size as height, so they do not stack too close
const COMBINATION_MIN_HEIGHT_RATIO = 0.25;

/**
 * Empties the member/node list outputs of the model and of the wrappers' inner models. They accumulate IDs across the
 * combinations of one run, so they have to start empty on every run or they keep IDs that no longer exist.
 * @param {object} model
 */
function clearAccumulatedLists(model) {
  model.nodes.forEach((node) => {
    Object.keys(node.data).forEach((key) => {
      if (ACCUMULATED_LIST_TYPES.has(utils.splitArgName(key, "source").name)) node.data[key] = [];
    });
    if (node.data.internal_logic) clearAccumulatedLists(node.data.internal_logic);
  });
}

/**
 * IDs of the elements in the structure, by structure key
 * @returns {Object<string, Set<string>>}
 */
function getStructureIds() {
  let ids = {};
  Object.entries(getState("structure")).forEach(([structure_key, elements]) => (ids[structure_key] = new Set(Object.keys(elements))));
  return ids;
}

/**
 * Records that the elements a group box added to the structure come from it
 * @param {object} group_origins Box of each element, by structure key and ID
 * @param {Object<string, Set<string>>} ids_before From getStructureIds before the box ran
 * @param {string} node_id
 */
function addGroupOrigins(group_origins, ids_before, node_id) {
  Object.entries(getStructureIds()).forEach(([structure_key, ids]) => {
    ids.forEach((element_id) => {
      if (ids_before[structure_key]?.has(element_id)) return;
      if (!group_origins[structure_key]) group_origins[structure_key] = {};
      group_origins[structure_key][element_id] = node_id;
    });
  });
}

/**
 * Moves the structural nodes of a possibility above the previous one. Each possibility is calculated where its boxes
 * place it, and the gap to the previous one grows with the taller of the two, so tall possibilities do not crowd and
 * short ones do not drift apart. The gap is left between what the renderer draws, supports and load arrows included.
 * @param {string[]} node_ids Structural nodes of the possibility
 * @param {{bottom: number, top: number, height: number}|null} previous_box Of the previous possibility, null for the first one (it is not moved)
 * @returns {{bottom: number, top: number, height: number}|null} Of this possibility once moved (bottom and top as drawn), the
 * previous one when it has no nodes
 */
function stackCombination(node_ids, previous_box) {
  const structure = getState("structure");
  const structural_nodes = node_ids.map((node_id) => structure.nodes[node_id]).filter(Boolean);
  if (structural_nodes.length === 0) return previous_box;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  structural_nodes.forEach((node) => {
    ["x", "y", "z"].forEach((axis) => {
      min[axis] = Math.min(min[axis], node[axis]);
      max[axis] = Math.max(max[axis], node[axis]);
    });
  });
  const plan_size = Math.max(max.x - min.x, max.y - min.y);
  const height = Math.max(max.z - min.z, COMBINATION_MIN_HEIGHT_RATIO * plan_size) || 1;
  const drawn = getDrawnZRange(structure, new Set(node_ids), min.z, max.z);
  if (!previous_box) return { ...drawn, height };
  const gap = COMBINATION_GAP_RATIO * Math.max(previous_box.height, height);
  // Rounded so the moved coordinates stay as clean as the ones the boxes give
  const shift = Math.round((previous_box.top + gap - drawn.bottom) * 1000) / 1000;
  structural_nodes.forEach((node) => (node.z += shift));
  state.setState(structure, "structure");
  return { bottom: drawn.bottom + shift, top: drawn.top + shift, height };
}

/**
 * Lowest and highest Z that the renderer draws for some structural nodes: the nodes, the symbols of their supports
 * (under them) and the arrows of their loads (as long as the load size, on the side of the arrow's tail)
 * @param {object} structure
 * @param {Set<string>} node_ids
 * @param {number} min_z Of the nodes
 * @param {number} max_z Of the nodes
 * @returns {{bottom: number, top: number}}
 */
function getDrawnZRange(structure, node_ids, min_z, max_z) {
  const settings = getState("settings");
  const load_size = Number(settings["global"]["physical_load_size"]) || 0;
  const support_depth = supportGlyphs.getDepth(units.repairUnits(settings.units));
  let bottom = min_z;
  let top = max_z;
  const has = (node_id) => node_ids.has(String(node_id));
  // An arrow along (x, y, z) whose tail is "sign" times the vector away from the node
  const addArrow = (node_id, x, y, z, sign) => {
    const node = structure.nodes[node_id];
    const length = Math.hypot(x, y, z);
    if (!node || !length) return;
    const tail_z = node.z + (sign * load_size * z) / length;
    bottom = Math.min(bottom, tail_z);
    top = Math.max(top, tail_z);
  };
  Object.values(structure.supports).forEach(({ node }) => {
    if (has(node)) bottom = Math.min(bottom, structure.nodes[node].z - support_depth);
  });
  // Forces point at their node and moments start from it
  Object.values(structure.point_loads).forEach(({ node, x_mag, y_mag, z_mag }) => {
    if (has(node)) addArrow(node, x_mag, y_mag, z_mag, -1);
  });
  Object.values(structure.moments).forEach(({ node, x_mag, y_mag, z_mag }) => {
    if (has(node)) addArrow(node, x_mag, y_mag, z_mag, 1);
  });
  Object.values(structure.distributed_loads).forEach((load) => {
    const member = structure.members[load.member];
    if (!member || !has(member.node_A)) return;
    addArrow(member.node_A, load.x_mag_A, load.y_mag_A, load.z_mag_A, -1);
    addArrow(member.node_B, load.x_mag_B, load.y_mag_B, load.z_mag_B, -1);
  });
  // Pressures follow the axes of their plate, so they can go either way
  Object.values(structure.pressures || {}).forEach(({ plate_id }) => {
    const plate = structure.plates[plate_id];
    if (!plate || !Array.isArray(plate.nodes) || !has(plate.nodes[0])) return;
    plate.nodes.forEach((node_id) => {
      const node = structure.nodes[node_id];
      if (!node) return;
      bottom = Math.min(bottom, node.z - load_size);
      top = Math.max(top, node.z + load_size);
    });
  });
  return { bottom, top };
}

/**
 * Order the boxes run in: first the ones that do not depend on a mesh box, in the order of the links as always, then the
 * mesh boxes (all of them meshed at once), then the boxes that depend on them, each after the boxes it takes inputs from.
 * A mesh box needs every node that other boxes put on its plates (loads, columns, supports) to be there.
 * @param {string[]} box_ids Connected boxes, in the order of the links
 * @param {object[]} edges
 * @param {Object<string, string>} nodes_type
 * @returns {{before_mesh: string[], mesh_boxes: string[], after_mesh: string[]}}
 */
function getEvaluationOrder(box_ids, edges, nodes_type) {
  const mesh_boxes = box_ids.filter((box_id) => nodes_type[box_id] === MESH_BOX_TYPE);
  if (mesh_boxes.length === 0) return { before_mesh: box_ids, mesh_boxes, after_mesh: [] };
  const targets = {};
  edges.forEach(({ source, target }) => (targets[source] = targets[source] || []).push(target));
  const downstream = new Set();
  const pending = [...mesh_boxes];
  while (pending.length > 0) {
    (targets[pending.pop()] || []).forEach((target) => {
      if (downstream.has(target)) return;
      downstream.add(target);
      pending.push(target);
    });
  }
  const after = box_ids.filter((box_id) => downstream.has(box_id) && nodes_type[box_id] !== MESH_BOX_TYPE);
  // Each one after its sources among them (stable topological order, a cycle keeps the order of the links)
  const after_set = new Set(after);
  const sources_left = {};
  after.forEach((box_id) => (sources_left[box_id] = new Set()));
  edges.forEach(({ source, target }) => {
    if (after_set.has(source) && after_set.has(target) && source !== target) sources_left[target].add(source);
  });
  const after_mesh = [];
  const placed = new Set();
  while (after_mesh.length < after.length) {
    const next = after.find((box_id) => !placed.has(box_id) && [...sources_left[box_id]].every((source) => placed.has(source)));
    const box_id = next ?? after.find((box_id) => !placed.has(box_id));
    placed.add(box_id);
    after_mesh.push(box_id);
  }
  return { before_mesh: box_ids.filter((box_id) => !downstream.has(box_id) && nodes_type[box_id] !== MESH_BOX_TYPE), mesh_boxes, after_mesh };
}

function run(model) {
  if (model == undefined) {
    console.log("There are places not passing the model to the logic runner");
    model = getState("model");
  }
  // Restart the structure, in the units of the model
  let empty_structure = utils.getEmptyStructuralModel();
  empty_structure.settings.units = units.toS3DUnits(getState("settings").units);
  state.setState(empty_structure, "structure");
  // Filled by the mesh boxes and the surface supports while the model is calculated
  state.setGlobalVariable("structure_box_meshes", []);
  state.setGlobalVariable("structure_surface_supports", []);
  clearAccumulatedLists(model);
  let { nodes, origins, group_origins, combinations } = calculateModel(model, true);
  // Lets the drawing tools find the box behind an element clicked in the renderer
  state.setGlobalVariable("structure_origins", origins);
  // Group boxes are kept apart, their elements are edited inside them
  state.setGlobalVariable("structure_group_origins", group_origins);
  modelLinks.notifyElementsChange();
  // Lets the renderer frame and label each possibility
  state.setGlobalVariable("structure_combinations", combinations);
  meshPlates();
  // Update the whole ReactFlow
  let rf_instance = state.getRfInstance();
  rf_instance.setNodes(nodes);
  // Update the renderer
  utils.updateRenderer();
  // Update the properties panel
  utils.updatePropertiesPanel();
}

/**
 * Meshes the plates of the structure when meshing is on (Structure > Mesh plates), so the mesh follows every change
 * of the model. The plates of the mesh boxes keep the mesh they got while the model was calculated. What was meshed
 * (by both) is kept in the "structure_mesh" global variable.
 */
function meshPlates() {
  const global_settings = getState("settings")["global"];
  const mesh_size = getMeshSize(global_settings);
  /** @type {import("./types").ParamEleStructureMesh} */
  const structure_mesh = { mesh_size, node_ids: [], element_count: 0, plate_count: 0, skipped: [] };
  (state.getGlobalVariable("structure_box_meshes") || []).forEach((box_mesh) => {
    structure_mesh.node_ids.push(...box_mesh.node_ids);
    structure_mesh.element_count += box_mesh.element_count;
    structure_mesh.plate_count += box_mesh.meshed_plate_ids.length;
    structure_mesh.skipped.push(...box_mesh.skipped);
  });
  if (global_settings["mesh_plates"]) {
    const { structure, node_ids, element_count, meshed_plate_ids, skipped } = mesher.meshStructure(getState("structure"), { mesh_size });
    state.setState(structure, "structure");
    structure_mesh.node_ids.push(...node_ids);
    structure_mesh.element_count += element_count;
    structure_mesh.plate_count += meshed_plate_ids.length;
    structure_mesh.skipped.push(...skipped);
  }
  const has_mesh = global_settings["mesh_plates"] || structure_mesh.element_count > 0 || structure_mesh.skipped.length > 0;
  state.setGlobalVariable("structure_mesh", has_mesh ? structure_mesh : null);
}

/**
 * Mesh size from the settings, the default one when it is not a positive number
 * @param {object} global_settings
 * @returns {number}
 */
function getMeshSize(global_settings) {
  const mesh_size = Number(global_settings["mesh_size"]);
  return mesh_size > 0 ? mesh_size : settings_template.global.mesh_size.default;
}

/**
 * Value that goes through a link, converted to the unit of the input it goes into
 * @param {any} value
 * @param {number} factor
 */
function convertLinkedValue(value, factor) {
  if (factor === 1 || value === null || value === undefined || value === "") return value;
  if (Array.isArray(value)) return value.map((item) => convertLinkedValue(item, factor));
  const number = Number(value);
  return Number.isFinite(number) ? number * factor : value;
}

/**
 *
 * @param {object} model - Processes a reactflow model of nodes and edges to calculate their outputs
 * @param {boolean} is_from_main_model
 */
function calculateModel(model, is_from_main_model) {
  let nodes = model.nodes;
  let edges = model.edges;
  let connected_nodes = {};
  let nodes_type = {};
  let nodes_data = {};
  let nodes_i = {};
  let range_nodes = [];
  // Box that created each structural element, by structure key and ID (only for the main model, wrappers create their own)
  let origins = {};
  // Group box that added each element of its inner model (only for the main model)
  let group_origins = {};
  // Structural nodes created by each possibility when all of them are calculated (only for the main model)
  let combinations = [];
  const library = utils.getNodesLibrary();
  const global_settings = getState("settings")["global"];
  const iterate_sliders = global_settings["sliders_mode"] === "sliders_all";
  const model_units = units.repairUnits(getState("settings").units);
  // Units of the value handles: links between units of the same dimension convert the value
  const unit_inference = unitInference.inferUnits(model, library.units, model_units);
  if (is_from_main_model) state.setGlobalVariable("unit_inference", unit_inference);
  // Preprocess nodes
  nodes.forEach((node, i) => {
    nodes_type[node.id] = node.type;
    nodes_data[node.id] = node.data;
    nodes_i[node.id] = i;
    if (node.type === "variableRange") range_nodes.push(node);
  });

  // Get all the connected nodes in the model
  edges.forEach((edge) => {
    if (!connected_nodes.hasOwnProperty(edge.target))
      connected_nodes[edge.target] = {
        args: {},
        sources: {},
        type: nodes_type[edge.target],
      };
    if (!connected_nodes[edge.target]["sources"].hasOwnProperty(edge.targetHandle)) connected_nodes[edge.target]["sources"][edge.targetHandle] = [];
    connected_nodes[edge.target]["args"][edge.targetHandle] = null;
    connected_nodes[edge.target]["sources"][edge.targetHandle].push({
      source_node_id: edge.source,
      source_handle_id: edge.sourceHandle,
      unit_factor: unit_inference.edges[edge.id]?.factor ?? 1,
    });
  });
  // Defaults of the unlinked inputs are written in the units of the solvers
  Object.entries(connected_nodes).forEach(([node_id, node]) => {
    const declared = library.units[node.type]?.handles || {};
    Object.entries(declared).forEach(([handle_id, quantity]) => {
      if (node.sources[handle_id] || quantity.startsWith("unit:")) return;
      const default_value = Number(handle_id.split("-")[2]);
      if (!Number.isFinite(default_value) || default_value === 0) return;
      node.args[handle_id] = units.convertQuantity(default_value, quantity, units.SOLVER_UNITS, model_units);
    });
  });

  // Get all the combinations using the node with the largest number of possibilities
  let model_combinations = [];
  let max_range = 0;
  let max_range_node = null;
  range_nodes.forEach((range_node, i) => {
    let start = Number(range_node.data["start-value"]);
    let end = Number(range_node.data["end-value"]);
    let step = Number(range_node.data["step-value"]) || 1;
    let num_possibilities = Math.floor((end - start) / step) + 1;
    if (num_possibilities > max_range) {
      max_range = num_possibilities;
      max_range_node = range_node;
    }
    delete range_node.data.iterating;
  });
  if (max_range_node !== null) {
    let start = Number(max_range_node.data["start-value"]);
    let end = Number(max_range_node.data["end-value"]);
    let step = Number(max_range_node.data["step-value"]);
    if (iterate_sliders && step > 0) {
      max_range_node.data.iterating = true;
      let iterating_node_data = { node_label: max_range_node.data.custom_label || max_range_node.id, variation_values: [] };
      // Each value from its index, adding the step up would carry its rounding errors (45.931758530219994)
      const count = Math.floor((end - start) / step + 1e-9) + 1;
      for (let k = 0; k < count; k++) {
        const j = Number((start + k * step).toPrecision(12));
        let new_node_data = JSON.parse(JSON.stringify(max_range_node.data));
        new_node_data["slider-value"] = j;
        let model_combination = {};
        model_combination[max_range_node.id] = new_node_data;
        model_combinations.push(model_combination);
        iterating_node_data.variation_values.push(j);
      }
      state.setGlobalVariable("iterating_node_data", iterating_node_data);
    } else {
      let new_node_data = JSON.parse(JSON.stringify(max_range_node.data));
      let model_combination = {};
      model_combination[max_range_node.id] = new_node_data;
      model_combinations.push(model_combination);
      state.setGlobalVariable("iterating_node_data", {});
    }
  }
  // If there are no range nodes, add null
  if (model_combinations.length === 0) model_combinations.push(null);

  // Top and height of the last possibility, to stack the next one above it
  let previous_combination_box = null;
  const order = getEvaluationOrder(Object.keys(connected_nodes), edges, nodes_type);
  // Run all the combinations
  model_combinations.forEach((model_combination) => {
    let structure = getState("structure");
    let structure_id_state = {};
    Object.keys(structure).forEach((structure_key) => {
      const used_ids = new Set(Object.keys(structure[structure_key]).map((id) => Number(id)));
      let next_id = 1;
      while (used_ids.has(next_id)) next_id += 1;
      structure_id_state[structure_key] = { used_ids, next_id };
    });

    // Group boxes add their elements to the stored structure, which the local copy and the free IDs have to include
    const syncStructure = () => {
      structure = getState("structure");
      Object.entries(structure).forEach(([structure_key, elements]) => {
        const id_state = structure_id_state[structure_key];
        if (!id_state) return;
        Object.keys(elements).forEach((id) => id_state.used_ids.add(Number(id)));
        while (id_state.used_ids.has(id_state.next_id)) id_state.next_id += 1;
      });
    };

    const getNextStructuralId = (structure_key) => {
      const id_state = structure_id_state[structure_key];
      const new_id = id_state.next_id;
      id_state.used_ids.add(new_id);
      id_state.next_id += 1;
      while (id_state.used_ids.has(id_state.next_id)) id_state.next_id += 1;
      return new_id;
    };

    // Update the model with the given combination
    if (model_combination !== null) {
      Object.entries(model_combination).forEach(([node_id, new_node_data]) => {
        nodes_data[node_id] = new_node_data;
      });
    }
    const previous_node_ids = new Set(Object.keys(structure["nodes"]));
    const previous_plate_ids = new Set(Object.keys(structure["plates"]));

    // Arguments of a box from the outputs of its sources
    const gatherArgs = (node) => {
      Object.entries(node.sources).forEach(([arg_key, arg_data_array]) => {
        let processed_args;
        if (arg_data_array.length > 1) processed_args = [];
        arg_data_array.forEach((arg_obj) => {
          const value = convertLinkedValue(nodes_data[arg_obj.source_node_id][arg_obj.source_handle_id], arg_obj.unit_factor);
          if (arg_data_array.length > 1) processed_args.push(value);
          else processed_args = value;
        });
        node.args[arg_key] = processed_args;
      });
    };

    // The mesh boxes are meshed together, so the plates they share edges with match. When meshing is on, the other
    // plates of this possibility are meshed with them (with the global size), the global meshing keeps them as they are
    const runMeshBoxes = (mesh_box_ids) => {
      const requests = mesh_box_ids.map((node_id) => {
        const node = connected_nodes[node_id];
        gatherArgs(node);
        const result = library.execution[nodes_type[node_id]](node.args, nodes_data[node_id]);
        nodes[nodes_i[node_id]]["data"]["box_error"] = result.box_error || null;
        const request = result["mesh_out-mesh"];
        request.plate_ids = request.plate_ids.filter((plate_id) => structure.plates[plate_id]);
        if (!result.box_error && request.plate_ids.length === 0) nodes[nodes_i[node_id]]["data"]["box_error"] = "mesh_no_plates";
        return { node_id, ...request };
      });
      const plate_sizes = {};
      requests.forEach(({ plate_ids, mesh_size }) =>
        plate_ids.forEach((plate_id) => (plate_sizes[plate_id] = Math.min(plate_sizes[plate_id] ?? Infinity, mesh_size)))
      );
      let plate_ids = Object.keys(plate_sizes);
      if (global_settings["mesh_plates"]) plate_ids.push(...Object.keys(structure.plates).filter((plate_id) => !previous_plate_ids.has(plate_id)));
      const node_ids = new Set(Object.keys(structure.nodes).filter((node_id) => !previous_node_ids.has(node_id)));
      const meshing = mesher.meshStructure(structure, { mesh_size: getMeshSize(global_settings), plate_sizes, plate_ids, node_ids });
      state.setState(meshing.structure, "structure");
      syncStructure();
      const box_meshes = state.getGlobalVariable("structure_box_meshes") || [];
      box_meshes.push({
        node_ids: meshing.node_ids,
        element_count: meshing.element_count,
        meshed_plate_ids: meshing.meshed_plate_ids,
        skipped: meshing.skipped,
      });
      state.setGlobalVariable("structure_box_meshes", box_meshes);
      requests.forEach(({ node_id, plate_ids, mesh_size }) => {
        const mesh = surfaceSupports.describeMesh(structure, plate_ids, mesh_size, meshing.skipped);
        const data = nodes[nodes_i[node_id]]["data"];
        if (plate_ids.length > 0 && mesh.plate_ids.length === 0) data["box_error"] = "mesh_failed";
        data["mesh_out-mesh"] = mesh;
        data["node_list_out-ids"] = mesh.node_ids;
        data["input"] = { plates: plate_ids, mesh_size };
      });
    };

    const runBox = (node_id) => {
      const node = connected_nodes[node_id];
      let structure_changed = false;
      gatherArgs(node);
      // Execute
      let is_group = nodes_type[node_id] === "nodesWrapper";
      let ids_before = is_from_main_model && is_group ? getStructureIds() : null;
      let result = library.execution[nodes_type[node_id]](node.args, nodes_data[node_id]);
      if (is_group) syncStructure();
      if (ids_before) addGroupOrigins(group_origins, ids_before, node_id);
      let result_input = {};
      Object.entries(result).forEach(([res_id, res_val]) => {
        // What the box could not do with its inputs, shown in it
        if (res_id === "box_error") {
          nodes[nodes_i[node_id]]["data"]["box_error"] = res_val || null;
          return;
        }
        let is_push = false;
        let actual_res_val = JSON.parse(JSON.stringify(res_val));
        // Process the structure
        let res_type = utils.splitArgName(res_id, "source").name;
        if (STRUCTURAL_LIST_KEYS.has(res_type)) {
          // Several elements at once (a surface support). Nodes that have a support already keep it
          const supported = new Set(Object.values(structure.supports).map(({ node }) => String(node)));
          actual_res_val = [];
          res_val[res_type].forEach((element) => {
            if (res_type === "supports" && supported.has(String(element.node))) return;
            const element_id = getNextStructuralId(res_type);
            structure[res_type][element_id] = element;
            actual_res_val.push(element_id);
            if (is_from_main_model) {
              if (!origins[res_type]) origins[res_type] = {};
              origins[res_type][element_id] = node_id;
            }
          });
          if (actual_res_val.length > 0) {
            const surface_supports = state.getGlobalVariable("structure_surface_supports") || [];
            surface_supports.push({ node_id, plate_ids: res_val.plate_ids || [], support_ids: actual_res_val });
            state.setGlobalVariable("structure_surface_supports", surface_supports);
          }
          structure_changed = true;
          result_input = { plates: res_val.plate_ids, count: actual_res_val.length };
        } else if (STRUCTURAL_RESULT_TYPES.has(res_type)) {
          // For structural nodes
          let structure_key = res_type + "s";
          actual_res_val = getNextStructuralId(structure_key);
          // Store the node ID for the lists
          if (res_type === "node") {
            state.setGlobalVariable("last_structural_node", actual_res_val);
          }
          // Store the member ID for the lists
          if (res_type === "member") {
            state.setGlobalVariable("last_structural_member", actual_res_val);
          }
          if (is_from_main_model) {
            if (!origins[structure_key]) origins[structure_key] = {};
            origins[structure_key][actual_res_val] = node_id;
          }
          // Update the structure
          structure[structure_key][actual_res_val] = res_val;
          structure_changed = true;
          result_input = res_val;
        } else if (res_type === "result") {
          // For other nodes numerical nodes
          actual_res_val = res_val.value;
          delete res_val.value;
          result_input = res_val;
        } else if (res_type === "member_list") {
          actual_res_val = state.getGlobalVariable("last_structural_member");
          is_push = true;
        } else if (res_type === "node_list") {
          actual_res_val = state.getGlobalVariable("last_structural_node");
          is_push = true;
        } else {
          // For the rest of the nodes (Wrapper)
          result_input = result.input;
        }
        // Update the node data
        if (is_push) {
          // Only push if not in the list
          let current_array = nodes[nodes_i[node_id]]["data"][res_id];
          if (!current_array) current_array = [];
          if (current_array && !current_array.includes(actual_res_val)) current_array.push(actual_res_val);
          nodes[nodes_i[node_id]]["data"][res_id] = current_array;
        } else {
          nodes[nodes_i[node_id]]["data"][res_id] = actual_res_val;
        }
      });
      // Set the input
      nodes[nodes_i[node_id]]["data"]["input"] = result_input;
      if (structure_changed) state.setState(structure, "structure");
    };

    // Run all the logic
    order.before_mesh.forEach(runBox);
    if (order.mesh_boxes.length > 0) {
      runMeshBoxes(order.mesh_boxes);
      order.after_mesh.forEach(runBox);
    }
    if (iterate_sliders && model_combination !== null && max_range_node.data.iterating) {
      // Wrapper nodes add their own structural nodes, so the new IDs are read from the structure
      const node_ids = Object.keys(getState("structure")["nodes"]).filter((node_id) => !previous_node_ids.has(node_id));
      // The possibilities of a group box are stacked too, inside the possibility of the main model that contains them
      const combination_box = stackCombination(node_ids, previous_combination_box);
      const is_empty = combination_box === previous_combination_box;
      previous_combination_box = combination_box;
      if (is_from_main_model)
        combinations.push({
          node_label: max_range_node.data.custom_label || max_range_node.id,
          value: model_combination[max_range_node.id]["slider-value"],
          node_ids,
          drawn_z: is_empty ? null : { bottom: combination_box.bottom, top: combination_box.top },
        });
    }
  });

  return { nodes, origins, group_origins, combinations };
}

const logic_runner = { run, calculateModel, getEvaluationOrder };

export default logic_runner;
