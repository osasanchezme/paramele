import state from "../state";
import getState from "../getState";
import utils from "../utils";
import modelLinks from "./modelLinks";

const STRUCTURAL_RESULT_TYPES = new Set(["node", "member", "support", "point_load", "distributed_load", "plate", "moment", "section", "material"]);
const ACCUMULATED_LIST_TYPES = new Set(["member_list", "node_list"]);

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

function run(model) {
  if (model == undefined) {
    console.log("There are places not passing the model to the logic runner");
    model = getState("model");
  }
  // Restart the structure
  state.setState(utils.getEmptyStructuralModel(), "structure");
  clearAccumulatedLists(model);
  let { nodes, origins, group_origins, combinations } = calculateModel(model, true);
  // Lets the drawing tools find the box behind an element clicked in the renderer
  state.setGlobalVariable("structure_origins", origins);
  // Group boxes are kept apart, their elements are edited inside them
  state.setGlobalVariable("structure_group_origins", group_origins);
  modelLinks.notifyElementsChange();
  // Lets the renderer frame and label each possibility
  state.setGlobalVariable("structure_combinations", combinations);
  // Update the whole ReactFlow
  let rf_instance = state.getRfInstance();
  rf_instance.setNodes(nodes);
  // Update the renderer
  utils.updateRenderer();
  // Update the properties panel
  utils.updatePropertiesPanel();
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
  const spacing_between_combinations = global_settings["spacing_between_combinations"];
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
    connected_nodes[edge.target]["sources"][edge.targetHandle].push({ source_node_id: edge.source, source_handle_id: edge.sourceHandle });
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
      for (let j = start; j <= end; j += step) {
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

  // Run all the combinations
  model_combinations.forEach((model_combination, combination_i) => {
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
      let structural_nodes = structure["nodes"];
      state.setGlobalVariable(
        "structure_nodes_shift",
        utils.findHighestZCoordinate(structural_nodes) + spacing_between_combinations * (combination_i > 0 ? 1 : 0)
      );
      Object.entries(model_combination).forEach(([node_id, new_node_data]) => {
        nodes_data[node_id] = new_node_data;
      });
    } else if (is_from_main_model) {
      // Case with no range iterators and not from a wrapper node (there should not be shift)
      state.setGlobalVariable("structure_nodes_shift", 0);
    }
    const previous_node_ids = new Set(Object.keys(structure["nodes"]));
    // Run all the logic
    Object.entries(connected_nodes).forEach(([node_id, node]) => {
      let structure_changed = false;
      // TODO - Make it an actual logic, gathering all the args first
      // Get the arguments
      Object.entries(node.sources).forEach(([arg_key, arg_data_array]) => {
        let processed_args;
        if (arg_data_array.length > 1) processed_args = [];
        arg_data_array.forEach((arg_obj) => {
          if (arg_data_array.length > 1) processed_args.push(nodes_data[arg_obj.source_node_id][arg_obj.source_handle_id]);
          else processed_args = nodes_data[arg_obj.source_node_id][arg_obj.source_handle_id];
        });
        node.args[arg_key] = processed_args;
      });
      // Execute
      let is_group = nodes_type[node_id] === "nodesWrapper";
      let ids_before = is_from_main_model && is_group ? getStructureIds() : null;
      let result = library.execution[nodes_type[node_id]](node.args, nodes_data[node_id]);
      if (is_group) syncStructure();
      if (ids_before) addGroupOrigins(group_origins, ids_before, node_id);
      let result_input = {};
      Object.entries(result).forEach(([res_id, res_val]) => {
        let is_push = false;
        let actual_res_val = JSON.parse(JSON.stringify(res_val));
        // Process the structure
        let res_type = utils.splitArgName(res_id, "source").name;
        if (STRUCTURAL_RESULT_TYPES.has(res_type)) {
          // For structural nodes
          let structure_key = res_type + "s";
          actual_res_val = getNextStructuralId(structure_key);
          // Shift the nodes if needed and store the node ID for the lists
          if (res_type === "node") {
            res_val.z += state.getGlobalVariable("structure_nodes_shift");
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
    });
    if (is_from_main_model && iterate_sliders && model_combination !== null && max_range_node.data.iterating) {
      // Wrapper nodes add their own structural nodes, so the new IDs are read from the structure
      const node_ids = Object.keys(getState("structure")["nodes"]).filter((node_id) => !previous_node_ids.has(node_id));
      combinations.push({ node_label: max_range_node.data.custom_label || max_range_node.id, value: model_combination[max_range_node.id]["slider-value"], node_ids });
    }
  });

  return { nodes, origins, group_origins, combinations };
}

const logic_runner = { run, calculateModel };

export default logic_runner;
