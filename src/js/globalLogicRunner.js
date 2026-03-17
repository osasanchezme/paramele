import state from "../state";
import getState from "../getState";
import utils from "../utils";

const STRUCTURAL_RESULT_TYPES = new Set(["node", "member", "support", "point_load", "distributed_load", "plate", "moment", "section", "material"]);

function run(model) {
  if (model == undefined) {
    console.log("There are places not passing the model to the logic runner");
    model = getState("model");
  }
  // Restart the structure
  state.setState(utils.getEmptyStructuralModel(), "structure");
  let { nodes } = calculateModel(model, true);
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
      let result = library.execution[nodes_type[node_id]](node.args, nodes_data[node_id]);
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
  });

  return { nodes };
}

const logic_runner = { run, calculateModel };

export default logic_runner;
