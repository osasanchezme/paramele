import utils from "../utils";

// Plotly traces drawn on top of the structure for the drawing tools, and the picking of what is under the cursor

const MAX_GRID_LINES = 61;
const GRID_MARGIN_CELLS = 2;
const EMPTY_GRID_CELLS = 10;
const POINT_TOOLS = new Set(["member", "plate"]);
const PICK_RADIUS = 12;
// Structural elements each tool can click, besides the snap points of the point tools.
// The tools that add loads or supports also click the existing ones of their kind, to edit them
const TOOL_TARGETS = {
  none: ["nodes", "plates", "supports", "point_loads", "distributed_loads", "moments"],
  member: ["nodes"],
  plate: ["nodes"],
  point_load: ["nodes", "point_loads"],
  moment: ["nodes", "moments"],
  support: ["nodes", "supports"],
  distributed_load: ["members", "distributed_loads"],
  delete: ["nodes", "members", "plates", "supports", "point_loads", "distributed_loads", "moments"],
};
// Load or support each tool adds
const TOOL_HANDLE_KIND = { point_load: "point_loads", moment: "moments", support: "supports", distributed_load: "distributed_loads" };
// Points to draw on: the grid of the work plane and the line normal to it through the last picked point
const SNAP_KINDS = new Set(["grid", "normal_line"]);
const NODE_TOOLS = new Set(["member", "plate", "point_load", "moment", "support", "delete"]);
const MAJOR_GRID_CELLS = 5;
const GRID_COLORS = { minor: "#EDF2F7", major: "#D5DCE6", point: "#CBD3DE" };
const DRAFT_COLOR = "#DD6B20";
const NORMAL_LINE_COLOR = "#B7A4E6";
const SELECTED_COLOR = "#3182CE";
const HANDLE_KINDS = ["supports", "point_loads", "distributed_loads", "moments"];
const HANDLE_COLORS = { supports: "#2D3748", point_loads: "#E53E3E", distributed_loads: "#DD6B20", moments: "#38A169" };

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("drawing", copy_key);
}

/**
 * Axes that span the work plane and the axis normal to it
 * @param {"xy"|"xz"|"yz"} plane
 */
function getPlaneAxes(plane) {
  let in_plane = plane.split("");
  let normal = ["x", "y", "z"].find((axis) => !in_plane.includes(axis));
  return { in_plane, normal };
}

function isPointTool(tool) {
  return POINT_TOOLS.has(tool);
}

function getNodesMarkerSize(tool) {
  return NODE_TOOLS.has(tool) ? 7 : 4;
}

function getMembersMarkerSize(tool) {
  return tool === "distributed_load" || tool === "delete" ? 7 : 3;
}

function getPlatesMarkerSize(tool) {
  return tool === "delete" ? 8 : 5;
}

function isSnapKind(kind) {
  return SNAP_KINDS.has(kind);
}

/**
 * Clickable points for the elements that are only drawn as lines (supports and loads), to edit or delete them
 * @param {import("./types").ParamEleDrawingTool} tool
 */
function getEmptyHandles(tool) {
  if (!TOOL_TARGETS[tool].some((kind) => HANDLE_KINDS.includes(kind))) return null;
  let handles = {};
  HANDLE_KINDS.forEach((kind) => (handles[kind] = { ids: [], x: [], y: [], z: [] }));
  return handles;
}

function pushHandle(handles, kind, element_id, { x, y, z }) {
  if (!handles) return;
  handles[kind].ids.push(element_id);
  handles[kind].x.push(x);
  handles[kind].y.push(y);
  handles[kind].z.push(z);
}

/**
 * The handles are only shown where they are the target of the tool, elsewhere they can still be picked (highlighted on hover)
 * @param {object|null} handles
 * @param {import("./types").ParamEleDrawingTool} tool
 */
function getHandlesTraces(handles, tool) {
  if (!handles) return [];
  return HANDLE_KINDS.filter((kind) => handles[kind].ids.length > 0).map((kind) => ({
    visible: tool === "delete" || TOOL_HANDLE_KIND[tool] === kind,
    x: handles[kind].x,
    y: handles[kind].y,
    z: handles[kind].z,
    type: "scatter3d",
    mode: "markers",
    name: kind,
    customdata: handles[kind].ids,
    marker: { color: HANDLE_COLORS[kind], size: 7, symbol: "diamond" },
    text: handles[kind].ids.map((id) => `${localGetCopy(kind)} ${id}`),
    hovertemplate: "%{text}<extra></extra>",
  }));
}

/**
 * Grid values along an axis, covering the structure with some margin
 * @param {number[]} values Coordinates of the structure along the axis
 * @param {number} spacing
 */
function getGridValues(values, spacing) {
  // At least the default extent, so a small structure still has room to grow
  let min = Math.min(0, ...values.map((value) => value - GRID_MARGIN_CELLS * spacing));
  let max = Math.max(EMPTY_GRID_CELLS * spacing, ...values.map((value) => value + GRID_MARGIN_CELLS * spacing));
  let start = Math.floor(min / spacing);
  let end = Math.ceil(max / spacing);
  // Large structures with a small spacing would add too many points, so the grid is kept around the middle
  if (end - start + 1 > MAX_GRID_LINES) {
    let middle = Math.round((start + end) / 2);
    start = middle - (MAX_GRID_LINES - 1) / 2;
    end = middle + (MAX_GRID_LINES - 1) / 2;
  }
  let grid_values = [];
  // Rounded so shared coordinates match exactly (0.1 * 3 is not 0.3)
  for (let i = start; i <= end; i++) grid_values.push(Number((i * spacing).toPrecision(10)));
  return grid_values;
}

/**
 * Points (clickable) and lines of the work plane
 * @param {import("./types").ParamEleDrawingState} drawing_state
 * @param {object} structure
 */
function getGridTraces(drawing_state, structure) {
  let { plane, offset, spacing } = drawing_state;
  let { in_plane, normal } = getPlaneAxes(plane);
  let [axis_u, axis_v] = in_plane;
  let structural_nodes = Object.values(structure.nodes);
  let u_values = getGridValues(
    structural_nodes.map((node) => node[axis_u]),
    spacing
  );
  let v_values = getGridValues(
    structural_nodes.map((node) => node[axis_v]),
    spacing
  );
  // Kept faint, the hover ring shows the snapped point
  let points = { x: [], y: [], z: [], type: "scatter3d", mode: "markers", name: "grid", hoverinfo: "skip" };
  points.marker = { color: GRID_COLORS.point, size: 2, line: { width: 0 } };
  const getLinesTrace = (color) => ({ x: [], y: [], z: [], type: "scatter3d", mode: "lines", hoverinfo: "skip", line: { color, width: 1 } });
  let minor_lines = getLinesTrace(GRID_COLORS.minor);
  let major_lines = getLinesTrace(GRID_COLORS.major);
  const pushPoint = (trace, u, v) => {
    let point = { [axis_u]: u, [axis_v]: v, [normal]: offset };
    trace.x.push(point.x);
    trace.y.push(point.y);
    trace.z.push(point.z);
  };
  u_values.forEach((u) => v_values.forEach((v) => pushPoint(points, u, v)));
  // Every few lines is stronger, to count cells at a glance. Lines are separated with nulls, so each kind is a single trace
  const getLines = (value) => (Math.round(value / spacing) % MAJOR_GRID_CELLS === 0 ? major_lines : minor_lines);
  const pushLine = (lines, point_a, point_b) => {
    pushPoint(lines, ...point_a);
    pushPoint(lines, ...point_b);
    lines.x.push(null);
    lines.y.push(null);
    lines.z.push(null);
  };
  let [u_first, u_last] = [u_values[0], u_values[u_values.length - 1]];
  let [v_first, v_last] = [v_values[0], v_values[v_values.length - 1]];
  u_values.forEach((u) => pushLine(getLines(u), [u, v_first], [u, v_last]));
  v_values.forEach((v) => pushLine(getLines(v), [u_first, v], [u_last, v]));
  return [minor_lines, major_lines, points];
}

/**
 * Snap points along the axis normal to the work plane, through the last picked point, so members can leave the plane
 * @param {import("./types").ParamEleDrawingState} drawing_state
 * @param {object} structure
 */
function getNormalLineTraces({ plane, spacing, points }, structure) {
  let last_point = points[points.length - 1];
  if (!last_point) return [];
  let { normal } = getPlaneAxes(plane);
  let values = getGridValues(
    Object.values(structure.nodes).map((node) => node[normal]),
    spacing
  ).filter((value) => Math.abs(value - last_point[normal]) > 1e-9);
  let line_points = values.map((value) => ({ ...last_point, [normal]: value }));
  let ends = [values[0], values[values.length - 1]].map((value) => ({ ...last_point, [normal]: value }));
  return [
    {
      x: ends.map(({ x }) => x),
      y: ends.map(({ y }) => y),
      z: ends.map(({ z }) => z),
      type: "scatter3d",
      mode: "lines",
      hoverinfo: "skip",
      line: { color: NORMAL_LINE_COLOR, width: 1.5, dash: "dash" },
    },
    {
      x: line_points.map(({ x }) => x),
      y: line_points.map(({ y }) => y),
      z: line_points.map(({ z }) => z),
      type: "scatter3d",
      mode: "markers",
      name: "normal_line",
      hoverinfo: "skip",
      marker: { color: NORMAL_LINE_COLOR, size: 2.5, line: { width: 0 } },
    },
  ];
}

/**
 * Axis ranges that fit the structure and the work plane. They are fixed while drawing, so the view does not jump on every new element
 * @param {import("./types").ParamEleDrawingState} drawing_state
 * @param {object} structure
 * @param {Object.<string, number[]>|null} previous_ranges Ranges only grow from these
 * @returns {Object.<string, number[]>}
 */
function getSceneRanges(drawing_state, structure, previous_ranges) {
  let { plane, offset, spacing } = drawing_state;
  let { in_plane, normal } = getPlaneAxes(plane);
  let structural_nodes = Object.values(structure.nodes);
  let ranges = {};
  ["x", "y", "z"].forEach((axis) => {
    let values = structural_nodes.map((node) => node[axis]);
    let range;
    // The normal axis also fits its snap line, so the view does not jump when the line appears
    if (in_plane.includes(axis) || isPointTool(drawing_state.tool)) {
      let grid_values = getGridValues(axis === normal ? [...values, offset] : values, spacing);
      range = [grid_values[0], grid_values[grid_values.length - 1]];
    } else {
      range = [Math.min(0, offset, ...values) - spacing, Math.max(0, offset, ...values) + spacing];
    }
    if (previous_ranges?.[axis]) range = [Math.min(range[0], previous_ranges[axis][0]), Math.max(range[1], previous_ranges[axis][1])];
    ranges[axis] = range;
  });
  // The normal axis is not on the grid, but it is fixed too
  ranges[normal] = ranges[normal] || [offset - spacing, offset + spacing];
  return ranges;
}

/**
 * Elements that the active tool can click, from the traces of the renderer (named, with the IDs in customdata)
 * @param {object[]} plot_data
 * @param {import("./types").ParamEleDrawingTool} tool
 * @returns {{kind: string, id: string|undefined, x: number, y: number, z: number}[]}
 */
function getPickCandidates(plot_data, tool) {
  let kinds = new Set(TOOL_TARGETS[tool] || []);
  if (isPointTool(tool)) SNAP_KINDS.forEach((kind) => kinds.add(kind));
  let candidates = [];
  plot_data.forEach((trace) => {
    if (!kinds.has(trace.name)) return;
    trace.x.forEach((x, i) => candidates.push({ kind: trace.name, id: trace.customdata?.[i], x, y: trace.y[i], z: trace.z[i] }));
  });
  return candidates;
}

/**
 * Gets a function that projects data coordinates to pixels of the plot, with the current camera of the 3D scene
 * @param {HTMLElement} plot_element
 */
function getScreenProjector(plot_element) {
  let scene = plot_element?._fullLayout?.scene?._scene;
  if (!scene || !scene.glplot) return null;
  let { model, view, projection } = scene.glplot.cameraParams;
  if (!model || !view || !projection) return null;
  let data_scale = scene.dataScale;
  let canvas = scene.glplot.canvas;
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  const transform = (matrix, v) =>
    [0, 1, 2, 3].map((row) => matrix[row] * v[0] + matrix[4 + row] * v[1] + matrix[8 + row] * v[2] + matrix[12 + row] * v[3]);
  // Same transformation as the WebGL shaders of the scene
  return ({ x, y, z }) => {
    let v = transform(projection, transform(view, transform(model, [x * data_scale[0], y * data_scale[1], z * data_scale[2], 1])));
    if (v[3] <= 0) return null;
    return { x: ((v[0] / v[3] + 1) / 2) * width, y: ((1 - v[1] / v[3]) / 2) * height };
  };
}

/**
 * Finds the element under the cursor. Elements win over grid points, so nodes are easy to hit where they sit on the grid
 * @param {object[]} candidates From getPickCandidates
 * @param {function} project From getScreenProjector
 * @param {{x: number, y: number}} cursor Pixels relative to the plot
 */
function pickCandidate(candidates, project, cursor) {
  let best = null;
  candidates.forEach((candidate) => {
    let screen = project(candidate);
    if (!screen) return;
    let distance = Math.hypot(screen.x - cursor.x, screen.y - cursor.y);
    if (distance > PICK_RADIUS) return;
    let score = distance + (isSnapKind(candidate.kind) ? PICK_RADIUS : 0);
    if (!best || score < best.score) best = { score, candidate };
  });
  return best ? best.candidate : null;
}

/**
 * Traces that highlight structural elements: points for nodes and what sits on a node, lines along members and around plates
 * @param {{structure_key: string, element_id: string}[]} highlight
 * @param {object} structure
 */
function getHighlightTraces(highlight, structure) {
  let points = { x: [], y: [], z: [] };
  let lines = { x: [], y: [], z: [] };
  const pushPoint = (node_id) => {
    let node = structure.nodes[node_id];
    if (!node) return;
    ["x", "y", "z"].forEach((axis) => points[axis].push(node[axis]));
  };
  // Lines are separated by a gap (null), so all of them fit in one trace
  const pushLine = (node_ids) => {
    let nodes = node_ids.map((node_id) => structure.nodes[node_id]);
    if (nodes.some((node) => !node)) return;
    ["x", "y", "z"].forEach((axis) => lines[axis].push(...nodes.map((node) => node[axis]), null));
  };
  const pushMember = (member_id) => {
    let member = structure.members[member_id];
    if (member) pushLine([member.node_A, member.node_B]);
  };
  highlight.forEach(({ structure_key, element_id }) => {
    let element = structure[structure_key]?.[element_id];
    if (!element) return;
    if (structure_key === "nodes") pushPoint(element_id);
    else if (structure_key === "members") pushMember(element_id);
    else if (structure_key === "distributed_loads") pushMember(element.member);
    else if (structure_key === "plates" && Array.isArray(element.nodes)) pushLine([...element.nodes, element.nodes[0]]);
    else if (element.node !== undefined) pushPoint(element.node);
  });
  let traces = [];
  if (lines.x.length > 0)
    traces.push({ ...lines, type: "scatter3d", mode: "lines", hoverinfo: "skip", opacity: 0.55, line: { color: SELECTED_COLOR, width: 12 } });
  if (points.x.length > 0)
    traces.push({ ...points, type: "scatter3d", mode: "markers", hoverinfo: "skip", marker: { color: SELECTED_COLOR, size: 14, opacity: 0.45 } });
  return traces;
}

/**
 * Traces of the drawing tools, drawn on top of the structure: snap points, picked points and the element being edited
 * @param {import("./types").ParamEleDrawingState} drawing_state
 * @param {object} structure
 */
function getOverlayTraces(drawing_state, structure) {
  let { tool, points, selected_target, highlight } = drawing_state;
  let traces = [];
  if (highlight?.length > 0) traces.push(...getHighlightTraces(highlight, structure));
  if (isPointTool(tool)) traces.push(...getGridTraces(drawing_state, structure), ...getNormalLineTraces(drawing_state, structure));
  // The points picked so far. The preview up to the cursor is drawn over the plot, so hovering does not replot
  if (points.length > 0) {
    traces.push({
      x: points.map(({ x }) => x),
      y: points.map(({ y }) => y),
      z: points.map(({ z }) => z),
      type: "scatter3d",
      mode: "lines+markers",
      hoverinfo: "skip",
      line: { color: DRAFT_COLOR, width: 5 },
      marker: { color: DRAFT_COLOR, size: 4 },
    });
  }
  if (selected_target) {
    traces.push({
      x: [selected_target.x],
      y: [selected_target.y],
      z: [selected_target.z],
      type: "scatter3d",
      mode: "markers",
      hoverinfo: "skip",
      marker: { color: SELECTED_COLOR, size: 14, opacity: 0.45 },
    });
  }
  return traces;
}

const drawingLayer = {
  getPlaneAxes,
  isPointTool,
  isSnapKind,
  getNodesMarkerSize,
  getMembersMarkerSize,
  getPlatesMarkerSize,
  getEmptyHandles,
  pushHandle,
  getHandlesTraces,
  getOverlayTraces,
  getPickCandidates,
  getSceneRanges,
  getScreenProjector,
  pickCandidate,
};

export default drawingLayer;
