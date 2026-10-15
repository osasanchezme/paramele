import { cloneDeep } from "lodash";
import getState from "../getState";
import state from "../state";
import utils from "../utils";
import { getEdgeObject } from "../components/VisualEditor";
import { notify } from "../components/notification";

// Drawing in the renderer only edits the boxes and links model, the logic runner then builds the structure from it as usual.
// Every box created here is tagged with data.drawn, so it is laid out in its own columns and removed once nothing uses it.

const TOLERANCE = 1e-6;
const COLUMN_WIDTH = 300;
const ROW_GAP = 24;
const GRAPH_GAP = 400;
const MAX_UNDO_STEPS = 50;
// Sections and materials go last, so the boxes drawn before they existed keep their columns
const COLUMNS = ["parameters", "nodes", "elements", "loads", "sections"];
// Height of a box that React Flow has not measured yet
const ESTIMATED_HEIGHTS = {
  inputNumber: 70,
  inputString: 70,
  structuralNode: 130,
  structuralMember: 130,
  structuralPlate: 100,
  structuralGenericSupport: 130,
  structuralPointLoad: 150,
  structuralMoment: 150,
  structuralDistributedLoad: 330,
  structuralPressure: 170,
  structuralRectangleSection: 110,
  structuralCircularSection: 90,
  structuralMaterial: 150,
};
// Boxes that cannot exist without the box they take an ID from
const DEPENDENT_TYPES = new Set([
  "structuralMember",
  "structuralPlate",
  "structuralFixedSupport",
  "structuralPinSupport",
  "structuralGenericSupport",
  "structuralPointLoad",
  "structuralMoment",
  "structuralDistributedLoad",
  "structuralPressure",
]);
// Inputs that take the section of a member and the material of a section or a plate
const SECTION_HANDLE = "section_id-id-1";
const MATERIAL_HANDLE = "material_id-id-1";
const SUPPORT_TYPES = new Set(["structuralFixedSupport", "structuralPinSupport", "structuralGenericSupport"]);

/** @type {{before: {nodes: object[], edges: object[]}, after_signature: string}[]} */
let undo_stack = [];
const undo_listeners = new Set();

function isSameValue(value_a, value_b) {
  if (typeof value_a === "string" || typeof value_b === "string") return String(value_a) === String(value_b);
  return Math.abs(Number(value_a) - Number(value_b)) < TOLERANCE;
}

function roundValue(value) {
  return Number(Number(value).toPrecision(10));
}

function getModelSignature(nodes, edges) {
  let node_keys = nodes.map(({ id, type }) => `${id}:${type}`).sort();
  let edge_keys = edges.map(({ id }) => id).sort();
  return `${node_keys.join(",")}|${edge_keys.join(",")}`;
}

/**
 * A group of changes to the boxes and links model that is applied (and undone) at once
 */
class DrawingTransaction {
  constructor() {
    // The editor is more up to date than the global state, which is copied from it with a delay
    let rf_instance = state.getRfInstance();
    this.nodes = cloneDeep(rf_instance.getNodes());
    this.edges = cloneDeep(rf_instance.getEdges());
    this.before = { nodes: cloneDeep(this.nodes), edges: cloneDeep(this.edges) };
    this.structure = getState("structure");
    this.origins = state.getGlobalVariable("structure_origins") || {};
    this.layout = this.getLayout();
  }
  getNode(node_id) {
    return this.nodes.find(({ id }) => id === node_id);
  }
  /**
   * Gets the box that created a structural element, if it is still in the model
   * @param {string} structure_key e.g. "nodes", "members"
   * @param {number|string} element_id
   */
  getOriginNodeId(structure_key, element_id) {
    let node_id = this.origins[structure_key]?.[element_id];
    return node_id && this.getNode(node_id) ? node_id : null;
  }
  getIncomingEdges(node_id, target_handle) {
    return this.edges.filter(({ target, targetHandle }) => target === node_id && (target_handle === undefined || targetHandle === target_handle));
  }
  getOutgoingEdges(node_id) {
    return this.edges.filter(({ source }) => source === node_id);
  }
  /**
   * Coordinates of a structural node box, from the last evaluation or from when it was drawn if it was not evaluated yet
   */
  getNodeCoordinates(node_id) {
    let structural_id = Object.keys(this.origins.nodes || {}).find((element_id) => this.origins.nodes[element_id] === node_id);
    if (structural_id !== undefined && this.structure.nodes[structural_id]) {
      let { x, y, z } = this.structure.nodes[structural_id];
      return { x, y, z };
    }
    return this.getNode(node_id)?.data?.drawn?.coords || null;
  }
  getLayout() {
    let drawn_nodes = this.nodes.filter((node) => node.data?.drawn?.column);
    let anchor;
    if (drawn_nodes.length > 0) {
      // Follows the drawn boxes if the user moved them
      anchor = { x: Infinity, y: Infinity };
      drawn_nodes.forEach(({ position, data }) => {
        anchor.x = Math.min(anchor.x, position.x - COLUMNS.indexOf(data.drawn.column) * COLUMN_WIDTH);
        anchor.y = Math.min(anchor.y, position.y);
      });
    } else if (this.nodes.length > 0) {
      // Right of the existing graph
      anchor = { x: -Infinity, y: Infinity };
      this.nodes.forEach(({ position, width }) => {
        anchor.x = Math.max(anchor.x, position.x + (width || 200));
        anchor.y = Math.min(anchor.y, position.y);
      });
      anchor.x += GRAPH_GAP;
    } else {
      anchor = { x: 0, y: 0 };
    }
    let column_bottoms = {};
    COLUMNS.forEach((column) => (column_bottoms[column] = anchor.y));
    drawn_nodes.forEach((node) => {
      let { column } = node.data.drawn;
      column_bottoms[column] = Math.max(column_bottoms[column], node.position.y + this.getNodeHeight(node) + ROW_GAP);
    });
    return { anchor, column_bottoms };
  }
  getNodeHeight(node) {
    return node.height || ESTIMATED_HEIGHTS[node.type] || 130;
  }
  /**
   * Adds a box in the next free spot of its column
   * @param {import("./types").ParamEleNodesTypes} type
   * @param {"parameters"|"nodes"|"elements"|"loads"|"sections"} column
   * @param {object} data
   * @param {object} [drawn_data] Extra data kept under data.drawn
   * @returns {string} ID of the new box
   */
  addBox(type, column, data = {}, drawn_data = {}) {
    let id = utils.getNodeFullID(utils.nextNodeIndex(this.nodes));
    let { anchor, column_bottoms } = this.layout;
    let position = { x: anchor.x + COLUMNS.indexOf(column) * COLUMN_WIDTH, y: column_bottoms[column] };
    let node = { id, type, position, data: { ...data, aux: utils.getDefaultAuxData(), drawn: { column, ...drawn_data } } };
    column_bottoms[column] += this.getNodeHeight(node) + ROW_GAP;
    this.nodes.push(node);
    return id;
  }
  connect(source, source_handle, target, target_handle) {
    let edge = getEdgeObject(source, source_handle, target, target_handle);
    if (!this.edges.some(({ id }) => id === edge.id)) this.edges.push(edge);
  }
  /**
   * Finds a source to reuse for an input with a given value: whatever already feeds that input with the same value on another box,
   * otherwise a drawn parameter with that value, otherwise a new parameter.
   * @param {object} options
   * @param {string[]} options.target_types Box types whose inputs can share the source
   * @param {string} options.target_handle
   * @param {number|string} options.value
   * @param {string} options.param_key Name of the parameter, e.g. "x" or "Fz"
   * @param {boolean} [options.force_new] Always creates a new parameter
   * @returns {{source: string, source_handle: string}}
   */
  getSharedSource({ target_types, target_handle, value, param_key, force_new = false }) {
    let is_string = typeof value === "string";
    let value_handle = is_string ? "value-string" : "value-value";
    if (force_new) return this.addParameter(param_key, value);
    for (let edge of this.edges) {
      if (edge.targetHandle !== target_handle) continue;
      let target_node = this.getNode(edge.target);
      let source_node = this.getNode(edge.source);
      if (!target_node || !source_node || !target_types.includes(target_node.type)) continue;
      let source_value = source_node.data[edge.sourceHandle];
      if (source_value === undefined || source_value === null || source_value === "") continue;
      if (isSameValue(source_value, value)) return { source: edge.source, source_handle: edge.sourceHandle };
    }
    let parameter = this.nodes.find(({ data }) => data?.drawn?.param === param_key && isSameValue(data[value_handle], value));
    if (parameter) return { source: parameter.id, source_handle: value_handle };
    return this.addParameter(param_key, value);
  }
  /**
   * @param {string} param_key
   * @param {number|string} value
   * @returns {{source: string, source_handle: string}}
   */
  addParameter(param_key, value) {
    let is_string = typeof value === "string";
    let value_handle = is_string ? "value-string" : "value-value";
    // Parameters are named like grid lines: X1, X2, Fz1...
    let used_indices = this.nodes.filter(({ data }) => data?.drawn?.param === param_key).map(({ data }) => data.drawn.index || 0);
    let index = used_indices.length > 0 ? Math.max(...used_indices) + 1 : 1;
    let source = this.addBox(
      is_string ? "inputString" : "inputNumber",
      "parameters",
      { custom_label: `${param_key}${index}`, [value_handle]: is_string ? value : roundValue(value) },
      { param: param_key, index }
    );
    return { source, source_handle: value_handle };
  }
  /**
   * Whether a point can take part in a new element. Nodes created inside a group box have no box here to link to,
   * and a new node on top of them would not be connected to their elements
   * @param {import("./types").ParamEleDrawingPoint} point
   */
  isEditablePoint(point) {
    if (point.node_id && this.getNode(point.node_id)) return true;
    return point.structural_id === undefined || this.getOriginNodeId("nodes", point.structural_id) !== null;
  }
  /**
   * Gets the structural node box at a point, creating it with shared coordinate parameters when there is none
   * @param {import("./types").ParamEleDrawingPoint} point
   * @returns {string} ID of the structural node box
   */
  resolvePoint(point) {
    if (point.node_id && this.getNode(point.node_id)) return point.node_id;
    if (point.structural_id !== undefined) {
      let origin_node_id = this.getOriginNodeId("nodes", point.structural_id);
      if (origin_node_id) return origin_node_id;
    }
    let coords = { x: roundValue(point.x), y: roundValue(point.y), z: roundValue(point.z) };
    let existing_node = this.nodes.find((node) => {
      if (node.type !== "structuralNode") return false;
      let node_coords = this.getNodeCoordinates(node.id);
      return node_coords && ["x", "y", "z"].every((axis) => isSameValue(node_coords[axis], coords[axis]));
    });
    if (existing_node) return existing_node.id;

    // Sources first, so the coordinate parameters are listed before the node in the same group of boxes
    let sources = {};
    ["x", "y", "z"].forEach((axis) => {
      sources[axis] = this.getSharedSource({
        target_types: ["structuralNode"],
        target_handle: `${axis}-value`,
        value: coords[axis],
        param_key: axis.toUpperCase(),
      });
    });
    let node_id = this.addBox("structuralNode", "nodes", {}, { coords });
    Object.entries(sources).forEach(([axis, { source, source_handle }]) => this.connect(source, source_handle, node_id, `${axis}-value`));
    return node_id;
  }
  /**
   * Connects the non zero components of a load to shared parameters
   * @param {string} target
   * @param {import("./types").ParamEleNodesTypes} target_type
   * @param {{x: number, y: number, z: number}} magnitudes
   * @param {string} param_prefix e.g. "F", "M", "w"
   * @param {function(string): string[]} getHandles Handles that take the component of an axis
   */
  connectMagnitudes(target, target_type, magnitudes, param_prefix, getHandles) {
    ["x", "y", "z"].forEach((axis) => {
      let value = Number(magnitudes[axis]) || 0;
      if (value === 0) return;
      let handles = getHandles(axis);
      // Every handle of the same component shares one parameter
      let { source, source_handle } = this.getSharedSource({
        target_types: [target_type],
        target_handle: handles[0],
        value,
        param_key: `${param_prefix}${axis}`,
      });
      handles.forEach((target_handle) => this.connect(source, source_handle, target, target_handle));
    });
  }
  /**
   * Removes boxes, the boxes that depend on them and the drawn boxes left unused
   * @param {string[]} node_ids
   */
  removeBoxes(node_ids) {
    let to_remove = new Set(node_ids);
    let pending = [...node_ids];
    while (pending.length > 0) {
      let node_id = pending.pop();
      this.getOutgoingEdges(node_id).forEach(({ target }) => {
        let target_node = this.getNode(target);
        if (target_node && DEPENDENT_TYPES.has(target_node.type) && !to_remove.has(target)) {
          to_remove.add(target);
          pending.push(target);
        }
      });
    }
    this.removeNodeIds(to_remove);
    // Unused drawn boxes (nodes left without members, parameters left without inputs)
    let removed_any = true;
    while (removed_any) {
      let unused = this.nodes.filter(
        (node) =>
          node.data?.drawn && ["structuralNode", "inputNumber", "inputString"].includes(node.type) && this.getOutgoingEdges(node.id).length === 0
      );
      removed_any = unused.length > 0;
      this.removeNodeIds(new Set(unused.map(({ id }) => id)));
    }
  }
  removeNodeIds(node_ids) {
    this.nodes = this.nodes.filter(({ id }) => !node_ids.has(id));
    this.edges = this.edges.filter(({ source, target }) => !node_ids.has(source) && !node_ids.has(target));
  }
  commit() {
    undo_stack.push({ before: this.before, after_signature: getModelSignature(this.nodes, this.edges) });
    if (undo_stack.length > MAX_UNDO_STEPS) undo_stack.shift();
    state.setModelToEditor({ nodes: this.nodes, edges: this.edges });
    undo_listeners.forEach((listener) => listener());
  }
}

/**
 * Draws a member between two points
 * @param {import("./types").ParamEleDrawingPoint} point_A
 * @param {import("./types").ParamEleDrawingPoint} point_B
 * @param {string|null} [section_node_id] Section box of the member, "default" for none, or null to take the one of the last drawn member
 * @returns {string|null} ID of the structural node box at the end, to continue drawing from it
 */
function addMember(point_A, point_B, section_node_id = null) {
  let transaction = new DrawingTransaction();
  if (![point_A, point_B].every((point) => transaction.isEditablePoint(point))) {
    notify("warning", "drawing_not_editable", null, true);
    return null;
  }
  let node_A = transaction.resolvePoint(point_A);
  let node_B = transaction.resolvePoint(point_B);
  if (node_A === node_B) return node_B;
  let node_A_members = transaction.getOutgoingEdges(node_A).map(({ target }) => target);
  let is_duplicate = transaction
    .getOutgoingEdges(node_B)
    .some(({ target }) => node_A_members.includes(target) && transaction.getNode(target)?.type === "structuralMember");
  if (is_duplicate) {
    notify("warning", "drawing_duplicate_member", null, true);
    return node_B;
  }
  let member = transaction.addBox("structuralMember", "elements");
  transaction.connect(node_A, "node_out-id", member, "node_A-id");
  transaction.connect(node_B, "node_out-id", member, "node_B-id");
  if (section_node_id) {
    if (transaction.getNode(section_node_id)) transaction.connect(section_node_id, "section_out-id", member, SECTION_HANDLE);
    transaction.commit();
    return node_B;
  }
  // Otherwise new members take the section of the last drawn member, or the most used one
  let section_edges = transaction.edges.filter(
    ({ target, targetHandle }) => targetHandle === SECTION_HANDLE && transaction.getNode(target)?.type === "structuralMember"
  );
  if (section_edges.length > 0) {
    let drawn_section_edges = section_edges.filter(({ target }) => transaction.getNode(target).data?.drawn);
    let section_edge = drawn_section_edges[drawn_section_edges.length - 1];
    if (!section_edge) {
      let counts = {};
      section_edges.forEach((edge) => (counts[edge.source] = (counts[edge.source] || 0) + 1));
      let most_used = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      section_edge = section_edges.find(({ source }) => source === most_used);
    }
    transaction.connect(section_edge.source, section_edge.sourceHandle, member, SECTION_HANDLE);
  }
  transaction.commit();
  return node_B;
}

/**
 * Draws a plate through 3 or more points
 * @param {import("./types").ParamEleDrawingPoint[]} points
 * @param {number} thickness
 */
function addPlate(points, thickness) {
  let transaction = new DrawingTransaction();
  if (!points.every((point) => transaction.isEditablePoint(point))) {
    notify("warning", "drawing_not_editable", null, true);
    return;
  }
  let node_ids = [];
  points.forEach((point) => {
    let node_id = transaction.resolvePoint(point);
    if (!node_ids.includes(node_id)) node_ids.push(node_id);
  });
  if (node_ids.length < 3) {
    notify("warning", "drawing_plate_points", null, true);
    return;
  }
  let thickness_source = transaction.getSharedSource({
    target_types: ["structuralPlate"],
    target_handle: "thickness-value",
    value: Number(thickness),
    param_key: "t",
  });
  let plate = transaction.addBox("structuralPlate", "elements");
  // The plate takes the nodes in the order of its links
  node_ids.forEach((node_id) => transaction.connect(node_id, "node_out-id", plate, "nodes-ids"));
  transaction.connect(thickness_source.source, thickness_source.source_handle, plate, "thickness-value");
  transaction.commit();
}

function getNodeBoxOrNotify(transaction, structural_node_id) {
  let node_id = transaction.getOriginNodeId("nodes", structural_node_id);
  if (!node_id) notify("warning", "drawing_not_editable", null, true);
  return node_id;
}

function hasMagnitude(magnitudes) {
  if (["x", "y", "z"].some((axis) => Number(magnitudes[axis]))) return true;
  notify("warning", "drawing_zero_load", null, true);
  return false;
}

/**
 * @param {number} structural_node_id
 * @param {{x: number, y: number, z: number}} magnitudes
 */
function addPointLoad(structural_node_id, magnitudes) {
  if (!hasMagnitude(magnitudes)) return;
  let transaction = new DrawingTransaction();
  let node_id = getNodeBoxOrNotify(transaction, structural_node_id);
  if (!node_id) return;
  let load = transaction.addBox("structuralPointLoad", "loads");
  transaction.connect(node_id, "node_out-id", load, "node-id");
  transaction.connectMagnitudes(load, "structuralPointLoad", magnitudes, "F", (axis) => [`${axis}_mag-value`]);
  transaction.commit();
}

/**
 * @param {number} structural_node_id
 * @param {{x: number, y: number, z: number}} magnitudes
 */
function addMoment(structural_node_id, magnitudes) {
  if (!hasMagnitude(magnitudes)) return;
  let transaction = new DrawingTransaction();
  let node_id = getNodeBoxOrNotify(transaction, structural_node_id);
  if (!node_id) return;
  let moment = transaction.addBox("structuralMoment", "loads");
  transaction.connect(node_id, "node_out-id", moment, "node-id");
  transaction.connectMagnitudes(moment, "structuralMoment", magnitudes, "M", (axis) => [`${axis}_mag-value`]);
  transaction.commit();
}

/**
 * Adds a uniform distributed load along the whole member
 * @param {number} structural_member_id
 * @param {{x: number, y: number, z: number}} magnitudes
 */
function addDistributedLoad(structural_member_id, magnitudes) {
  if (!hasMagnitude(magnitudes)) return;
  let transaction = new DrawingTransaction();
  let member_id = transaction.getOriginNodeId("members", structural_member_id);
  if (!member_id) {
    notify("warning", "drawing_not_editable", null, true);
    return;
  }
  let load = transaction.addBox("structuralDistributedLoad", "loads");
  transaction.connect(member_id, "member_out-id", load, "member-id");
  transaction.connectMagnitudes(load, "structuralDistributedLoad", magnitudes, "w", (axis) => [`${axis}_mag_A-value`, `${axis}_mag_B-value`]);
  transaction.commit();
}

/**
 * Adds a uniform pressure over the whole plate
 * @param {number} structural_plate_id
 * @param {{x: number, y: number, z: number}} magnitudes
 * @param {"global"|"local"} axes Axes of the components: global, or the plate's local axes
 */
function addPressure(structural_plate_id, magnitudes, axes) {
  if (!hasMagnitude(magnitudes)) return;
  let transaction = new DrawingTransaction();
  let plate_id = transaction.getOriginNodeId("plates", structural_plate_id);
  if (!plate_id) {
    notify("warning", "drawing_not_editable", null, true);
    return;
  }
  let load = transaction.addBox("structuralPressure", "loads");
  transaction.connect(plate_id, "plate_out-id", load, "plate_id-id");
  transaction.connectMagnitudes(load, "structuralPressure", magnitudes, "p", (axis) => [`${axis}_mag-value`]);
  let axes_source = transaction.getSharedSource({
    target_types: ["structuralPressure"],
    target_handle: "axes-string-global",
    value: axes,
    param_key: "Axes",
  });
  transaction.connect(axes_source.source, axes_source.source_handle, load, "axes-string-global");
  transaction.commit();
}

/**
 * Adds a support to a node, replacing the one it had
 * @param {number} structural_node_id
 * @param {string} restraint_code e.g. "FFFFFF"
 */
function addSupport(structural_node_id, restraint_code) {
  let transaction = new DrawingTransaction();
  let node_id = getNodeBoxOrNotify(transaction, structural_node_id);
  if (!node_id) return;
  let current_supports = transaction
    .getOutgoingEdges(node_id)
    .map(({ target }) => transaction.getNode(target))
    .filter((node) => node && SUPPORT_TYPES.has(node.type));
  // Clicking a node again with the same support removes it
  let same_support = current_supports.find(
    (node) => node.type === "structuralGenericSupport" && node.data?.input?.restraint_code === restraint_code && node.data?.drawn
  );
  if (current_supports.length > 0) transaction.removeBoxes(current_supports.map(({ id }) => id));
  if (!same_support) {
    let restraint_source = transaction.getSharedSource({
      target_types: ["structuralGenericSupport"],
      target_handle: "restraint_code-string-FFFFFF",
      value: restraint_code,
      param_key: "Support",
    });
    let support = transaction.addBox("structuralGenericSupport", "loads");
    transaction.connect(node_id, "node_out-id", support, "node-id");
    transaction.connect(restraint_source.source, restraint_source.source_handle, support, "restraint_code-string-FFFFFF");
  }
  transaction.commit();
}

/**
 * Deletes the box behind a structural element and everything that depends on it
 * @param {string} structure_key e.g. "nodes", "members", "point_loads"
 * @param {number} element_id
 */
function deleteElement(structure_key, element_id) {
  let transaction = new DrawingTransaction();
  let node_id = transaction.getOriginNodeId(structure_key, element_id);
  if (!node_id) {
    notify("warning", "drawing_not_editable", null, true);
    return;
  }
  transaction.removeBoxes([node_id]);
  transaction.commit();
}

// Inputs of each box that can be edited from the renderer, and where their value is in the structural element
const AXES = ["x", "y", "z"];
const RESTRAINT_OPTIONS = [
  { value: "FFFFFF", copy: "fixed" },
  { value: "FFFFRR", copy: "pinned" },
];
const LOAD_AXES_OPTIONS = [
  { value: "global", copy: "axes_global" },
  { value: "local", copy: "axes_local" },
];
const ENTITY_FIELDS = {
  structuralNode: AXES.map((axis) => ({
    key: axis,
    label: axis.toUpperCase(),
    handles: [`${axis}-value`],
    param_key: axis.toUpperCase(),
    element_key: axis,
  })),
  structuralPointLoad: AXES.map((axis) => ({
    key: axis,
    label: `F${axis}`,
    handles: [`${axis}_mag-value`],
    param_key: `F${axis}`,
    element_key: `${axis}_mag`,
  })),
  structuralMoment: AXES.map((axis) => ({
    key: axis,
    label: `M${axis}`,
    handles: [`${axis}_mag-value`],
    param_key: `M${axis}`,
    element_key: `${axis}_mag`,
  })),
  structuralDistributedLoad: AXES.map((axis) => ({
    key: axis,
    label: `w${axis}`,
    handles: [`${axis}_mag_A-value`, `${axis}_mag_B-value`],
    param_key: `w${axis}`,
    element_key: `${axis}_mag_A`,
  })),
  structuralPressure: [
    ...AXES.map((axis) => ({
      key: axis,
      label: `p${axis}`,
      handles: [`${axis}_mag-value`],
      param_key: `p${axis}`,
      element_key: `${axis}_mag`,
    })),
    {
      key: "axes",
      kind: "axes",
      options: LOAD_AXES_OPTIONS,
      default: "global",
      label_copy: "axes",
      handles: ["axes-string-global"],
      param_key: "Axes",
      element_key: "axes",
    },
  ],
  structuralPlate: [{ key: "thickness", label_copy: "thickness", handles: ["thickness-value"], param_key: "t", element_key: "thickness" }],
  structuralRectangleSection: [
    { key: "base", label: "b", handles: ["base-value-1"], param_key: "b", element_key: "base", default: 1 },
    { key: "height", label: "h", handles: ["height-value-1"], param_key: "h", element_key: "height", default: 1 },
  ],
  structuralCircularSection: [{ key: "diameter", label: "D", handles: ["diameter-value-1"], param_key: "D", element_key: "diameter", default: 1 }],
  structuralGenericSection: [
    { key: "area", label: "A", handles: ["area-value-1"], param_key: "A", element_key: "area", default: 1 },
    { key: "Iz", label: "Iz", handles: ["Iz-value-1"], param_key: "Iz", element_key: "Iz", default: 1 },
    { key: "Iy", label: "Iy", handles: ["Iy-value-1"], param_key: "Iy", element_key: "Iy", default: 1 },
    { key: "J", label: "J", handles: ["J-value-1"], param_key: "J", element_key: "J", default: 1 },
  ],
  structuralMaterial: [
    {
      key: "elasticity_modulus",
      label: "E",
      handles: ["elasticity_modulus-value-20000"],
      param_key: "E",
      element_key: "elasticity_modulus",
      default: 20000,
    },
    { key: "poissons_ratio", label: "ν", handles: ["poissons_ratio-value-0.3"], param_key: "ν", element_key: "poissons_ratio", default: 0.3 },
    { key: "density", label: "ρ", handles: ["density-value"], param_key: "ρ", element_key: "density" },
  ],
  structuralGenericSupport: [
    {
      key: "restraint_code",
      kind: "restraint",
      options: RESTRAINT_OPTIONS,
      default: "FFFFFF",
      label_copy: "support_type",
      handles: ["restraint_code-string-FFFFFF"],
      param_key: "Support",
      element_key: "restraint_code",
    },
  ],
};
const ENTITY_STRUCTURE_KEYS = {
  structuralNode: "nodes",
  structuralPointLoad: "point_loads",
  structuralMoment: "moments",
  structuralDistributedLoad: "distributed_loads",
  structuralPressure: "pressures",
  structuralPlate: "plates",
  structuralGenericSupport: "supports",
  structuralFixedSupport: "supports",
  structuralPinSupport: "supports",
  structuralMember: "members",
  structuralRectangleSection: "sections",
  structuralCircularSection: "sections",
  structuralGenericSection: "sections",
  structuralMaterial: "materials",
};
// Inputs of each box that take another box (its section or its material), picked from a list in the renderer
const SECTION_LINK = { key: "section", kind: "section", handle: SECTION_HANDLE, source_handle: "section_out-id" };
const MATERIAL_LINK = { key: "material", kind: "material", handle: MATERIAL_HANDLE, source_handle: "material_out-id" };
const ENTITY_LINKS = {
  structuralMember: [SECTION_LINK],
  structuralPlate: [MATERIAL_LINK],
  structuralRectangleSection: [MATERIAL_LINK],
  structuralCircularSection: [MATERIAL_LINK],
  structuralGenericSection: [MATERIAL_LINK],
};
const SECTION_TYPES = ["structuralRectangleSection", "structuralCircularSection", "structuralGenericSection"];
const LINK_SOURCE_TYPES = { section: SECTION_TYPES, material: ["structuralMaterial"] };
const PARAMETER_HANDLES = { inputNumber: "value-value", inputString: "value-string" };

/**
 * Gets the box behind a structural element, to edit it
 * @param {string} structure_key
 * @param {number|string} element_id
 * @returns {string|null}
 */
function getElementNodeId(structure_key, element_id) {
  return new DrawingTransaction().getOriginNodeId(structure_key, element_id);
}

/**
 * Editable inputs of a box with where each value comes from: a parameter box (maybe shared with other elements), a calculation, or nothing
 * @param {string} node_id
 * @param {DrawingTransaction} [transaction] To read several boxes from the same copy of the model
 * @returns {import("./types").ParamEleDrawingEntity|null}
 */
function getEntity(node_id, transaction = new DrawingTransaction()) {
  let node = transaction.getNode(node_id);
  if (!node) return null;
  let structure_key = ENTITY_STRUCTURE_KEYS[node.type];
  let element_id = Object.keys(transaction.origins[structure_key] || {}).find((id) => transaction.origins[structure_key][id] === node_id);
  let element = element_id !== undefined ? transaction.structure[structure_key]?.[element_id] : undefined;
  let fields = (ENTITY_FIELDS[node.type] || []).map((field) => {
    let edge = transaction.getIncomingEdges(node_id, field.handles[0])[0];
    let value = element?.[field.element_key];
    let source = null;
    if (edge) {
      let source_node = transaction.getNode(edge.source);
      let editable = PARAMETER_HANDLES[source_node.type] === edge.sourceHandle;
      if (editable) value = source_node.data[edge.sourceHandle];
      // Other boxes fed by the same output, grouped by type
      let shared_with = {};
      transaction.edges.forEach(({ source, sourceHandle, target }) => {
        if (source !== edge.source || sourceHandle !== edge.sourceHandle || target === node_id) return;
        let target_type = transaction.getNode(target)?.type;
        if (!shared_with[target_type]) shared_with[target_type] = new Set();
        shared_with[target_type].add(target);
      });
      source = {
        node_id: source_node.id,
        label: source_node.data.custom_label || utils.getDisplayCopy("nodes", source_node.type),
        editable,
        shared_with: Object.entries(shared_with).map(([type, targets]) => ({ type, count: targets.size })),
      };
    }
    return { ...field, value: value === undefined ? field.default ?? 0 : value, source };
  });
  let links = (ENTITY_LINKS[node.type] || []).map((link) => {
    let edge = transaction.getIncomingEdges(node_id, link.handle)[0];
    let source_node = edge && transaction.getNode(edge.source);
    // Something else than a section or material box (e.g. a number with an ID) feeds the input
    let other_source = source_node && !LINK_SOURCE_TYPES[link.kind].includes(source_node.type);
    return {
      key: link.key,
      kind: link.kind,
      value: source_node && !other_source ? source_node.id : null,
      other_source: other_source
        ? { node_id: source_node.id, label: source_node.data.custom_label || utils.getDisplayCopy("nodes", source_node.type) }
        : null,
    };
  });
  return { node_id, type: node.type, structure_key, element_id, fields, links };
}

/**
 * Connects a section or material box to an input of several boxes, replacing what fed it
 * @param {string[]} target_node_ids
 * @param {"section"|"material"} kind
 * @param {string|null} source_node_id Section or material box, or null to leave the input empty (the default section or material)
 * @returns {boolean} Whether anything changed
 */
function linkBoxes(target_node_ids, kind, source_node_id) {
  let link = kind === "section" ? SECTION_LINK : MATERIAL_LINK;
  let transaction = new DrawingTransaction();
  if (source_node_id && !transaction.getNode(source_node_id)) return false;
  let changed = false;
  target_node_ids.forEach((target_node_id) => {
    let target_node = transaction.getNode(target_node_id);
    if (!target_node || !(ENTITY_LINKS[target_node.type] || []).some(({ key }) => key === link.key)) return;
    let edges = transaction.getIncomingEdges(target_node_id, link.handle);
    if (edges.length === 1 && edges[0].source === source_node_id && edges[0].sourceHandle === link.source_handle) return;
    if (edges.length === 0 && !source_node_id) return;
    transaction.edges = transaction.edges.filter((edge) => !edges.includes(edge));
    if (source_node_id) transaction.connect(source_node_id, link.source_handle, target_node_id, link.handle);
    changed = true;
  });
  if (changed) transaction.commit();
  return changed;
}

/**
 * Changes an entity link from the renderer
 * @param {string} node_id
 * @param {string} link_key "section" or "material"
 * @param {string|null} source_node_id
 */
function updateEntityLink(node_id, link_key, source_node_id) {
  linkBoxes([node_id], link_key, source_node_id);
}

/**
 * Changes an input of a box from the renderer: the value of its parameter box, or a new (or shared) parameter when it had none
 * @param {string} node_id
 * @param {string} field_key
 * @param {number|string} value
 */
function updateEntityField(node_id, field_key, value) {
  let transaction = new DrawingTransaction();
  let node = transaction.getNode(node_id);
  let field = node && (ENTITY_FIELDS[node.type] || []).find(({ key }) => key === field_key);
  if (!field) return;
  let edge = transaction.getIncomingEdges(node_id, field.handles[0])[0];
  if (edge) {
    let source_node = transaction.getNode(edge.source);
    if (PARAMETER_HANDLES[source_node.type] !== edge.sourceHandle || isSameValue(source_node.data[edge.sourceHandle], value)) return;
    source_node.data = { ...source_node.data, [edge.sourceHandle]: typeof value === "string" ? value : roundValue(value) };
  } else {
    let { source, source_handle } = transaction.getSharedSource({
      target_types: [node.type],
      target_handle: field.handles[0],
      value,
      param_key: field.param_key,
    });
    field.handles.forEach((handle) => transaction.connect(source, source_handle, node_id, handle));
  }
  transaction.commit();
}

/**
 * Gives an input of a box its own parameter, so changing it does not change the other elements that shared the parameter
 * @param {string} node_id
 * @param {string} field_key
 */
function detachEntityField(node_id, field_key) {
  let entity = getEntity(node_id);
  let field = entity?.fields.find(({ key }) => key === field_key);
  if (!field) return;
  let transaction = new DrawingTransaction();
  transaction.edges = transaction.edges.filter(({ target, targetHandle }) => target !== node_id || !field.handles.includes(targetHandle));
  let { source, source_handle } = transaction.getSharedSource({ value: field.value, param_key: field.param_key, force_new: true });
  field.handles.forEach((handle) => transaction.connect(source, source_handle, node_id, handle));
  transaction.commit();
}

/**
 * Forgets the undo history, when another model is opened
 */
function clearHistory() {
  undo_stack = [];
  undo_listeners.forEach((listener) => listener());
}

function canUndo() {
  return undo_stack.length > 0;
}

/**
 * Undoes the last drawing action, as long as the boxes were not changed since then
 */
function undo() {
  let last_step = undo_stack.pop();
  if (!last_step) return;
  let rf_instance = state.getRfInstance();
  if (getModelSignature(rf_instance.getNodes(), rf_instance.getEdges()) !== last_step.after_signature) {
    undo_stack = [];
    notify("warning", "drawing_undo_changed", null, true);
  } else {
    state.setModelToEditor(last_step.before);
  }
  undo_listeners.forEach((listener) => listener());
}

/**
 * Subscribes to changes of the undo history
 * @param {Function} listener
 * @returns {Function} unsubscribe
 */
function onUndoChange(listener) {
  undo_listeners.add(listener);
  return () => undo_listeners.delete(listener);
}

const drawing = {
  DrawingTransaction,
  SECTION_TYPES,
  linkBoxes,
  updateEntityLink,
  addMember,
  addPlate,
  addPointLoad,
  addMoment,
  addDistributedLoad,
  addPressure,
  addSupport,
  deleteElement,
  getElementNodeId,
  getEntity,
  updateEntityField,
  detachEntityField,
  undo,
  canUndo,
  clearHistory,
  onUndoChange,
};

export default drawing;
