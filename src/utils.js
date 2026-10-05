import getState from "./getState";
import { getEmptyStructuralModel as getEmptyStructuralModelFromParsers } from "./submodules/paramele-parsers/utils/model";

/**
 *
 * @param {String} test_string
 * @param {[String]} options_array
 */
function getClosestMatches(test_string, options_array) {
  let scores = [];
  options_array.forEach((option) => {
    scores.push({
      name: option,
      score: scoreCompareStrings(option, test_string),
    });
  });
  scores.sort(function (x, y) {
    return y.score - x.score;
  });
  return scores;
}

/**
 * Using longest common subsequence (LCS) algorithm and custom (self-made) start matching
 * @param {*} text1
 * @param {*} text2
 * @returns
 */
function scoreCompareStrings(text1, text2) {
  const result = new Array(text1.length + 1).fill(null).map(() => new Array(text2.length + 1).fill(null));
  function test(end1, end2) {
    if (end1 === -1 || end2 === -1) {
      return 0;
    }
    if (result[end1][end2] !== null) {
      return result[end1][end2];
    }
    if (text1[end1] === text2[end2]) {
      result[end1][end2] = 1 + test(end1 - 1, end2 - 1);
      return result[end1][end2];
    } else {
      result[end1][end2] = Math.max(test(end1 - 1, end2), test(end1, end2 - 1));
      return result[end1][end2];
    }
  }
  function checkStartMatches(text1, text2) {
    let limit = Math.min(text1.length, text2.length);
    let count = 0;
    let still_same = true;
    for (let i = 0; i < limit; i++) {
      if (String(text1).toLowerCase()[count] === String(text2).toLowerCase()[count]) {
        if (still_same) count++;
      } else {
        still_same = false;
      }
    }
    return count;
  }
  return test(text1.length - 1, text2.length - 1) + checkStartMatches(text1, text2);
}

function nextNodeId() {
  let nodes = getState("model")["nodes"];
  let possible_index = 1;
  let node_ids = nodes.map((node) => {
    return node.id;
  });
  let found_id = false;
  while (!found_id) {
    node_ids.includes(`node-${possible_index}`) ? possible_index++ : (found_id = true);
  }
  return getNodeFullID(possible_index);
}

function nextNodeIndex(nodes) {
  nodes = nodes == undefined ? getState("model")["nodes"] : nodes;
  let possible_index = 1;
  let node_ids = nodes.map((node) => {
    return node.id;
  });
  let found_id = false;
  while (!found_id) {
    node_ids.includes(`node-${possible_index}`) ? possible_index++ : (found_id = true);
  }
  return possible_index;
}

const getNodeFullID = (node_index) => `node-${node_index}`;

/**
 *
 * @param {"nodes"|"members"} element_type
 * @param {object} structure - Last structure in which to find the next available ID
 */
function nextStructuralId(element_type, structure) {
  let element_keys = Object.keys(structure[element_type]);
  let next_possible_id = 1;
  let found_next = false;
  while (!found_next) {
    if (element_keys.includes(String(next_possible_id))) next_possible_id += 1;
    else found_next = true;
  }
  return next_possible_id;
}

function getEmptyStructuralModel() {
  return getEmptyStructuralModelFromParsers();
}

function updateRenderer() {
  window.ParamEle.updateRenderer();
}

function updateNavigator() {
  window.ParamEle.updateNavigator();
}

function getNodesLibrary() {
  return window.ParamEle.nodesLibrary;
}

function openGlobalSettings() {
  return window.ParamEle.openGlobalSettings();
}

function showLoadingDimmer(msg) {
  return window.ParamEle.showLoadingDimmer(msg);
}

function hideLoadingDimmer(msg) {
  return window.ParamEle.hideLoadingDimmer(msg);
}

function setLoadingDimmerMsg(msg) {
  return window.ParamEle.setLoadingDimmerMsg(msg);
}

function setUser(auth) {
  window.ParamEle.setUser(auth);
}
function getUser() {
  window.ParamEle.getUser();
}

/**
 * Converts the arguments from a React flow node to structural arguments
 * @param {*} args
 */
function convertNodeToStructuralArgs(args, full_args_key_list) {
  let structural_args = {};
  full_args_key_list.forEach((arg_key) => {
    if (!args.hasOwnProperty(arg_key)) args[arg_key] = null;
  });
  Object.entries(args).forEach(([arg_key, arg_value]) => {
    let key_parts = arg_key.split("-");
    let structural_key = key_parts[0];
    let arg_type = key_parts[1];
    let arg_default = key_parts[2];
    switch (arg_type) {
      case "value":
        let potential_value = arg_value == null ? undefined : Number(arg_value);
        if (typeof arg_default === "undefined" || isNaN(Number(arg_default))) arg_default = 0;
        structural_args[structural_key] = isNaN(potential_value) ? Number(arg_default) : potential_value;
        break;
      case "name":
      case "string":
        if (typeof arg_default === "undefined") arg_default = "default";
        structural_args[structural_key] = String(arg_value) === "null" ? arg_default : String(arg_value);
        break;
      case "id":
        if (typeof arg_default === "undefined") arg_default = 1;
        if (arg_value === null) arg_value = 1;
        structural_args[structural_key] = isNaN(Number(arg_value)) ? arg_default : Number(arg_value);
        break;
      case "ids":
      default:
        structural_args[structural_key] = arg_value;
        break;
    }
  });
  return structural_args;
}

function getDefaultValueForArg(type, default_value) {
  switch (type) {
    case "value":
      if (typeof default_value === "undefined" || isNaN(Number(default_value))) default_value = 0;
      break;
    case "name":
      if (typeof default_value === "undefined") default_value = "default";
      break;
    case "id":
      if (typeof default_value === "undefined") default_value = 1;
      break;
    case "ids":
    default:
      default_value = null;
      break;
  }
  return default_value;
}

/**
 *
 * @param {String} arg_id
 * @param {"target"|"source"} type
 */
function splitArgName(arg_id, type) {
  let string_id = typeof arg_id === "object" ? arg_id.id : arg_id;
  let components = string_id.split("-");
  let default_value = getDefaultValueForArg(components[1], components[2]);
  if (type === "source") components[0] = components[0].replace("_out", "");
  let show_handle = arg_id.hasOwnProperty("show_handle") ? arg_id.show_handle : true;
  let input_type = arg_id.hasOwnProperty("input_type") ? arg_id.input_type : null;
  let data = arg_id.hasOwnProperty("data") ? arg_id.data : null;
  return {
    name: components[0],
    type: components[1],
    default_value,
    show_handle,
    input_type,
    data,
  };
}

function getDisplayCopy(copy_group, copy_key) {
  if (window.ParamEle.state.words_map.hasOwnProperty(copy_group) && window.ParamEle.state.words_map[copy_group].hasOwnProperty(copy_key))
    copy_key = window.ParamEle.state.words_map[copy_group][copy_key];
  return copy_key;
}

function updatePropertiesPanel() {
  window.ParamEle.updateNodesFromLocalState();
}

function findHighestZCoordinate(nodes) {
  let highest_z = 0;
  Object.values(nodes).forEach((node) => {
    if (node.z > highest_z) highest_z = node.z;
  });
  return highest_z;
}
function allIndexOf(arr, value) {
  const indexes = [];

  arr.forEach((element, index) => {
    if (element === value) {
      indexes.push(index);
    }
  });

  return indexes;
}

/**
 * Generates a unique ID with a prefix fo (folder) or fi (file), the date in ms and 5 random letters
 * @param {"folder"|"file"} mode
 * @returns {string} Unique ID
 */
function generateUniqueID(mode) {
  let uid = Date.now();
  let prefix = mode === "folder" ? "fo" : "fi";
  uid = prefix + uid + getRandomSuffix();
  return uid;
}

/**
 *
 * @param {string} unique_id
 * @returns {string}
 */
function decodeUniqueIDToName(unique_id) {
  let regex_match = unique_id.match(/(.*)__[a-zA-Z0-9]+$/);
  if (regex_match == null) {
    console.log(`Couldn't decode unique id: ${unique_id}!`);
    return unique_id;
  }
  return regex_match[1];
}

function getRandomSuffix(suffix_length) {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (suffix_length == undefined) suffix_length = 5;
  let suffix = "";
  for (let i = 0; i <= suffix_length; i++) {
    suffix += letters[Math.round(Math.random() * 51)];
  }
  return suffix;
}

function isIdFromFolder(id) {
  return id.substring(0, 2) === "fo";
}

/**
 * Converts a UNIX timestamp to a formatted string
 * @param {number} timestamp
 */
function getFormattedDate(timestamp) {
  let formatted_date = new Date(timestamp);
  return `${formatted_date.toDateString()}, ${formatted_date.toLocaleTimeString()}`;
}

/**
 * Returns the default aux data that needs to be present on every node but should not be saved
 * @returns
 */
function getDefaultAuxData() {
  return {
    selected_handles: [],
    selected: false,
  };
}

function print(string) {
  if (!isNaN(string)) string = Number(string).toPrecision(3);
  return string;
}

const utils = {
  getClosestMatches,
  nextNodeId,
  nextStructuralId,
  getEmptyStructuralModel,
  updateRenderer,
  convertNodeToStructuralArgs,
  splitArgName,
  getDisplayCopy,
  getNodesLibrary,
  updatePropertiesPanel,
  updateNavigator,
  openGlobalSettings,
  findHighestZCoordinate,
  allIndexOf,
  getUser,
  setUser,
  generateUniqueID,
  isIdFromFolder,
  showLoadingDimmer,
  setLoadingDimmerMsg,
  hideLoadingDimmer,
  getFormattedDate,
  getDefaultAuxData,
  decodeUniqueIDToName,
  getNodeFullID,
  nextNodeIndex,
  print
};

export default utils;
