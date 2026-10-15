import getState from "../getState";
import geom_utils from "../geom_utils";
import state from "../state";
import utils from "../utils";
import drawingLayer from "./drawingLayer";
import mesher from "./mesher";
import resultsLayer from "./resultsLayer";
import supportGlyphs from "./supportGlyphs";

const PLATE_COLOR = "#D2DDE8";
const MESH_LINES_COLOR = "#5A6B7D";
const PRESSURE_COLOR = "#805AD5";
// The structure under its deformed shape
const UNDEFORMED_COLOR = "#A0AEC0";

function localGetCopy(node_name) {
  return utils.getDisplayCopy("renderer", node_name);
}

/**
 * @param {import("./types").ParamEleDrawingState} [drawing_state] Adds what the drawing tools need: clickable elements, the work plane grid...
 * @param {{results: import("./types").ParamEleDisplacementResults, component: "sum"|"x"|"y"|"z", scale: number}|null} [deformed] Draws the
 *  deformed shape over the structure, which is faded
 */
function getData(drawing_state, deformed) {
  let structure = getState("structure");
  const tool = drawing_state ? drawing_state.tool : "none";
  // Elements are named and carry their IDs, so a click in the renderer knows what was clicked
  const handles = drawingLayer.getEmptyHandles(tool);
  let units = structure.settings.units;
  let plotly_data = [];
  const global_settings = getState("settings")["global"];
  const physical_load_size = global_settings["physical_load_size"];
  const show_proportional_loads = global_settings["show_proportional_loads"];
  // The loads stay as a reference under the deformed shape
  const loads_opacity = deformed ? 0.3 : 1;

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
    name: "nodes",
    customdata: [],
    marker: { color: "#003CA0", size: drawingLayer.getNodesMarkerSize(tool) },
    text: [],
    hovertemplate: "%{text} (%{x}, %{y}, %{z})<extra></extra>",
  };
  // The nodes made by the mesher are drawn with the mesh, they are not boxes of the model
  const structure_mesh = state.getGlobalVariable("structure_mesh");
  const mesh_node_ids = new Set(structure_mesh ? structure_mesh.node_ids.map(String) : []);
  Object.entries(structure.nodes).forEach(([node_id, node_data]) => {
    if (mesh_node_ids.has(node_id)) return;
    nodes.customdata.push(node_id);
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
    name: "members",
    customdata: [],
    marker: { color: [], size: drawingLayer.getMembersMarkerSize(tool) },
    text: [],
    hovertemplate: "%{text} <extra></extra>",
  };
  Object.entries(structure.members).forEach(([member_id, member_data]) => {
    let section_color = state.getSectionColor(member_data.section_id);
    let member_line = deformed ? { width: 2, color: UNDEFORMED_COLOR } : { width: 3, color: section_color };
    let member = { x: [], y: [], z: [], type: "scatter3d", mode: "lines", hoverinfo: "none", line: member_line };
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
    selection_nodes.customdata.push(member_id);
    selection_nodes.marker.color.push(section_color);
  });
  plotly_data.push(selection_nodes);

  // Supports
  const support_builder = supportGlyphs.createBuilder();
  Object.entries(structure.supports).forEach(([support_id, support_data]) => {
    let node = structure.nodes[support_data.node];
    if (!node) return;
    let handle = supportGlyphs.addSupport(support_builder, support_data.restraint_code, node);
    drawingLayer.pushHandle(handles, "supports", support_id, handle);
  });
  plotly_data.push(...supportGlyphs.getTraces(support_builder));

  // Find the max magnitude to normalize the others
  let magnitude_sources = {
    point_loads: [["x_mag", "y_mag", "z_mag"]],
    moments: [["x_mag", "y_mag", "z_mag"]],
    pressures: [["x_mag", "y_mag", "z_mag"]],
    distributed_loads: [
      ["x_mag_A", "y_mag_A", "z_mag_A"],
      ["x_mag_B", "y_mag_B", "z_mag_B"],
    ],
  };
  let max_abs_mag = 0;
  Object.entries(magnitude_sources).forEach(([source_key, magnitude_keys]) => {
    Object.values(structure[source_key] || {}).forEach((source_object) => {
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
      opacity: loads_opacity,
      line: { width: 4, color: "red" },
    };
    let node = structure.nodes[pl_data.node];
    let pl_coords = createPointLoad(node, pl_data.x_mag, pl_data.y_mag, pl_data.z_mag, max_abs_mag, physical_load_size, show_proportional_loads);
    pl.x.push(...pl_coords.pl_x);
    pl.y.push(...pl_coords.pl_y);
    pl.z.push(...pl_coords.pl_z);
    plotly_data.push(pl);
    // The first point of an arrow is its far end
    drawingLayer.pushHandle(handles, "point_loads", pl_id, { x: pl.x[0], y: pl.y[0], z: pl.z[0] });
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
      opacity: loads_opacity,
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
    if (dl.x.length > 0) {
      let far_B = dl_coords.dl_x[0].length;
      drawingLayer.pushHandle(handles, "distributed_loads", dl_id, {
        x: (dl.x[0] + dl.x[far_B]) / 2,
        y: (dl.y[0] + dl.y[far_B]) / 2,
        z: (dl.z[0] + dl.z[far_B]) / 2,
      });
    }
  });

  // Plates
  let selection_nodes_plates = {
    x: [],
    y: [],
    z: [],
    type: "scatter3d",
    mode: "markers",
    name: "plates",
    customdata: [],
    marker: { color: "#D2DDE8", size: drawingLayer.getPlatesMarkerSize(tool) },
    text: [],
    hovertemplate: "%{text} <extra></extra>",
  };
  const quads_by_plate = getQuadsByPlate(structure.meshed_plates);
  Object.entries(structure.plates).forEach(([plate_id, plate_data]) => {
    if (!plate_data.nodes || !Array.isArray(plate_data.nodes)) return;
    if (quads_by_plate[plate_id]) {
      plotly_data.push(getMeshedPlateTrace(structure.nodes, quads_by_plate[plate_id], Boolean(deformed)));
    } else {
      // Triangles of the plate's own polygon: Delaunay over the corners would fill a concave plate up to its convex hull
      let plate_nodes = plate_data.nodes.map((node_id) => structure.nodes[node_id]).filter(Boolean);
      let triangles = mesher.triangulatePolygon(plate_nodes);
      let plate = {
        x: plate_nodes.map((node) => node.x),
        y: plate_nodes.map((node) => node.y),
        z: plate_nodes.map((node) => node.z),
        i: triangles.map((triangle) => triangle[0]),
        j: triangles.map((triangle) => triangle[1]),
        k: triangles.map((triangle) => triangle[2]),
        type: "mesh3d",
        color: PLATE_COLOR,
        hoverinfo: "none",
        opacity: deformed ? 0.15 : 0.5,
        flatshading: true,
        lighting: { ambient: 0.85, diffuse: 0.3, specular: 0, roughness: 1, fresnel: 0 },
      };
      plotly_data.push(plate);
    }

    // Selection node a the middle of the plate
    let node_middle = { x: 0, y: 0, z: 0 };
    plate_data.nodes.forEach((node_id) => {
      let node_data = structure.nodes[node_id];
      ["x", "y", "z"].forEach((axis) => (node_middle[axis] += node_data[axis] / plate_data.nodes.length));
    });
    let plate_label = `${localGetCopy("plate")}  ${plate_id}`;
    selection_nodes_plates.x.push(node_middle.x);
    selection_nodes_plates.y.push(node_middle.y);
    selection_nodes_plates.z.push(node_middle.z);
    selection_nodes_plates.text.push(plate_label);
    selection_nodes_plates.customdata.push(plate_id);
  });
  plotly_data.push(selection_nodes_plates);
  if (Object.keys(quads_by_plate).length > 0 && !deformed) plotly_data.push(getMeshLinesTrace(structure.nodes, Object.values(quads_by_plate).flat()));
  if (deformed) plotly_data.push(...resultsLayer.getDeformedTraces(structure, deformed.results, deformed));
  // Pressures
  Object.entries(structure.pressures || {}).forEach(([pressure_id, pressure_data]) => {
    let plate_data = structure.plates[pressure_data.plate_id];
    if (!plate_data || !Array.isArray(plate_data.nodes)) return;
    let plate_nodes = plate_data.nodes.map((node_id) => structure.nodes[node_id]).filter(Boolean);
    let pressure = createPressure(plate_nodes, plate_data.rotZ, pressure_data, max_abs_mag, physical_load_size, show_proportional_loads);
    if (!pressure) return;
    plotly_data.push({ ...pressure.trace, opacity: loads_opacity });
    drawingLayer.pushHandle(handles, "pressures", pressure_id, pressure.handle);
  });
  // Moments
  Object.entries(structure.moments).forEach(([mm_id, mm_data]) => {
    let mm = {
      x: [],
      y: [],
      z: [],
      type: "scatter3d",
      mode: "lines",
      hoverinfo: "none",
      opacity: loads_opacity,
      line: { width: 4, color: "green" },
    };
    let node = structure.nodes[mm_data.node];
    let mm_coords = createMoment(node, mm_data.x_mag, mm_data.y_mag, mm_data.z_mag, max_abs_mag, physical_load_size, show_proportional_loads);
    mm.x.push(...mm_coords.mm_x);
    mm.y.push(...mm_coords.mm_y);
    mm.z.push(...mm_coords.mm_z);
    plotly_data.push(mm);
    drawingLayer.pushHandle(handles, "moments", mm_id, { x: mm.x[0], y: mm.y[0], z: mm.z[0] });
  });
  plotly_data.push(...getCombinationsFrames(structure.nodes, state.getGlobalVariable("structure_combinations"), global_settings));
  plotly_data.push(...drawingLayer.getHandlesTraces(handles, tool));
  return plotly_data;
}

/**
 * Quads of the meshed plates (lists of 4 node IDs) by parent plate
 * @param {object} [meshed_plates]
 * @returns {Object<string, number[][]>}
 */
function getQuadsByPlate(meshed_plates) {
  const quads_by_plate = {};
  Object.values(meshed_plates || {}).forEach(({ node_A, node_B, node_C, node_D, parent_plate }) => {
    const quad = [node_A, node_B, node_C, node_D].filter((node_id) => node_id !== null && node_id !== undefined);
    (quads_by_plate[parent_plate] = quads_by_plate[parent_plate] || []).push(quad);
  });
  return quads_by_plate;
}

/**
 * Surface of a meshed plate, two triangles per quad, so it follows any shape (Delaunay over the corners does not)
 * @param {object} structural_nodes
 * @param {number[][]} quads
 * @param {boolean} faded Under the deformed shape
 */
function getMeshedPlateTrace(structural_nodes, quads, faded) {
  const trace = {
    x: [],
    y: [],
    z: [],
    i: [],
    j: [],
    k: [],
    type: "mesh3d",
    color: PLATE_COLOR,
    hoverinfo: "none",
    opacity: faded ? 0.15 : 0.5,
    flatshading: true,
    lighting: { ambient: 0.85, diffuse: 0.3, specular: 0, roughness: 1, fresnel: 0 },
  };
  const vertex_index = {};
  const getVertex = (node_id) => {
    if (vertex_index[node_id] === undefined) {
      const node = structural_nodes[node_id];
      vertex_index[node_id] = trace.x.length;
      trace.x.push(node.x);
      trace.y.push(node.y);
      trace.z.push(node.z);
    }
    return vertex_index[node_id];
  };
  quads.forEach((quad) => {
    const vertices = quad.map(getVertex);
    for (let k = 1; k < vertices.length - 1; k++) {
      trace.i.push(vertices[0]);
      trace.j.push(vertices[k]);
      trace.k.push(vertices[k + 1]);
    }
  });
  return trace;
}

/**
 * Edges of the mesh elements, each edge drawn once
 * @param {object} structural_nodes
 * @param {number[][]} quads
 */
function getMeshLinesTrace(structural_nodes, quads) {
  const trace = {
    x: [],
    y: [],
    z: [],
    type: "scatter3d",
    mode: "lines",
    name: "mesh",
    hoverinfo: "none",
    line: { width: 1, color: MESH_LINES_COLOR },
  };
  const drawn = new Set();
  quads.forEach((quad) =>
    quad.forEach((node_a, k) => {
      const node_b = quad[(k + 1) % quad.length];
      const key = node_a < node_b ? `${node_a}-${node_b}` : `${node_b}-${node_a}`;
      if (drawn.has(key)) return;
      drawn.add(key);
      [node_a, node_b].forEach((node_id) => {
        const node = structural_nodes[node_id];
        trace.x.push(node.x);
        trace.y.push(node.y);
        trace.z.push(node.z);
      });
      trace.x.push(null);
      trace.y.push(null);
      trace.z.push(null);
    })
  );
  return trace;
}

/**
 * Faint wireframe boxes around each possibility, all with the size of the largest one, labeled with the value of the iterated node
 * @param {object} structural_nodes
 * @param {import("./types").ParamEleStructureCombination[]} [combinations]
 * @param {object} global_settings
 */
function getCombinationsFrames(structural_nodes, combinations, global_settings) {
  if (!combinations || combinations.length === 0) return [];
  const axes = ["x", "y", "z"];
  const bounds = combinations.map((combination) => {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    combination.node_ids.forEach((node_id) => {
      const node = structural_nodes[node_id];
      if (!node) return;
      axes.forEach((axis) => {
        min[axis] = Math.min(min[axis], node[axis]);
        max[axis] = Math.max(max[axis], node[axis]);
      });
    });
    return min.x === Infinity ? null : { min, max };
  });
  const size = { x: 0, y: 0, z: 0 };
  bounds.forEach((bound) => {
    if (bound) axes.forEach((axis) => (size[axis] = Math.max(size[axis], bound.max[axis] - bound.min[axis])));
  });
  // The margin around the largest possibility stays under half the spacing, so neighbor boxes of the same size do not touch
  const spacing = Number(global_settings["spacing_between_combinations"]) || 0;
  const margin = Math.min(0.1 * Math.max(size.x, size.y, size.z, 1), 0.4 * spacing);
  axes.forEach((axis) => (size[axis] += 2 * margin));

  const frames = { x: [], y: [], z: [], type: "scatter3d", mode: "lines", hoverinfo: "none", opacity: 0.25, line: { width: 1, color: "#718096" } };
  const labels = {
    x: [],
    y: [],
    z: [],
    text: [],
    type: "scatter3d",
    mode: "text",
    hoverinfo: "none",
    textposition: "top right",
    textfont: { color: "#718096", size: 11 },
  };
  // Edges of a unit box as pairs of corners
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  const edges = [
    [0, 1, 2, 3, 0, 4, 5, 6, 7, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  bounds.forEach((bound, i) => {
    if (!bound) return;
    // Centered on its possibility
    const origin = {};
    axes.forEach((axis) => (origin[axis] = (bound.min[axis] + bound.max[axis]) / 2 - size[axis] / 2));
    edges.forEach((edge) => {
      edge.forEach((corner_i) => axes.forEach((axis, axis_i) => frames[axis].push(origin[axis] + corners[corner_i][axis_i] * size[axis])));
      axes.forEach((axis) => frames[axis].push(null));
    });
    const combination = combinations[i];
    labels.x.push(origin.x);
    labels.y.push(origin.y);
    labels.z.push(origin.z + size.z);
    labels.text.push(`${combination.node_label} = ${Number(combination.value.toFixed(10))}`);
  });
  return [frames, labels];
}

function getLayout() {
  return {
    autosize: true,
    // Keeps the camera of the user when the data or the layout change
    uirevision: "renderer",
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

/**
 * Arrows spread over a plate that end on it, with the outline of the plate through their tails
 * @param {{x: number, y: number, z: number}[]} plate_nodes Corners of the plate, in order
 * @param {number} rot_z rotZ of the plate
 * @param {{x_mag: number, y_mag: number, z_mag: number, axes: string}} pressure_data Components in the global axes, or in the
 *  plate's local axes when axes is "local" ("global_projected" only changes the area they act on, not their direction)
 * @returns {{trace: object, handle: {x: number, y: number, z: number}}|null}
 */
function createPressure(plate_nodes, rot_z, pressure_data, max_abs_mag, physical_load_size, show_proportional_loads) {
  let surface = mesher.getPlateSurfacePoints(plate_nodes, rot_z);
  if (!surface) return null;
  let magnitudes = ["x", "y", "z"].map((axis) => Number(pressure_data[`${axis}_mag`]) || 0);
  let direction = { x: magnitudes[0], y: magnitudes[1], z: magnitudes[2] };
  if (pressure_data.axes === "local") {
    let { axes } = surface;
    direction = {};
    ["x", "y", "z"].forEach((axis) => (direction[axis] = magnitudes[0] * axes.x[axis] + magnitudes[1] * axes.y[axis] + magnitudes[2] * axes.z[axis]));
  }
  let magnitude = Math.hypot(direction.x, direction.y, direction.z);
  if (magnitude === 0) return null;
  let length = show_proportional_loads ? (physical_load_size * magnitude) / max_abs_mag : physical_load_size;
  // Where the tails are, from a point on the plate
  let tail = { x: (-direction.x * length) / magnitude, y: (-direction.y * length) / magnitude, z: (-direction.z * length) / magnitude };
  let trace = { x: [], y: [], z: [], type: "scatter3d", mode: "lines", hoverinfo: "none", line: { width: 3, color: PRESSURE_COLOR } };
  [...surface.points, ...surface.edge_points].forEach((point) => {
    let vector = new geom_utils.Vector(point.x + tail.x, point.y + tail.y, point.z + tail.z, point.x, point.y, point.z);
    let arrow = geom_utils.getPlotableArrow(vector, length);
    trace.x.push(...arrow.x, null);
    trace.y.push(...arrow.y, null);
    trace.z.push(...arrow.z, null);
  });
  [...plate_nodes, plate_nodes[0]].forEach((node) => {
    trace.x.push(node.x + tail.x);
    trace.y.push(node.y + tail.y);
    trace.z.push(node.z + tail.z);
  });
  let { centroid } = surface;
  return { trace, handle: { x: centroid.x + tail.x, y: centroid.y + tail.y, z: centroid.z + tail.z } };
}

const renderer = { getData, getLayout, getConfig };

export default renderer;
