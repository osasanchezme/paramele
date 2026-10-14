import getState from "../getState";
import { Node, Edge } from "reactflow";
import state from "../state";
import utils from "../utils";
import notification from "../components/notification";
import {
  addEdgesArrayToTheEditor,
  addNodesArrayToTheEditor,
  addNodeToTheEditor,
  deselectAllHandles,
  getEdgeObject,
  getSelectedHandles,
  getSelectedIds,
  removeNodesAndEdgesFromModel,
} from "../components/VisualEditor";
import { cloneDeep } from "lodash";
const { notify, closeAllNotifications } = notification;

/**
 * Starts grouping the selected boxes into a wrapper box, the user then picks its input and output handles
 * @param {(success: boolean) => void} finish_callback
 * @returns {boolean} Whether the selection can be grouped and the handles are being picked
 */
function groupBoxes(finish_callback) {
  // Get the selected model
  let { selected_nodes, selected_edges, selected_node_ids, selected_edge_ids, connected_nodes } = getSelectedModel();

  // Check if there are nodes selected
  if (selected_nodes.length === 0) {
    notify("warning", "no_nodes_selected", null, true);
    return false;
  }

  // Check if there are variableRange nodes selected
  let is_valid_selection = true;
  selected_nodes.forEach((node) => {
    if (node.type === "variableRange") {
      notify("warning", "range_nodes_selected_for_grouping", null, true);
      is_valid_selection = false;
    }
  });
  if (!is_valid_selection) return false;

  // Check if the model is closed
  selected_node_ids.forEach((node_id) => {
    if (!connected_nodes.includes(node_id)) {
      notify("warning", "unconnected_nodes", null, true);
      return;
    }
  });
  // Create the wrapper node
  let internal_logic = {
    nodes: selected_nodes,
    edges: selected_edges,
  };

  // Get the center of the selected nodes
  let position = { x: 0, y: 0 };
  selected_nodes.forEach((node) => {
    position.x += node.position.x;
    position.y += node.position.y;
  });
  position.x /= selected_nodes.length;
  position.y /= selected_nodes.length;

  // Get the input handles
  getHandlesFromUserInteraction(
    groupBoxesStepTwo,
    { internal_logic, position, selected_node_ids, selected_edge_ids },
    "select_input_handles",
    finish_callback
  );
  return true;
}

function groupBoxesStepTwo(data_to_keep, finish_callback) {
  let input_handles = getSelectedHandles();
  data_to_keep = { ...data_to_keep, input_handles };
  getHandlesFromUserInteraction(groupBoxesStepThree, data_to_keep, "select_output_handles", finish_callback);
}

function groupBoxesStepThree(data_to_keep, finish_callback) {
  let output_handles = getSelectedHandles();
  let { internal_logic, input_handles, position, selected_node_ids, selected_edge_ids } = data_to_keep;

  // Add the wrapper node to the editor
  addNodeToTheEditor("nodesWrapper", position, { internal_logic, input_handles, output_handles }, true, true);

  setTimeout(() => {
    removeNodesAndEdgesFromModel(selected_node_ids, selected_edge_ids);
    // Zoom to the new node
    state.zoomToCoordinate(position.x, position.y);

    // Call the finish callback
    finish_callback(true);
  }, 100);
}

function editInternalLogic() {
  /** @type {{nodes: Array<Node>, edges: Array<Edge>}} */
  let { nodes } = getState("model");
  let { node_ids } = getSelectedIds();
  let selected_nodes = [];
  let selected_node_ids = [];
  let selected_node_location = [];
  nodes.forEach((node, i) => {
    if (node_ids.has(node.id)) {
      selected_nodes.push(node);
      selected_node_ids.push(node.id);
      selected_node_location.push(i);
    }
  });
  if (selected_nodes.length === 0) {
    notify("warning", "no_nodes_selected", null, true);
    return;
  }
  if (selected_nodes.length > 1) {
    notify("warning", "more_than_one_node_selected", null, true);
    return;
  }
  if (selected_nodes[0].type !== "nodesWrapper") {
    notify("warning", "no_wrapper_node", null, true);
    return;
  }
  let wrapper_node = selected_nodes[0];
  let wrapper_node_id = selected_node_ids[0];
  let wrapper_node_location = selected_node_location[0];
  let internal_logic = wrapper_node.data.internal_logic;
  let wrapper_node_name = wrapper_node.data.custom_label || wrapper_node_id;
  let model_path = getState("model_path");
  let model_path_print = getState("model_path_print");
  state.setState([...model_path, "nodes", wrapper_node_location, "data", "internal_logic"], "model_path");
  state.setState([...model_path_print, wrapper_node_name], "model_path_print");
  state.setModelToEditor(internal_logic);
  state.resetView();
  utils.updateNavigator();
}

function getHandlesFromUserInteraction(callback, data_to_keep, message_key, finish_callback) {
  deselectAllHandles();
  state.setGlobalVariable("user_interaction_step", "wait");
  notify("info", message_key, null, true, 10000);
  let user_waiter = setInterval(() => {
    if (state.getGlobalVariable("user_interaction_step") === "done") {
      state.setGlobalVariable("user_interaction_step", "none");
      closeAllNotifications();
      callback(data_to_keep, finish_callback);
      clearInterval(user_waiter);
    }
  }, 100);
  setTimeout(() => {
    clearInterval(user_waiter);
  }, 10000);
}

function deleteBoxes() {
  /** @type {{nodes: Array<Node>, edges: Array<Edge>}} */
  let { nodes, edges } = getState("model");
  let selection = getSelectedModel();
  let new_nodes = [];
  let new_edges = [];
  nodes.forEach((node) => {
    if (!selection.selected_node_ids.includes(node.id)) new_nodes.push(node);
  });
  edges.forEach((edge) => {
    if (!selection.selected_edge_ids.includes(edge.id)) new_edges.push(edge);
  });
  state.setModelToEditor({ nodes: new_nodes, edges: new_edges });
}

function getSelectedModel() {
  /** @type {{nodes: Array<Node>, edges: Array<Edge>}} */
  let { nodes, edges } = getState("model");
  let { node_ids, edge_ids } = getSelectedIds();
  let selected_nodes = [];
  let selected_edges = [];
  let selected_node_ids = [];
  let selected_edge_ids = [];
  let connected_nodes = [];
  nodes.forEach((node) => {
    if (node_ids.has(node.id)) {
      selected_nodes.push(node);
      selected_node_ids.push(node.id);
    }
  });
  // Get the connected edges to the selected nodes
  edges.forEach((edge) => {
    if (selected_node_ids.includes(edge.source) || selected_node_ids.includes(edge.target) || edge_ids.has(edge.id)) {
      connected_nodes.push(edge.source);
      connected_nodes.push(edge.target);
      selected_edges.push(edge);
      selected_edge_ids.push(edge.id);
    }
  });
  // Remove duplicates
  connected_nodes = [...new Set(connected_nodes)];

  return { selected_nodes, selected_edges, selected_node_ids, selected_edge_ids, connected_nodes };
}

// Box types that can be changed into each other
const CHANGEABLE_TYPES = ["inputNumber", "variableRange"];

function changeNodesType(new_node_type) {
  /** @type {{nodes: Array<Node>, edges: Array<Edge>}} */
  let { nodes, edges } = getState("model");
  let { selected_nodes, selected_node_ids, selected_edges, selected_edge_ids } = getSelectedModel();
  if (selected_nodes.length === 0) {
    notify("warning", "no_nodes_selected", null, true);
    return;
  }
  for (let { type: node_type } of selected_nodes) {
    if (node_type !== selected_nodes[0].type) {
      notify("warning", "no_same_type", null, true);
      return;
    }
  }
  let new_nodes = [];
  let new_edges = [];
  let edges_to_update = {};
  const handles_map = {
    "slider-value": "value-value",
  };
  const supported_types = CHANGEABLE_TYPES;
  let selected_are_supported = selected_nodes.reduce((prev, curr) => {
    if (prev && supported_types.includes(curr.type)) return true;
    return false;
  }, true);
  if (selected_are_supported && !supported_types.includes(new_node_type)) selected_are_supported = false;
  if (!selected_are_supported) {
    notify("warning", "no_supported_type", null, true);
    return;
  }
  nodes.forEach((node) => {
    if (selected_node_ids.includes(node.id)) {
      node.type = new_node_type;
      // Still selected, so other actions can follow on them
      node.selected = true;
      Object.entries(handles_map).forEach(([handle_1_id, handle_2_id]) => {
        let old_data;
        let old_key;
        let new_key;
        if (node.data[handle_1_id] != undefined) {
          old_data = JSON.parse(JSON.stringify(node.data[handle_1_id]));
          new_key = handle_2_id;
          old_key = handle_1_id;
          delete node.data[handle_1_id];
        } else if (node.data[handle_2_id] != undefined) {
          old_data = JSON.parse(JSON.stringify(node.data[handle_2_id]));
          new_key = handle_1_id;
          old_key = handle_2_id;
          delete node.data[handle_2_id];
        }
        node.data[new_key] = old_data;
        selected_edges.forEach((edge) => {
          if (edge.sourceHandle == old_key) edge.sourceHandle = new_key;
          if (edge.targetHandle == old_key) edge.targetHandle = new_key;
          edges_to_update[edge.id] = JSON.parse(JSON.stringify(edge));
        });
      });
    }
    new_nodes.push(node);
  });
  edges.forEach((edge) => {
    if (edges_to_update[edge.id] != undefined) {
      edge = edges_to_update[edge.id];
    }
    new_edges.push(edge);
  });
  state.setModelToEditor({ nodes: new_nodes, edges: new_edges });
}

function duplicateNodes(first_point, second_point) {
  /** @type {{nodes: Array<Node>, edges: Array<Edge>}} */
  let { nodes, edges } = getState("model");
  const global_settings = getState("settings")["global"];
  let duplicate_connected_edges = global_settings.duplicate_connected_edges;
  let { selected_nodes, selected_node_ids, selected_edges, selected_edge_ids } = getSelectedModel();
  if (selected_nodes.length === 0) {
    notify("warning", "no_nodes_selected", null, true);
    return;
  }
  let new_nodes = [];
  let new_edges = [];
  selected_nodes.forEach((node) => {
    let { type, position, data } = cloneDeep(node);
    let x_relative = position.x - first_point.x;
    let y_relative = position.y - first_point.y;
    position.x = second_point.x + x_relative;
    position.y = second_point.y + y_relative;
    new_nodes.push(addNodeToTheEditor(type, position, data, true, false, utils.nextNodeIndex([...nodes, ...new_nodes])));
  });
  addNodesArrayToTheEditor(new_nodes);
  if (duplicate_connected_edges) {
    edges.forEach(({ source, sourceHandle, target, targetHandle }) => {
      let node_id_index = selected_node_ids.indexOf(target);
      if (node_id_index != -1) new_edges.push(getEdgeObject(source, sourceHandle, new_nodes[node_id_index].id, targetHandle));
    });
  }
  addEdgesArrayToTheEditor(new_edges);
}

const boxes = { groupBoxes, editInternalLogic, deleteBoxes, changeNodesType, duplicateNodes, CHANGEABLE_TYPES };

export default boxes;
