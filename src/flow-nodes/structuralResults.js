import GenericInOutNode from "./generics/genericInOut";
import utils from "../utils";
import getState from "../getState";
import structural_utils from "../structural_utils";
import state from "../state";

function localGetCopy(node_name) {
  return utils.getDisplayCopy("nodes", node_name);
}

// Nodal results
const node_result_target_ids = ["nodes-ids"];
const node_result_editable_ids = [
  { id: "result-value", show_handle: false, input_type: "dropdown", data: ["reaction"] },
  { id: "direction-value", show_handle: false, input_type: "dropdown", data: ["x", "y", "z"] },
];
function NodeResult({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralNodeResult")}
      data={data}
      id={id}
      target_ids={node_result_target_ids}
      editable_ids={node_result_editable_ids}
      source_ids={["plotable_out-plotly_data"]}
    ></GenericInOutNode>
  );
}

function NodeResultExec(args, data) {
  let full_args = member_result_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  let results = getState("results");
  let { nodes } = structural_args;
  let y = [];
  let x = [];
  let xaxis_title = "";
  let plotly_data = [{ x, y, xaxis_title: "", yaxis_title: "", title: utils.getDisplayCopy("notifications", "no_data_to_show") }];
  let iterating_node_data = state.getGlobalVariable("iterating_node_data");
  if (Object.keys(results).length > 0) {
    let result_value = data["result-value"];
    let result_direction = data["direction-value"];
    let result_type = "node";
    if (result_value !== undefined && result_type !== undefined && result_direction !== undefined) {
      if (!Array.isArray(nodes)) nodes = [nodes]; // Support single node as input
      nodes.forEach((node_id) => {
        let node_result = structural_utils.getResult(results, result_value, result_direction, result_type, node_id, 0);
        y.push(node_result);
      });
    }
    if (Object.keys(iterating_node_data).length > 0) {
      x = iterating_node_data.variation_values;
      xaxis_title = iterating_node_data.node_label;
    } else {
      x = nodes;
      xaxis_title = utils.getDisplayCopy("tags", "node");
    }
    let result_label = utils.getDisplayCopy("tags", result_value);
    let plot_title = `${result_label} (${result_direction})`;
    plotly_data[0] = { x, y, xaxis_title, yaxis_title: result_label, title: plot_title };
  }
  return {
    "plotable_out-plotly_data": plotly_data,
    input: {
      ...structural_args,
    },
  };
}

// Member results
const member_result_target_ids = ["members-ids"];
const member_result_editable_ids = [
  { id: "result-value", show_handle: false, input_type: "dropdown", data: ["moment", "shear", "axial", "displacement", "local-displacement"] },
  { id: "direction-value", show_handle: false, input_type: "dropdown", data: ["x", "y", "z"] },
  { id: "result_type-value", show_handle: false, input_type: "dropdown", data: ["mid-span", "max", "min", "average", "start", "end", "full"] },
];
function MemberResult({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralMemberResult")}
      data={data}
      id={id}
      target_ids={member_result_target_ids}
      editable_ids={member_result_editable_ids}
      source_ids={["plotable_out-plotly_data"]}
    ></GenericInOutNode>
  );
}

function MemberResultExec(args, data) {
  let full_args = member_result_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  let results = getState("results");
  let { members } = structural_args;
  let y = [];
  let x = [];
  let plotly_data = [{ x, y, xaxis_title: "", yaxis_title: "", title: utils.getDisplayCopy("notifications", "no_data_to_show") }];
  let x_y_data = [];
  let member_ids = [];
  let iterating_node_data = state.getGlobalVariable("iterating_node_data");
  if (Object.keys(results).length > 0) {
    let result_value = data["result-value"];
    let result_type = data["result_type-value"];
    let result_direction = data["direction-value"];
    if (result_value !== undefined && result_type !== undefined && result_direction !== undefined) {
      if (!Array.isArray(members)) members = [members]; // Support single member as input
      members.forEach((member_id) => {
        let member_result = structural_utils.getResult(results, result_value, result_direction, result_type, member_id, 0);
        if (member_result === undefined) return; // No results for this member (e.g. results from an older model)
        if (isNaN(Number(member_result))) {
          x_y_data.push(member_result);
          member_ids.push(member_id);
        } else {
          y.push(member_result);
        }
      });
    }
    if (Object.keys(iterating_node_data).length > 0) {
      if (y.length > 0) {
        x = iterating_node_data.variation_values;
      } else if (x_y_data.length > 0) {
        iterating_node_data.variation_values.forEach((variation_value, index) => {
          if (x_y_data[index]) x_y_data[index]["name"] = iterating_node_data.node_label + " = " + String(variation_value);
        });
      }
    } else {
      x_y_data = x_y_data.map((dataset, index) => {
        dataset.name = `${utils.getDisplayCopy("tags", "member")} ${member_ids[index]}`;
        return dataset;
      });
    }
    let result_label = utils.getDisplayCopy("tags", result_value);
    let position_label = utils.getDisplayCopy("tags", "position");
    if (y.length > 0) {
      let plot_title = `${result_label} (${result_direction}) @ ${utils.getDisplayCopy("tags", result_type)}`;
      plotly_data[0] = { x, y, xaxis_title: iterating_node_data.node_label, yaxis_title: result_label, title: plot_title };
    } else if (x_y_data.length > 0) {
      plotly_data = [];
      x_y_data.forEach((dataset) => {
        if (dataset) {
          let { x, y, name } = dataset;
          let plot_title = `${result_label} (${result_direction})`;
          plotly_data.push({ x, y, name, xaxis_title: position_label, yaxis_title: result_label, title: plot_title });
        }
      });
    }
  }
  return {
    "plotable_out-plotly_data": plotly_data,
    input: {
      ...structural_args,
    },
  };
}

const StructuralResultsNodes = {
  MemberResultNode: { Node: MemberResult, Exec: MemberResultExec },
  NodeResultNode: { Node: NodeResult, Exec: NodeResultExec },
};

export default StructuralResultsNodes;
