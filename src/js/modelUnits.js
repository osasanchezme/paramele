// Changing the units of the model: the numbers the user typed are converted, so the structure stays the same
import getState from "../getState";
import state from "../state";
import utils from "../utils";
import units from "./units";
import unitInference from "./unitInference";
import logic_runner from "./globalLogicRunner";
import settings_template from "../settings_template.json";

// Values of each box that are in the unit of its adaptive handle
const VALUE_KEYS = {
  inputNumber: ["value-value"],
  variableRange: ["start-value", "end-value", "step-value", "slider-value"],
};

/**
 * Units of the current model
 * @returns {object}
 */
function getModelUnits() {
  return units.repairUnits(getState("settings").units);
}

/**
 * A converted number without the noise of the conversion (0.30480000000000002), as text when it was text
 * @param {any} value
 * @param {number} factor
 */
function convertValue(value, factor) {
  if (value === null || value === undefined || value === "") return value;
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  const converted = units.roundConverted(number * factor);
  return typeof value === "string" ? String(converted) : converted;
}

/**
 * Converts in place the values of the number and slider boxes of a model (and of its group boxes) between model units
 * @param {{nodes: object[], edges: object[]}} model
 * @param {object} from_units
 * @param {object} to_units
 * @returns {number} How many boxes were converted
 */
function convertModelValues(model, from_units, to_units) {
  const factors = new Map();
  unitInference.forEachAdaptiveValue(model, utils.getNodesLibrary().units, from_units, (node, unit) => {
    const factor = units.getChangeFactor(unit, from_units, to_units);
    if (Math.abs(factor - 1) < 1e-12) return;
    (VALUE_KEYS[node.type] || []).forEach((key) => {
      if (key in node.data) node.data[key] = convertValue(node.data[key], factor);
    });
    factors.set(node, factor);
  });
  convertFavorites(model, factors);
  return factors.size;
}

/**
 * Converts the limits of the sliders of the favorite parameters of a model (and of its group boxes) as their boxes were
 * @param {object} model
 * @param {Map<object, number>} factors By box
 */
function convertFavorites(model, factors) {
  const factor_by_id = {};
  (model?.nodes || []).forEach((node) => {
    if (factors.has(node)) factor_by_id[node.id] = factors.get(node);
    if (node.data?.internal_logic) convertFavorites(node.data.internal_logic, factors);
  });
  (model?.favorites || []).forEach((favorite) => {
    const factor = factor_by_id[favorite.node_id];
    if (!factor) return;
    ["min", "max", "step"].forEach((key) => {
      if (key in favorite) favorite[key] = convertValue(favorite[key], factor);
    });
  });
}

/**
 * Converts the settings that are lengths (the mesh size...) between model units
 * @param {object} global_settings Changed in place
 */
function convertGlobalSettings(global_settings, from_units, to_units) {
  Object.entries(settings_template.global).forEach(([key, { quantity }]) => {
    if (!quantity || !(key in global_settings)) return;
    global_settings[key] = convertValue(global_settings[key], units.convertQuantity(1, quantity, from_units, to_units));
  });
}

/**
 * Changes the units of the model, converting the values of its boxes and settings
 * @param {object} new_units Settings units
 * @returns {number} How many boxes were converted
 */
function changeModelUnits(new_units) {
  const from_units = getModelUnits();
  const to_units = units.repairUnits(new_units);
  if (JSON.stringify(from_units) === JSON.stringify(to_units)) return 0;
  const full_state = getState();
  const count = convertModelValues(full_state.model, from_units, to_units);
  convertGlobalSettings(full_state.settings.global, from_units, to_units);
  full_state.settings.units = to_units;
  state.setState({ model: full_state.model, settings: full_state.settings });
  // The editor shows the model the user is in (maybe the inner model of a group box)
  const current_model = getState("model");
  state.setModelToEditor(current_model);
  logic_runner.run(current_model);
  return count;
}

const modelUnits = { getModelUnits, changeModelUnits, convertModelValues, convertGlobalSettings };

export default modelUnits;
