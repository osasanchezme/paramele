import GenericInOutNode from "./generics/genericInOut";
import utils from "../utils";

function localGetCopy(node_name) {
  return utils.getDisplayCopy("nodes", node_name);
}

const trigo_target_ids = ["num-value"];
const trigo_source_ids = ["result_out-value"];

/**
 * Creates a box with one number in and the result of the given function out
 * @param {string} copy_key Key of the box name in the language files
 * @param {function(number): number} math_function
 * @param {string} input_unit Fixed unit of the number in ("rad", "deg" or "dimensionless")
 * @param {string} output_unit Fixed unit of the result
 */
function createTrigonometricNode(copy_key, math_function, input_unit, output_unit) {
  function Node({ data, id }) {
    return (
      <GenericInOutNode
        node_label={localGetCopy(copy_key)}
        data={data}
        id={id}
        target_ids={trigo_target_ids}
        source_ids={trigo_source_ids}
      ></GenericInOutNode>
    );
  }
  function Exec(args) {
    args = utils.convertNodeToStructuralArgs(args, trigo_target_ids);
    return { "result_out-value": { value: math_function(args["num"]), ...args } };
  }
  let units = { handles: { "num-value": `unit:${input_unit}`, "result_out-value": `unit:${output_unit}` } };
  return { Node, Exec, units };
}

const TrigonometricNodes = {
  MathSinNode: createTrigonometricNode("sin", Math.sin, "rad", "dimensionless"),
  MathCosNode: createTrigonometricNode("cos", Math.cos, "rad", "dimensionless"),
  MathTanNode: createTrigonometricNode("tan", Math.tan, "rad", "dimensionless"),
  MathAsinNode: createTrigonometricNode("asin", Math.asin, "dimensionless", "rad"),
  MathAcosNode: createTrigonometricNode("acos", Math.acos, "dimensionless", "rad"),
  MathAtanNode: createTrigonometricNode("atan", Math.atan, "dimensionless", "rad"),
  MathDeg2RadNode: createTrigonometricNode("deg2rad", (num) => (num * Math.PI) / 180, "deg", "rad"),
};

export default TrigonometricNodes;
