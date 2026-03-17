import getState from "../getState";
import geom_utils from "../geom_utils";
import state from "../state";
import utils from "../utils";

function localGetCopy(node_name) {
  return utils.getDisplayCopy("renderer", node_name);
}

function getData() {
  let structure = getState("structure");
  let units = structure.settings.units;
  let plotly_data = [];
  const global_settings = getState("settings")["global"];
  const physical_load_size = global_settings["physical_load_size"];
  const show_proportional_loads = global_settings["show_proportional_loads"];

  // Add axes
  let axes_length = 2;
  plotly_data.push({
    x: [0, axes_length],
    y: [0, 0],
    z: [0, 0],
    type: "scatter3d",
    mode: "lines",
    hoverinfo: "none",
    line: { width: 5, color: "red" },
  });
  plotly_data.push({
    x: [0, 0],
    y: [0, axes_length],
    z: [0, 0],
    type: "scatter3d",
    mode: "lines",
    hoverinfo: "none",
    line: { width: 5, color: "green" },
  });
  plotly_data.push({
    x: [0, 0],
    y: [0, 0],
    z: [0, axes_length],
    type: "scatter3d",
    mode: "lines",
    hoverinfo: "none",
    line: { width: 5, color: "blue" },
  });

  // Add nodes
  let nodes = {
    x: [],
    y: [],
    z: [],
    type: "scatter3d",
    mode: "markers",
    marker: { color: "#003CA0", size: 4 },
    text: [],
    hovertemplate: "%{text} (%{x}, %{y}, %{z})<extra></extra>",
  };
  Object.entries(structure.nodes).forEach(([node_id, node_data]) => {
    nodes.x.push(node_data.x);
    nodes.y.push(node_data.y);
    nodes.z.push(node_data.z);
    nodes.text.push(localGetCopy("node") + " " + node_id);
  });
  plotly_data.push(nodes);

  // Members
  let selection_nodes = {
    x: [],
    y: [],
    z: [],
    type: "scatter3d",
    mode: "markers",
    marker: { color: [], size: 3 },
    text: [],
    hovertemplate: "%{text} <extra></extra>",
  };
  Object.entries(structure.members).forEach(([member_id, member_data]) => {
    let section_color = state.getSectionColor(member_data.section_id);
    let member = { x: [], y: [], z: [], type: "scatter3d", mode: "lines", hoverinfo: "none", line: { width: 3, color: section_color } };
    // Node A
    let node_A = structure.nodes[member_data.node_A];
    member.x.push(node_A.x);
    member.y.push(node_A.y);
    member.z.push(node_A.z);
    // Node B
    let node_B = structure.nodes[member_data.node_B];
    member.x.push(node_B.x);
    member.y.push(node_B.y);
    member.z.push(node_B.z);

    plotly_data.push(member);

    let member_length = Math.sqrt((node_A.x - node_B.x) ** 2 + (node_A.y - node_B.y) ** 2 + (node_A.z - node_B.z) ** 2);
    let member_label = `${localGetCopy("member")}  ${member_id} (${member_length} ${units.length})`;

    // Selection nodes along the member
    let node_middle = { x: (node_A.x + node_B.x) / 2, y: (node_A.y + node_B.y) / 2, z: (node_A.z + node_B.z) / 2 };
    selection_nodes.x.push(node_middle.x);
    selection_nodes.y.push(node_middle.y);
    selection_nodes.z.push(node_middle.z);
    selection_nodes.text.push(member_label);
    selection_nodes.marker.color.push(section_color);
  });
  plotly_data.push(selection_nodes);

  // Supports
  Object.entries(structure.supports).forEach(([support_id, support_data]) => {
    let support = {
      x: [],
      y: [],
      z: [],
      type: "scatter3d",
      mode: "lines",
      hoverinfo: "none",
      line: { width: 2, color: "black" },
    };
    let node = structure.nodes[support_data.node];
    let support_coords = createSupport(support_data.restraint_code, node);
    support.x.push(...support_coords.support_x);
    support.y.push(...support_coords.support_y);
    support.z.push(...support_coords.support_z);
    plotly_data.push(support);
  });

  // Find the max magnitude to normalize the others
  let magnitude_sources = {
    point_loads: [["x_mag", "y_mag", "z_mag"]],
    moments: [["x_mag", "y_mag", "z_mag"]],
    distributed_loads: [
      ["x_mag_A", "y_mag_A", "z_mag_A"],
      ["x_mag_B", "y_mag_B", "z_mag_B"],
    ],
  };
  let max_abs_mag = 0;
  Object.entries(magnitude_sources).forEach(([source_key, magnitude_keys]) => {
    Object.values(structure[source_key]).forEach((source_object) => {
      magnitude_keys.forEach(([mag_key_x, mag_key_y, mag_key_z]) => {
        let abs_candidate = Math.sqrt(source_object[mag_key_x] ** 2 + source_object[mag_key_y] ** 2 + source_object[mag_key_z] ** 2);
        if (abs_candidate > max_abs_mag) max_abs_mag = abs_candidate;
      });
    });
  });
  if (max_abs_mag == 0) max_abs_mag = 1;

  // Point loads
  Object.entries(structure.point_loads).forEach(([pl_id, pl_data]) => {
    let pl = {
      x: [],
      y: [],
      z: [],
      type: "scatter3d",
      mode: "lines",
      hoverinfo: "none",
      line: { width: 4, color: "red" },
    };
    let node = structure.nodes[pl_data.node];
    let pl_coords = createPointLoad(node, pl_data.x_mag, pl_data.y_mag, pl_data.z_mag, max_abs_mag, physical_load_size, show_proportional_loads);
    pl.x.push(...pl_coords.pl_x);
    pl.y.push(...pl_coords.pl_y);
    pl.z.push(...pl_coords.pl_z);
    plotly_data.push(pl);
  });

  // Distributed loads
  Object.entries(structure.distributed_loads).forEach(([dl_id, dl_data]) => {
    let dl = {
      x: [],
      y: [],
      z: [],
      type: "scatter3d",
      mode: "lines",
      hoverinfo: "none",
      line: { width: 4, color: "orange" },
    };
    let member = structure.members[dl_data.member];
    let { node_A, node_B } = member;
    node_A = structure.nodes[node_A];
    node_B = structure.nodes[node_B];
    let dl_coords = createDistributedLoad(
      node_A,
      node_B,
      dl_data.x_mag_A,
      dl_data.y_mag_A,
      dl_data.z_mag_A,
      dl_data.x_mag_B,
      dl_data.y_mag_B,
      dl_data.z_mag_B,
      max_abs_mag,
      physical_load_size,
      show_proportional_loads
    );
    for (let i in dl_coords.dl_x) {
      dl.x.push(...dl_coords.dl_x[i]);
      dl.y.push(...dl_coords.dl_y[i]);
      dl.z.push(...dl_coords.dl_z[i]);
    }
    plotly_data.push(dl);
  });

  // Plates
  let selection_nodes_plates = {
    x: [],
    y: [],
    z: [],
    type: "scatter3d",
    mode: "markers",
    marker: { color: "#D2DDE8", size: 5 },
    text: [],
    hovertemplate: "%{text} <extra></extra>",
  };
  Object.entries(structure.plates).forEach(([plate_id, plate_data]) => {
    if (!plate_data.nodes || !Array.isArray(plate_data.nodes)) return;
    // Find the best Delaunay axis
    let delaunayaxis = "x";
    if (plate_data.nodes.length > 2) {
      let { vector_1, vector_2 } = geom_utils.findNotParallelVectorsInNodesList(plate_data.nodes.map((node_id) => structure.nodes[node_id]));
      delaunayaxis = geom_utils.getMostPerpendicularAxisToPlane(vector_1, vector_2);
    }
    let plate = {
      x: [],
      y: [],
      z: [],
      type: "mesh3d",
      delaunayaxis,
      color: "#D2DDE8",
      hoverinfo: "none",
      opacity: 0.5,
    };
    plate_data.nodes.forEach((node_id) => {
      let node_data = structure.nodes[node_id];
      plate.x.push(node_data.x);
      plate.y.push(node_data.y);
      plate.z.push(node_data.z);
    });
    plotly_data.push(plate);

    // Selection node a the middle of the plate
    let avg_x = 0;
    let avg_y = 0;
    let avg_z = 0;
    for (let i in plate.x) {
      avg_x += plate.x[i];
      avg_y += plate.y[i];
      avg_z += plate.z[i];
    }
    avg_x /= plate.x.length;
    avg_y /= plate.y.length;
    avg_z /= plate.z.length;
    let plate_label = `${localGetCopy("plate")}  ${plate_id}`;
    let node_middle = { x: avg_x, y: avg_y, z: avg_z };
    selection_nodes_plates.x.push(node_middle.x);
    selection_nodes_plates.y.push(node_middle.y);
    selection_nodes_plates.z.push(node_middle.z);
    selection_nodes_plates.text.push(plate_label);
  });
  plotly_data.push(selection_nodes_plates);
  // Moments
  Object.entries(structure.moments).forEach(([mm_id, mm_data]) => {
    let mm = {
      x: [],
      y: [],
      z: [],
      type: "scatter3d",
      mode: "lines",
      hoverinfo: "none",
      line: { width: 4, color: "green" },
    };
    let node = structure.nodes[mm_data.node];
    let mm_coords = createMoment(node, mm_data.x_mag, mm_data.y_mag, mm_data.z_mag, max_abs_mag, physical_load_size, show_proportional_loads);
    mm.x.push(...mm_coords.mm_x);
    mm.y.push(...mm_coords.mm_y);
    mm.z.push(...mm_coords.mm_z);
    plotly_data.push(mm);
  });
  return plotly_data;
}

function getLayout() {
  return {
    autosize: true,
    showlegend: false,
    margin: { b: 0, l: 0, r: 0, t: 0 },
    modebar: { orientation: "v" },
    scene: {
      aspectmode: "data",
      xaxis: {
        ticks: "",
        showticklabels: false,
        zeroline: false,
        title: "",
        gridwidth: 0,
        spikesides: false,
        spikethickness: 0,
      },
      yaxis: {
        ticks: "",
        showticklabels: false,
        zeroline: false,
        title: "",
        gridwidth: 0,
        spikesides: false,
        spikethickness: 0,
      },
      zaxis: {
        ticks: "",
        showticklabels: false,
        zeroline: false,
        title: "",
        gridwidth: 0,
        spikesides: false,
        spikethickness: 0,
      },
    },
    paper_bgcolor: "rgba(255,255,255,0.1)",
    plot_bgcolor: "rgba(255,255,255,0.1)",
  };
}

function getConfig() {
  return {
    responsive: true,
  };
}

function createSupport(restraint_code, node) {
  let support_size = 0.6;

  let support_x = [];
  let support_y = [];
  let support_z = [];
  switch (restraint_code) {
    case "FFFFFF":
      support_x.push(node.x);
      support_y.push(node.y);
      support_z.push(node.z);

      support_x.push(node.x + support_size);
      support_y.push(node.y);
      support_z.push(node.z);

      support_x.push(node.x + support_size);
      support_y.push(node.y);
      support_z.push(node.z - support_size);

      support_x.push(node.x - support_size);
      support_y.push(node.y);
      support_z.push(node.z - support_size);

      support_x.push(node.x - support_size);
      support_y.push(node.y);
      support_z.push(node.z);

      support_x.push(node.x);
      support_y.push(node.y);
      support_z.push(node.z);

      support_x.push(node.x);
      support_y.push(node.y + support_size);
      support_z.push(node.z);

      support_x.push(node.x);
      support_y.push(node.y + support_size);
      support_z.push(node.z - support_size);

      support_x.push(node.x);
      support_y.push(node.y - support_size);
      support_z.push(node.z - support_size);

      support_x.push(node.x);
      support_y.push(node.y - support_size);
      support_z.push(node.z);

      support_x.push(node.x);
      support_y.push(node.y);
      support_z.push(node.z);
      break;
    case "FFFFFR":
      support_x.push(node.x);
      support_y.push(node.y);
      support_z.push(node.z);

      support_x.push(node.x - support_size);
      support_y.push(node.y);
      support_z.push(node.z - support_size);

      support_x.push(node.x + support_size);
      support_y.push(node.y);
      support_z.push(node.z - support_size);

      support_x.push(node.x);
      support_y.push(node.y);
      support_z.push(node.z);

      support_x.push(node.x);
      support_y.push(node.y - support_size);
      support_z.push(node.z - support_size);

      support_x.push(node.x);
      support_y.push(node.y + support_size);
      support_z.push(node.z - support_size);

      support_x.push(node.x);
      support_y.push(node.y);
      support_z.push(node.z);
      break;
    default:
      break;
  }
  return { support_x, support_y, support_z };
}

function createPointLoad(node, x_mag, y_mag, z_mag, max_abs_mag, physical_load_size, show_proportional_loads) {
  let xi = node.x;
  let yi = node.y;
  let zi = node.z;

  let xf = node.x - x_mag;
  let yf = node.y - y_mag;
  let zf = node.z - z_mag;

  let pl_vector = new geom_utils.Vector(xf, yf, zf, xi, yi, zi);
  let vector_norm = show_proportional_loads ? (physical_load_size * pl_vector.getLength()) / max_abs_mag : physical_load_size;
  let plotable_vector = geom_utils.getPlotableArrow(pl_vector, vector_norm);

  let pl_x = plotable_vector.x;
  let pl_y = plotable_vector.y;
  let pl_z = plotable_vector.z;

  return { pl_x, pl_y, pl_z };
}

function createMoment(node, x_mag, y_mag, z_mag, max_abs_mag, physical_load_size, show_proportional_loads) {
  let second_arrow_lines_size = 0.2 / 0.8;
  let xi = node.x;
  let yi = node.y;
  let zi = node.z;

  let xf = node.x + x_mag;
  let yf = node.y + y_mag;
  let zf = node.z + z_mag;

  let mm_vector = new geom_utils.Vector(xf, yf, zf, xi, yi, zi);
  let vector_norm = show_proportional_loads ? (physical_load_size * mm_vector.getLength()) / max_abs_mag : physical_load_size;
  let vector_norm_2 = show_proportional_loads ? (0.8 * physical_load_size * mm_vector.getLength()) / max_abs_mag : 0.8 * physical_load_size;
  let plotable_vector = geom_utils.getPlotableArrow(mm_vector, vector_norm, "end");
  let plotable_vector_2 = geom_utils.getPlotableArrow(mm_vector, vector_norm_2, "end", second_arrow_lines_size);

  let mm_x = [...plotable_vector.x, ...plotable_vector_2.x];
  let mm_y = [...plotable_vector.y, ...plotable_vector_2.y];
  let mm_z = [...plotable_vector.z, ...plotable_vector_2.z];

  return { mm_x, mm_y, mm_z };
}

function createDistributedLoad(
  node_A,
  node_B,
  x_mag_A,
  y_mag_A,
  z_mag_A,
  x_mag_B,
  y_mag_B,
  z_mag_B,
  max_abs_mag,
  physical_load_size,
  show_proportional_loads
) {
  // Global coords for scatter
  let dl_x = [];
  let dl_y = [];
  let dl_z = [];

  // Start arrow
  let xi_start = node_A.x;
  let yi_start = node_A.y;
  let zi_start = node_A.z;

  let xf_start = node_A.x - x_mag_A;
  let yf_start = node_A.y - y_mag_A;
  let zf_start = node_A.z - z_mag_A;

  let arrow_vector_start = new geom_utils.Vector(xf_start, yf_start, zf_start, xi_start, yi_start, zi_start);
  let vector_start_norm = show_proportional_loads ? (physical_load_size * arrow_vector_start.getLength()) / max_abs_mag : physical_load_size;
  let plotable_vector_start = geom_utils.getPlotableArrow(arrow_vector_start, vector_start_norm);

  dl_x.push(plotable_vector_start.x);
  dl_y.push(plotable_vector_start.y);
  dl_z.push(plotable_vector_start.z);

  // End arrow
  let xi_end = node_B.x;
  let yi_end = node_B.y;
  let zi_end = node_B.z;

  let xf_end = node_B.x - x_mag_B;
  let yf_end = node_B.y - y_mag_B;
  let zf_end = node_B.z - z_mag_B;

  let arrow_vector_end = new geom_utils.Vector(xf_end, yf_end, zf_end, xi_end, yi_end, zi_end);
  let vector_end_norm = show_proportional_loads ? (physical_load_size * arrow_vector_end.getLength()) / max_abs_mag : physical_load_size;
  let plotable_vector_end = geom_utils.getPlotableArrow(arrow_vector_end, vector_end_norm);

  dl_x.push(plotable_vector_end.x);
  dl_y.push(plotable_vector_end.y);
  dl_z.push(plotable_vector_end.z);

  return { dl_x, dl_y, dl_z };
}

const renderer = { getData, getLayout, getConfig };

export default renderer;
