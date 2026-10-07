import state from "../state";
import utils from "../utils";
import { updateNodeDataKey } from "../components/VisualEditor";

/**
 * Node types whose parameter can be pinned to the parameters panel, with the data key that holds it
 * @type {Object.<string, {data_key: string, kind: import("./types").ParamEleFavoriteKind}>}
 */
const FAVORITABLE_NODE_TYPES = {
  inputNumber: { data_key: "value-value", kind: "number" },
  inputString: { data_key: "value-string", kind: "string" },
  variableRange: { data_key: "slider-value", kind: "range" },
};

function getFavoritableParameter(node_type) {
  return FAVORITABLE_NODE_TYPES[node_type] || null;
}

function getNodeLabel(node) {
  return node.data.custom_label || `${utils.getDisplayCopy("nodes", node.type)} (${node.id})`;
}

/**
 * Slider limits for a number parameter that has none: from 0 to twice its value, or ±10 when it is 0
 * @param {number} value
 * @returns {{min: number, max: number, step: number}}
 */
function getDefaultRange(value) {
  value = Number(value) || 0;
  let min = value === 0 ? -10 : Math.min(0, 2 * value);
  let max = value === 0 ? 10 : Math.max(0, 2 * value);
  return { min, max, step: getDefaultStep(max - min) };
}

// About 100 to 1000 steps along the slider, rounded to a power of ten
function getDefaultStep(span) {
  if (!(span > 0)) return 1;
  return Math.pow(10, Math.floor(Math.log10(span)) - 2);
}

/**
 * Adds or removes the parameter of a node from the favorites of the current model
 * @param {object} node ReactFlow node
 * @returns {boolean} Whether the parameter is a favorite after the change
 */
function toggleFavorite(node) {
  let parameter = getFavoritableParameter(node.type);
  if (!parameter) return false;
  let is_favorite = false;
  state.updateCurrentModel((model) => {
    let favorites = model.favorites || [];
    if (favorites.some(({ node_id }) => node_id === node.id)) {
      model.favorites = favorites.filter(({ node_id }) => node_id !== node.id);
    } else {
      /** @type {import("./types").ParamEleFavoriteParameter} */
      let favorite = { node_id: node.id, data_key: parameter.data_key };
      if (parameter.kind === "number") Object.assign(favorite, getDefaultRange(node.data[parameter.data_key]));
      model.favorites = [...favorites, favorite];
      is_favorite = true;
    }
  });
  utils.updatePropertiesPanel();
  return is_favorite;
}

/**
 * Changes the slider limits of a favorite
 * @param {string} node_id
 * @param {{min?: number, max?: number, step?: number}} range_update
 */
function updateFavoriteRange(node_id, range_update) {
  state.updateCurrentModel((model) => {
    model.favorites = (model.favorites || []).map((favorite) => (favorite.node_id === node_id ? { ...favorite, ...range_update } : favorite));
  });
  utils.updatePropertiesPanel();
}

/**
 * Pairs each favorite with its node, skipping favorites whose node no longer exists
 * @param {import("./types").ParamEleFavoriteParameter[]} favorites
 * @param {object[]} nodes ReactFlow nodes
 */
function getFavoritesWithNodes(favorites = [], nodes = []) {
  let nodes_by_id = {};
  nodes.forEach((node) => (nodes_by_id[node.id] = node));
  return favorites
    .filter(({ node_id }) => nodes_by_id[node_id] && getFavoritableParameter(nodes_by_id[node_id].type))
    .map((favorite) => {
      let node = nodes_by_id[favorite.node_id];
      return { favorite, node, kind: getFavoritableParameter(node.type).kind };
    });
}

/**
 * Nodes of the current model whose parameter can be added to the favorites and is not one yet
 * @param {import("./types").ParamEleFavoriteParameter[]} favorites
 * @param {object[]} nodes ReactFlow nodes
 */
function getFavoriteCandidates(favorites = [], nodes = []) {
  let favorite_ids = new Set(favorites.map(({ node_id }) => node_id));
  return nodes.filter((node) => getFavoritableParameter(node.type) && !favorite_ids.has(node.id));
}

function setParameterValue(node_id, data_key, value) {
  updateNodeDataKey(node_id, data_key, value);
  state.updateStateFromFlow();
}

const favorites = {
  getFavoritableParameter,
  getNodeLabel,
  getDefaultRange,
  toggleFavorite,
  updateFavoriteRange,
  getFavoritesWithNodes,
  getFavoriteCandidates,
  setParameterValue,
};

export default favorites;
