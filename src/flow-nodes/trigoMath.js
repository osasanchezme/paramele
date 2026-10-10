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
 */
function createTrigonometricNode(copy_key, math_function) {
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
  return { Node, Exec };
}

const TrigonometricNodes = {
  MathSinNode: createTrigonometricNode("sin", Math.sin),
  MathCosNode: createTrigonometricNode("cos", Math.cos),
  MathTanNode: createTrigonometricNode("tan", Math.tan),
  MathAsinNode: createTrigonometricNode("asin", Math.asin),
  MathAcosNode: createTrigonometricNode("acos", Math.acos),
  MathAtanNode: createTrigonometricNode("atan", Math.atan),
  MathDeg2RadNode: createTrigonometricNode("deg2rad", (num) => (num * Math.PI) / 180),
};

export default TrigonometricNodes;
