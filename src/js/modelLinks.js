import getState from "../getState";
import state from "../state";
import utils from "../utils";

// Links between the three places that show the model: the boxes in the editor, the structural elements in the renderer
// and the explorer. The elements of each box come from the origins the logic runner records, which are only for the main model

// Elements that are drawn in the renderer (sections and materials are not)
const DRAWN_KEYS = ["nodes", "members", "plates", "supports", "point_loads", "distributed_loads", "pressures", "moments"];

const listeners = { elements: new Set(), highlight: new Set(), show_view: new Set() };
// Changes every time the elements are calculated again, for components that only read them when they render
let elements_version = 0;

function subscribe(kind, listener) {
  listeners[kind].add(listener);
  return () => listeners[kind].delete(listener);
}

function emit(kind, ...args) {
  listeners[kind].forEach((listener) => listener(...args));
}

/**
 * The logic runner calculated the elements of the boxes again
 */
function notifyElementsChange() {
  elements_version += 1;
  emit("elements");
}

function onElementsChange(listener) {
  return subscribe("elements", listener);
}

function getElementsVersion() {
  return elements_version;
}

/**
 * Whether the editor shows the main model, the one the elements in the renderer come from (not the inner logic of a box)
 */
function isEditingMainModel() {
  return getState("model_path").length === 1;
}

/**
 * Structural elements drawn in the renderer that a box of the main model creates (several when the model has ranges).
 * The elements of a group box are the ones its inner model creates
 * @param {string} node_id
 * @returns {{structure_key: string, element_id: string}[]}
 */
function getBoxElements(node_id) {
  let elements = [];
  ["structure_origins", "structure_group_origins"].forEach((variable) => {
    let origins = state.getGlobalVariable(variable) || {};
    DRAWN_KEYS.forEach((structure_key) => {
      Object.entries(origins[structure_key] || {}).forEach(([element_id, origin_id]) => {
        if (origin_id === node_id) elements.push({ structure_key, element_id });
      });
    });
  });
  return elements;
}

/**
 * An element created inside a group box, which cannot be edited from the renderer, only shown with the box it comes from
 * @param {string} structure_key
 * @param {number|string} element_id
 * @returns {import("./types").ParamEleDrawingEntity|null}
 */
function getGroupEntity(structure_key, element_id) {
  let node_id = state.getGlobalVariable("structure_group_origins")?.[structure_key]?.[element_id];
  // The editor may show the inner logic of a box, the elements come from the main model
  let main_model = isEditingMainModel() ? getState("model") : getState().model;
  let node = node_id && main_model.nodes.find(({ id }) => id === node_id);
  if (!node) return null;
  let group = { node_id, label: node.data.custom_label || utils.getDisplayCopy("nodes", node.type) };
  return { node_id, type: node.type, structure_key, element_id: String(element_id), fields: [], group };
}

function hasElements(node_id) {
  return getBoxElements(node_id).length > 0;
}

/**
 * Shows the elements of some boxes highlighted in the renderer, which is brought into view if it is hidden
 * @param {string[]} node_ids Boxes of the main model
 */
function highlightBoxes(node_ids) {
  emit("show_view", "renderer");
  emit("highlight", node_ids);
}

/**
 * @param {function(string[]): void} listener Called with the boxes to highlight
 */
function onHighlight(listener) {
  return subscribe("highlight", listener);
}

/**
 * @param {function("nodes"|"renderer"): void} listener Called with the view that has to be visible
 */
function onShowView(listener) {
  return subscribe("show_view", listener);
}

/**
 * Selects a box of the main model in the editor and centers the view on it. The editor is brought into view if it is hidden,
 * and goes back to the main model if it shows the inner logic of a box
 * @param {string} node_id
 */
function focusBox(node_id) {
  emit("show_view", "nodes");
  if (!isEditingMainModel()) {
    let model_path = getState("model_path");
    let model_path_print = getState("model_path_print");
    state.setState([model_path[0]], "model_path");
    state.setState([model_path_print[0]], "model_path_print");
    state.setModelToEditor(getState("model"));
    utils.updateNavigator();
  }
  // React Flow measures the boxes and the editor after they are shown
  requestAnimationFrame(() => requestAnimationFrame(() => centerOnBox(node_id)));
}

function centerOnBox(node_id) {
  let rf_instance = state.getRfInstance();
  let node = rf_instance.getNode(node_id);
  if (!node) return;
  rf_instance.setNodes((nds) => nds.map((nd) => (Boolean(nd.selected) === (nd.id === node_id) ? nd : { ...nd, selected: nd.id === node_id })));
  let position = node.positionAbsolute || node.position;
  let x = position.x + (node.width || 0) / 2;
  let y = position.y + (node.height || 0) / 2;
  rf_instance.setCenter(x, y, { zoom: Math.max(rf_instance.getZoom(), 0.8), duration: 400 });
}

const modelLinks = {
  notifyElementsChange,
  onElementsChange,
  getElementsVersion,
  isEditingMainModel,
  getBoxElements,
  hasElements,
  getGroupEntity,
  highlightBoxes,
  onHighlight,
  onShowView,
  focusBox,
};

export default modelLinks;
