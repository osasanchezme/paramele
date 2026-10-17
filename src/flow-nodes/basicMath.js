import GenericInOutNode from "./generics/genericInOut";
import utils from "../utils";

function localGetCopy(node_name) {
  return utils.getDisplayCopy("nodes", node_name);
}

// Sum
const sum_target_ids = ["num_1-value", "num_2-value"];
function MathSum({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("sumNumbers")}
      data={data}
      id={id}
      target_ids={sum_target_ids}
      source_ids={["result_out-value"]}
    ></GenericInOutNode>
  );
}

function MathSumExec(args) {
  args = utils.convertNodeToStructuralArgs(args, sum_target_ids);
  return { "result_out-value": { value: args["num_1"] + args["num_2"], ...args } };
}

// Multiply
const multiply_target_ids = ["num_1-value", "num_2-value"];
function MathMultiply({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("multiplyNumbers")}
      data={data}
      id={id}
      target_ids={multiply_target_ids}
      source_ids={["result_out-value"]}
    ></GenericInOutNode>
  );
}

function MathMultiplyExec(args) {
  args = utils.convertNodeToStructuralArgs(args, multiply_target_ids);
  return { "result_out-value": { value: args["num_1"] * args["num_2"], ...args } };
}

// Divide
const divide_target_ids = ["num-value", "den-value"];
function MathDivide({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("divideNumbers")}
      data={data}
      id={id}
      target_ids={divide_target_ids}
      source_ids={["result_out-value"]}
    ></GenericInOutNode>
  );
}

function MathDivideExec(args) {
  args = utils.convertNodeToStructuralArgs(args, divide_target_ids);
  return { "result_out-value": { value: args["num"] / args["den"], ...args } };
}

// Round
const round_target_ids = ["number-value", "round_to-value"];
function MathRound({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("roundNumber")}
      data={data}
      id={id}
      target_ids={round_target_ids}
      source_ids={["result_out-value"]}
    ></GenericInOutNode>
  );
}

function MathRoundExec(args) {
  args = utils.convertNodeToStructuralArgs(args, round_target_ids);
  return { "result_out-value": { value: Number(args["number"].toFixed(args["round_to"])), ...args } };
}

// Power
const power_target_ids = ["base-value-0", "power-value-1"];
function MathPower({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("powerNumber")}
      data={data}
      id={id}
      target_ids={power_target_ids}
      source_ids={["result_out-value"]}
    ></GenericInOutNode>
  );
}

function MathPowerExec(args) {
  let full_args = power_target_ids;
  args = utils.convertNodeToStructuralArgs(args, full_args);
  return { "result_out-value": { value: args["base"] ** args["power"], ...args } };
}

// Root
const root_target_ids = ["base-value-1", "root-value-2"];
function MathRoot({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("rootNumber")}
      data={data}
      id={id}
      target_ids={root_target_ids}
      source_ids={["result_out-value"]}
    ></GenericInOutNode>
  );
}

function MathRootExec(args) {
  let full_args = root_target_ids;
  args = utils.convertNodeToStructuralArgs(args, full_args);
  return { "result_out-value": { value: args["base"] ** (1 / args["root"]), ...args } };
}

const BasicMathNodes = {
  MathSumNode: { Node: MathSum, Exec: MathSumExec, units: { rule: { type: "same", inputs: sum_target_ids, output: "result_out-value" } } },
  MathMultiplyNode: {
    Node: MathMultiply,
    Exec: MathMultiplyExec,
    units: { rule: { type: "multiply", inputs: multiply_target_ids, output: "result_out-value" } },
  },
  MathDivideNode: {
    Node: MathDivide,
    Exec: MathDivideExec,
    units: { rule: { type: "divide", inputs: divide_target_ids, output: "result_out-value" } },
  },
  MathRoundNode: {
    Node: MathRound,
    Exec: MathRoundExec,
    units: { handles: { "round_to-value": "dimensionless" }, rule: { type: "same", inputs: ["number-value"], output: "result_out-value" } },
  },
  MathPowerNode: {
    Node: MathPower,
    Exec: MathPowerExec,
    units: { rule: { type: "power", inputs: ["base-value-0"], exponent: "power-value-1", output: "result_out-value" } },
  },
  MathRootNode: {
    Node: MathRoot,
    Exec: MathRootExec,
    units: { rule: { type: "root", inputs: ["base-value-1"], exponent: "root-value-2", output: "result_out-value" } },
  },
};

export default BasicMathNodes;
