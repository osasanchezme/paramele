// Units of the value handles of a model of boxes. The structural boxes declare the quantity of their handles, number and slider
// boxes take the unit they are given (data.unit) or adapt to what they are linked to, and math boxes work out their units from
// their inputs (or from their output when the inputs adapt). A link between two units of the same dimension converts the
// value (a length in m into a section dimension in mm), a link between different dimensions is an error.
import units from "./units";

const WRAPPER_TYPE = "nodesWrapper";
const MAX_PASSES = 100;

const handleKey = (node_id, handle_id) => `${node_id}|${handle_id}`;

/**
 * Type of a handle from its ID (`name-type[-default]`)
 * @param {string} handle_id
 */
function getHandleType(handle_id) {
  return String(handle_id || "").split("-")[1];
}

function isValueHandle(handle_id) {
  return getHandleType(handle_id) === "value";
}

/**
 * Number a box gets in a handle when it is fed by a number or slider box (or its last evaluated input)
 * @returns {number|null}
 */
function getConstantInput(node, handle_id, edges, nodes_by_id) {
  let edge = edges.find(({ target, targetHandle }) => target === node.id && targetHandle === handle_id);
  let value;
  if (edge) {
    let source = nodes_by_id[edge.source];
    value = source?.data?.[edge.sourceHandle];
    if (value === undefined) value = node.data?.input?.[handle_id.split("-")[0]];
  } else {
    value = handle_id.split("-")[2];
    if (value === undefined) value = node.data?.input?.[handle_id.split("-")[0]];
  }
  let number = Number(value);
  return value !== "" && value !== null && Number.isFinite(number) ? number : null;
}

/**
 * Units of the value handles of a model
 * @param {{nodes: object[], edges: object[]}} model
 * @param {Object<string, import("./types").ParamEleUnitDeclaration>} declarations By box type
 * @param {object} model_units Settings units, for the conversion factors
 * @returns {import("./types").ParamEleUnitInference}
 */
function inferUnits(model, declarations, model_units) {
  const nodes = model?.nodes || [];
  const edges = (model?.edges || []).filter(({ sourceHandle, targetHandle }) => isValueHandle(sourceHandle) && isValueHandle(targetHandle));
  const nodes_by_id = {};
  nodes.forEach((node) => (nodes_by_id[node.id] = node));

  const known = {};
  // Handles whose unit comes from their links
  const free = new Set();
  const adaptive = {};
  const rules = [];

  nodes.forEach((node) => {
    if (node.type === WRAPPER_TYPE) {
      declareWrapper(node, declarations, model_units, known, free);
      return;
    }
    const declaration = declarations[node.type];
    if (!declaration) return;
    Object.entries(declaration.handles || {}).forEach(
      ([handle_id, quantity]) => (known[handleKey(node.id, handle_id)] = units.getQuantityUnit(quantity))
    );
    (declaration.adaptive || []).forEach((handle_id) => {
      const key = handleKey(node.id, handle_id);
      const pinned = node.data?.unit;
      if (pinned && units.QUANTITIES[pinned]) {
        known[key] = units.getQuantityUnit(pinned);
        adaptive[key] = "pinned";
      } else {
        free.add(key);
        adaptive[key] = "free";
      }
    });
    if (declaration.rule) {
      const { rule } = declaration;
      [...rule.inputs, rule.output].forEach((handle_id) => free.add(handleKey(node.id, handle_id)));
      rules.push({ node, rule });
    }
  });
  // Value handles nobody declared take the unit of their links
  edges.forEach(({ source, sourceHandle, target, targetHandle }) => {
    [handleKey(source, sourceHandle), handleKey(target, targetHandle)].forEach((key) => {
      if (!(key in known)) free.add(key);
    });
  });

  const set = (key, unit) => {
    known[key] = unit;
  };
  const isFree = (key) => free.has(key);

  // Units that follow from what is known: links fill the free end, rules work out their output (or inputs from their output)
  const propagate = () => {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let changed = false;
      edges.forEach(({ source, sourceHandle, target, targetHandle }) => {
        const source_key = handleKey(source, sourceHandle);
        const target_key = handleKey(target, targetHandle);
        if (known[target_key] && !known[source_key] && isFree(source_key)) {
          set(source_key, known[target_key]);
          changed = true;
        } else if (known[source_key] && !known[target_key] && isFree(target_key)) {
          set(target_key, known[source_key]);
          changed = true;
        }
      });
      rules.forEach(({ node, rule }) => {
        if (applyRule(node, rule, known, edges, nodes_by_id, false)) changed = true;
      });
      if (!changed) return;
    }
  };
  propagate();
  // When nothing else decides, the second factor of a product (or the divisor) is a plain number
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const defaulted = rules.some(({ node, rule }) => applyRule(node, rule, known, edges, nodes_by_id, true));
    if (!defaulted) break;
    propagate();
  }

  Object.keys(adaptive).forEach((key) => {
    if (adaptive[key] === "free" && known[key]) adaptive[key] = "inferred";
  });

  const edge_results = {};
  let has_errors = false;
  edges.forEach((edge) => {
    const source_unit = known[handleKey(edge.source, edge.sourceHandle)];
    const target_unit = known[handleKey(edge.target, edge.targetHandle)];
    const from = source_unit || target_unit || units.DIMENSIONLESS;
    const to = target_unit || from;
    const error = !units.haveSameDimension(from, to);
    if (error) has_errors = true;
    edge_results[edge.id] = { factor: error ? 1 : units.getConversionFactor(from, to, model_units), error, source_unit: from, target_unit: to };
  });
  return { handles: known, edges: edge_results, adaptive, has_errors };
}

/**
 * Units of the handles of a group box: those of the handles of its inner model they are mapped to
 */
function declareWrapper(node, declarations, model_units, known, free) {
  const inner = node.data?.internal_logic;
  const inner_inference = inner ? inferUnits(inner, declarations, model_units) : null;
  const declarePorts = (ports) => {
    (ports || []).forEach(({ label, type, node_id_to_map, data_key_to_map }) => {
      const handle_id = `${label}-${type}`;
      if (type !== "value") return;
      const key = handleKey(node.id, handle_id);
      const inner_key = handleKey(node_id_to_map, data_key_to_map);
      const inner_unit = inner_inference?.handles[inner_key];
      const inner_state = inner_inference?.adaptive[inner_key];
      if (inner_unit && inner_state !== "free") known[key] = inner_unit;
      else free.add(key);
    });
  };
  declarePorts(node.data?.input_handles);
  declarePorts(node.data?.output_handles);
}

/**
 * Works out the units of a math box. Outputs follow the inputs when they are known, inputs follow the output otherwise
 * @param {boolean} use_defaults Whether to decide the units nothing else decides (a free factor of a product is a plain number)
 * @returns {boolean} Whether a unit changed
 */
function applyRule(node, rule, known, edges, nodes_by_id, use_defaults) {
  const key = (handle_id) => handleKey(node.id, handle_id);
  const output_key = key(rule.output);
  const input_keys = rule.inputs.map(key);
  const same = (a, b) => a && b && units.haveSameDimension(a, b) && Math.abs(a.scale - b.scale) < 1e-12 && sameTerms(a, b);
  const update = (target_key, unit) => {
    if (same(known[target_key], unit)) return false;
    known[target_key] = unit;
    return true;
  };
  let changed = false;
  switch (rule.type) {
    case "same": {
      // All the handles take the unit of the first known input (the box adds or rounds the numbers as they come)
      const first_input = input_keys.find((input_key) => known[input_key]);
      const reference = first_input ? known[first_input] : known[output_key];
      if (!reference) return false;
      [...input_keys, output_key].forEach((handle_key) => {
        if (handle_key === first_input) return;
        // An input from another dimension keeps its unit, its link shows the error
        if (known[handle_key] && !units.haveSameDimension(known[handle_key], reference)) return;
        if (update(handle_key, reference)) changed = true;
      });
      return changed;
    }
    case "multiply":
    case "divide": {
      const [a_key, b_key] = input_keys;
      const b_power = rule.type === "multiply" ? 1 : -1;
      const a = known[a_key];
      const b = known[b_key];
      const output = known[output_key];
      if (a && b) return update(output_key, units.multiplyUnits(a, b, b_power));
      if (output && a && !b && !hasLink(node, rule.inputs[1], edges)) return update(b_key, units.DIMENSIONLESS);
      if (output && b && !a && !hasLink(node, rule.inputs[0], edges)) return update(a_key, units.DIMENSIONLESS);
      if (!use_defaults) return false;
      if (a && !b) return update(b_key, units.DIMENSIONLESS);
      if (b && !a) return update(a_key, units.DIMENSIONLESS);
      if (output && !a && !b) {
        changed = update(a_key, output);
        return update(b_key, units.DIMENSIONLESS) || changed;
      }
      return false;
    }
    case "power":
    case "root": {
      const [base_key] = input_keys;
      const exponent_key = key(rule.exponent);
      if (!known[exponent_key]) known[exponent_key] = units.DIMENSIONLESS;
      const base = known[base_key];
      const output = known[output_key];
      const value = getConstantInput(node, rule.exponent, edges, nodes_by_id);
      if (base && units.isDimensionless(base) && base.scale === 1) return update(output_key, units.DIMENSIONLESS);
      if (value === null || value === 0) return false;
      const power = rule.type === "power" ? value : 1 / value;
      if (base) return update(output_key, units.powerUnit(base, power));
      if (output) return update(base_key, units.powerUnit(output, 1 / power));
      return false;
    }
    default:
      return false;
  }
}

function sameTerms(a, b) {
  const keys = new Set([...Object.keys(a.terms), ...Object.keys(b.terms)]);
  return [...keys].every((term) => Math.abs((a.terms[term] || 0) - (b.terms[term] || 0)) < 1e-9);
}

function hasLink(node, handle_id, edges) {
  return edges.some(({ target, targetHandle }) => target === node.id && targetHandle === handle_id);
}

/**
 * Whether linking two handles keeps the units of the model consistent
 * @param {{nodes: object[], edges: object[]}} model
 * @param {{source: string, sourceHandle: string, target: string, targetHandle: string}} connection
 * @param {Object<string, import("./types").ParamEleUnitDeclaration>} declarations
 * @param {object} model_units
 */
function isValidConnection(model, connection, declarations, model_units) {
  if (!isValueHandle(connection.sourceHandle) || !isValueHandle(connection.targetHandle)) return true;
  const edge = { ...connection, id: "__unit_check__" };
  const inference = inferUnits({ nodes: model.nodes, edges: [...model.edges, edge] }, declarations, model_units);
  return !inference.edges[edge.id]?.error;
}

/**
 * Number boxes and sliders of a model (and of its group boxes) with the unit they were resolved to, to convert their values
 * when the units of the model change
 * @param {{nodes: object[], edges: object[]}} model
 * @param {Object<string, import("./types").ParamEleUnitDeclaration>} declarations
 * @param {object} model_units
 * @param {function(object, import("./types").ParamEleUnit): void} callback Called with each box and the unit of its value
 */
function forEachAdaptiveValue(model, declarations, model_units, callback) {
  const inference = inferUnits(model, declarations, model_units);
  (model?.nodes || []).forEach((node) => {
    if (node.type === WRAPPER_TYPE && node.data?.internal_logic) forEachAdaptiveValue(node.data.internal_logic, declarations, model_units, callback);
    (declarations[node.type]?.adaptive || []).forEach((handle_id) => {
      const unit = inference.handles[handleKey(node.id, handle_id)];
      if (unit) callback(node, unit);
    });
  });
}

const unitInference = { inferUnits, isValidConnection, forEachAdaptiveValue, handleKey, isValueHandle };

export default unitInference;
