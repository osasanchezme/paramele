import ReactFlow, { MiniMap, Controls, addEdge, applyEdgeChanges, applyNodeChanges, updateEdge } from "reactflow";
import logic_runner from "../js/globalLogicRunner";
import { onSettingsChange, setGlobalVariable, storeRfInstance, updateStateFromFlow } from "../state";
import getState from "../getState";
import { useEffect, useState } from "react";
import utils from "../utils";
import "reactflow/dist/style.css";

let rf_instance;

function getShowMiniMap() {
  return getState("settings")["global"].mini_map;
}

function VisualEditor({ width, nodes_library, is_model_locked, nodes, edges, setNodes, setEdges, app_mode }) {
  const [show_mini_map, setShowMiniMap] = useState(getShowMiniMap);
  useEffect(() => onSettingsChange(() => setShowMiniMap(getShowMiniMap())), []);
  // Whenever the model lock status changes the data on each node on that regard updates accordingly
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        node.data.model_locked = is_model_locked;
        return node;
      })
    );
    updateStateFromFlow();
  }, [is_model_locked, setNodes]);

  const saveRfInstance = (rfInstance) => {
    rf_instance = rfInstance;
    storeRfInstance(rfInstance);
    logic_runner.run({ edges, nodes });
  };

  const onNodesChange = (changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    if (changes.length > 0) {
      // Only run the updater when data changes or a new noe is added
      if (changes[0]["type"] === "reset" || changes[0]["type"] === "add") {
        updateStateFromFlow();
        console.log("Something changed... [Set the file state to unsaved]");
      }
    }
  };
  const onEdgesChange = (changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    updateStateFromFlow();
  };
  const onEdgeUpdate = (oldEdge, newConnection) => {
    setEdges((els) => updateEdge(oldEdge, newConnection, els));
    updateStateFromFlow();
  };
  const onConnect = (connection) => {
    setEdges((eds) => addEdge(connection, eds));
    updateStateFromFlow();
  };
  let mini_map;
  if (show_mini_map) {
    mini_map = <MiniMap />;
  }
  let global_style = {};
  global_style = { width: String(width) + "%", right: "0%" };
  return (
    <div className="editor-container" style={global_style}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeUpdate={onEdgeUpdate}
        onConnect={onConnect}
        nodeTypes={nodes_library}
        fitView
        // Lower than React Flow's default (0.5), so the whole graph can fit on small screens
        minZoom={0.1}
        onInit={saveRfInstance}
        selectionKeyCode={null}
        deleteKeyCode={null}
        className={`mode-${app_mode}`}
      >
        {mini_map}
        <Controls />
      </ReactFlow>
    </div>
  );
}

/**
 * Only place where I will directly modify data from the nodes from the rfInstance
 * @param {*} node_id
 * @param {*} data_key - Key under data to be modified
 * @param {*} data_value - Value to set in the key
 * @param {*} is_aux - Whether the key is under data.aux or under data directly
 */
function updateNodeDataKey(node_id, data_key, data_value, is_aux) {
  rf_instance.setNodes((nds) =>
    nds.map((node) => {
      if (node.id === node_id) {
        if (is_aux) {
          if (data_key == "selected_handles") {
            let id_index = node.data.aux[data_key].indexOf(data_value);
            if (id_index != -1) {
              node.data.aux[data_key].splice(id_index, 1);
            } else {
              node.data.aux[data_key].push(data_value);
            }
          } else {
            node.data.aux[data_key] = data_value;
          }
        } else {
          // A new data object, so React Flow re-renders the node when the value comes from outside it (e.g. the parameters panel)
          node.data = { ...node.data, [data_key]: data_value };
        }
      }
      return node;
    })
  );
}

/**
 *
 * @param {import("../js/types").ParamEleNodesTypes} type Node type
 * @param {{x: Number, y: Number}} html_position Desired position for the node in the document space
 * @param {Object} [data] Initial data for the new node
 * @param {number} [index] Index of the node to add
 */
function addNodeToTheEditor(type, html_position, data = {}, is_rf_position = false, add_to_the_editor = true, index) {
  let position = html_position;
  if (!is_rf_position) {
    position = rf_instance.project(html_position);
  }
  let id;
  if (typeof index == "undefined") {
    id = utils.nextNodeId();
  } else {
    id = utils.getNodeFullID(index);
  }
  setGlobalVariable("last_node_id_created", id);
  data.aux = utils.getDefaultAuxData();
  if (add_to_the_editor) {
    rf_instance.addNodes([{ id, type, position, data }]);
  } else {
    return { id, type, position, data };
  }
}

function addNodesArrayToTheEditor(nodes_array) {
  rf_instance.addNodes(nodes_array);
}

function addEdgesArrayToTheEditor(edges_array) {
  rf_instance.addEdges(edges_array);
}

function getZoom() {
  return rf_instance.getZoom();
}

function setZoom(zoom = 0.5) {
  rf_instance.zoomTo(zoom);
}

function fitView() {
  rf_instance.fitView();
}

function removeNodesAndEdgesFromModel(node_ids, edge_ids) {
  let nodes = [];
  let edges = [];
  node_ids.forEach((id) => {
    nodes.push({ id });
  });
  edge_ids.forEach((id) => {
    edges.push({ id });
  });
  rf_instance.deleteElements({ nodes, edges });
}

function getSelectedHandles() {
  let selected_handles = [];
  let nodes = rf_instance.getNodes();
  nodes.forEach((node) => {
    if (node.data.aux.selected_handles.length > 0) {
      node.data.aux.selected_handles.forEach((selected_handle_id) => {
        let { type } = utils.splitArgName(selected_handle_id);
        selected_handles.push({
          data_key_to_map: selected_handle_id,
          node_id_to_map: node.id,
          label: node.data.custom_label || utils.getDisplayCopy("nodes", node.type),
          type,
        });
      });
    }
  });
  return selected_handles;
}

function deselectAllNodesAndHandles() {
  rf_instance.setNodes((nds) =>
    nds.map((node) => {
      if (node.data.aux.selected) node.data.aux.selected = false;
      node.data.aux.selected_handles = [];
      return node;
    })
  );
}

function deselectAllHandles() {
  rf_instance.setNodes((nds) =>
    nds.map((node) => {
      node.data.aux.selected_handles = [];
      return node;
    })
  );
}

function getEdgeObject(source, sourceHandle, target, targetHandle) {
  return {
    id: `reactflow__edge-${source}${sourceHandle}__${target}${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

function screenCoordsToReactFlow(point_on_screen) {
  return rf_instance.screenToFlowPosition(point_on_screen);
}

export default VisualEditor;

export {
  updateNodeDataKey,
  addNodeToTheEditor,
  addNodesArrayToTheEditor,
  addEdgesArrayToTheEditor,
  getSelectedHandles,
  deselectAllHandles,
  deselectAllNodesAndHandles,
  removeNodesAndEdgesFromModel,
  getZoom,
  setZoom,
  fitView,
  getEdgeObject,
  screenCoordsToReactFlow
};
