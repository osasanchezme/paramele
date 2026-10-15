import getState from "../getState";
import state from "../state";
import utils from "../utils";
import { units as units_converter } from "../submodulesAPI";

// Blue → cyan → green → yellow → red, the usual scale of displacement contours, readable on a white background
const DISPLACEMENT_COLORSCALE = [
  [0, "#2C3E9E"],
  [0.2, "#2B83BA"],
  [0.4, "#3FB8A6"],
  [0.6, "#9CCB3C"],
  [0.8, "#F2B705"],
  [1, "#D7301F"],
];
// Components have a sign: blue goes against the axis, red along it, and the gray of no displacement is still visible
const SIGNED_COLORSCALE = [
  [0, "#1F4E9C"],
  [0.25, "#5B8FD0"],
  [0.5, "#B4BCC6"],
  [0.75, "#E07B5A"],
  [1, "#B2182B"],
];
const DEFORMED_MESH_LINES_COLOR = "rgba(45, 55, 72, 0.45)";
// The largest displacement drawn with the automatic scale, as a fraction of the size of the structure
const AUTO_SCALE_TARGET = 0.08;
const COMPONENTS = ["x", "y", "z"];

function localGetCopy(key) {
  return utils.getDisplayCopy("renderer", key);
}

/**
 * Geometry the results were solved with, to know if they still belong to the structure
 * @param {object} structure
 */
function getGeometrySignature(structure) {
  const nodes = Object.entries(structure.nodes || {}).map(([id, { x, y, z }]) => [id, x, y, z]);
  const members = Object.entries(structure.members || {}).map(([id, { node_A, node_B }]) => [id, node_A, node_B]);
  const quads = Object.entries(structure.meshed_plates || {}).map(([id, { node_A, node_B, node_C, node_D }]) => [id, node_A, node_B, node_C, node_D]);
  return JSON.stringify([nodes, members, quads]);
}

/**
 * Saves what the results were solved with: the geometry (the renderer only draws the results on it) and the unit of their translations
 * @param {object} results Results by load case, completed in place
 * @param {object} structure The solved structure
 * @param {string} solver_engine
 */
function tagResults(results, structure, solver_engine) {
  state.setGlobalVariable("results_geometry", getGeometrySignature(structure));
  const { units } = structure.settings;
  // PyNite works in the length units of the model, SkyCiv returns translations in their own units
  const displacement_unit = solver_engine === "skyciv" ? units.translation : units.length;
  Object.values(results || {}).forEach((lc_results) => {
    if (lc_results && typeof lc_results === "object" && !lc_results.displacement_unit) lc_results.displacement_unit = displacement_unit;
  });
}

/**
 * Members and plates of the structure that have displacements in the results
 * @param {object} structure
 * @param {object} lc_results
 */
function getDisplacedElements(structure, lc_results) {
  const solved_geometry = state.getGlobalVariable("results_geometry");
  const geometry_matches = !solved_geometry || solved_geometry === getGeometrySignature(structure);
  if (!geometry_matches) return { members: {}, quads: {} };
  const members = {};
  const member_displacements = lc_results.member_displacements || {};
  Object.keys(structure.members || {}).forEach((member_id) => {
    const by_component = COMPONENTS.map((axis) => (member_displacements[`displacement_${axis}`] || {})[member_id]);
    if (by_component.some((values) => !values || typeof values !== "object")) return;
    // Values by position along the member, in % of its length
    const stations = Object.keys(by_component[0])
      .map(Number)
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (stations.length < 2) return;
    members[member_id] = stations.map((t) => {
      const key = Object.keys(by_component[0]).find((candidate) => Number(candidate) === t);
      const d = {};
      COMPONENTS.forEach((axis, i) => (d[axis] = Number(by_component[i][key]) || 0));
      return { t: t / 100, d };
    });
  });
  const quads = {};
  const plate_displacements = lc_results.plate_displacements || {};
  Object.entries(structure.meshed_plates || {}).forEach(([quad_id, quad]) => {
    const by_component = COMPONENTS.map((axis) => (plate_displacements[`displacement_${axis}`] || {})[quad_id]);
    if (by_component.some((values) => !Array.isArray(values))) return;
    const node_ids = [quad.node_A, quad.node_B, quad.node_C, quad.node_D].filter((node_id) => node_id !== null && node_id !== undefined);
    quads[quad_id] = node_ids.map((node_id, k) => {
      const d = {};
      COMPONENTS.forEach((axis, i) => (d[axis] = Number(by_component[i][k]) || 0));
      return { node_id, d };
    });
  });
  return { members, quads };
}

/**
 * A round scale (1, 2 or 5 × 10^n) that draws the largest displacement at about AUTO_SCALE_TARGET of the size of the structure
 * @param {object} structure
 * @param {number} max_displacement In length units
 */
function getAutoScale(structure, max_displacement) {
  const nodes = Object.values(structure.nodes || {});
  if (nodes.length === 0 || !(max_displacement > 0)) return 1;
  const size = Math.hypot(...COMPONENTS.map((axis) => Math.max(...nodes.map((node) => node[axis])) - Math.min(...nodes.map((node) => node[axis]))));
  const exact = (AUTO_SCALE_TARGET * (size || 1)) / max_displacement;
  const power = 10 ** Math.floor(Math.log10(exact));
  const nice = [1, 2, 5, 10].map((factor) => factor * power).filter((value) => value <= exact * 1.0001);
  return nice[nice.length - 1] || power;
}

/**
 * Displacements of the results that belong to the current structure, or null when there are none
 * @param {object} structure
 * @param {string} [load_case] Key of the load case in the results, the first one by default
 * @returns {import("./types").ParamEleDisplacementResults|null}
 */
function getDisplacementResults(structure, load_case) {
  const results = getState("results");
  if (!results || typeof results !== "object") return null;
  const load_cases = Object.entries(results)
    .filter(([, lc_results]) => lc_results && (lc_results.member_displacements || lc_results.plate_displacements))
    .map(([key, lc_results]) => ({ key, name: lc_results.name !== undefined ? String(lc_results.name) : key }));
  if (load_cases.length === 0) return null;
  const key = load_cases.some((lc) => lc.key === load_case) ? load_case : load_cases[0].key;
  const lc_results = results[key];
  const { members, quads } = getDisplacedElements(structure, lc_results);
  if (Object.keys(members).length === 0 && Object.keys(quads).length === 0) return null;

  const units = structure.settings.units;
  const engine = getState("settings").global.solver_engine;
  const results_unit = lc_results.displacement_unit || (engine === "skyciv" ? units.translation : units.length);
  const display_unit = units.translation || results_unit;
  const to_length = units_converter.convert(1, results_unit, units.length);
  const to_display = units_converter.convert(1, results_unit, display_unit);
  // Largest value of each component, with its sign
  const extremes = { sum: 0, x: 0, y: 0, z: 0 };
  const points = [...Object.values(members).flat(), ...Object.values(quads).flat()];
  points.forEach(({ d }) =>
    Object.keys(extremes).forEach((component) => {
      const { value } = getComponent(d, component);
      if (Math.abs(value) > Math.abs(extremes[component])) extremes[component] = value;
    })
  );
  Object.keys(extremes).forEach((component) => (extremes[component] *= to_display));
  const max_displacement = extremes.sum / to_display;
  return {
    load_cases,
    load_case: key,
    members,
    quads,
    to_length,
    to_display,
    display_unit,
    max_displacement: extremes.sum,
    extremes,
    auto_scale: getAutoScale(structure, max_displacement * to_length),
  };
}

/**
 * Displacement vector drawn and value colored for the chosen component
 * @param {{x: number, y: number, z: number}} d
 * @param {"sum"|"x"|"y"|"z"} component
 */
function getComponent(d, component) {
  if (component === "sum") return { vector: d, value: Math.hypot(d.x, d.y, d.z) };
  const vector = { x: 0, y: 0, z: 0 };
  vector[component] = d[component];
  return { vector, value: d[component] };
}

function formatValue(value) {
  return Number(value.toPrecision(4));
}

/**
 * The structure moved by its displacements (times the scale), colored by the chosen component
 * @param {object} structure
 * @param {import("./types").ParamEleDisplacementResults} displacement_results
 * @param {{component: "sum"|"x"|"y"|"z", scale: number}} view
 * @returns {object[]} Plotly traces
 */
function getDeformedTraces(structure, displacement_results, view) {
  const { members, quads, to_length, to_display, display_unit } = displacement_results;
  const { component, scale } = view;
  const title = `${localGetCopy(`deformed_${component}`)} (${display_unit})`;
  const move = (point, vector) => {
    const moved = {};
    COMPONENTS.forEach((axis) => (moved[axis] = point[axis] + vector[axis] * to_length * scale));
    return moved;
  };
  let values = [];
  // Where the largest displacement is, labeled
  let extreme = null;
  const checkExtreme = (position, value) => {
    if (!extreme || Math.abs(value) > Math.abs(extreme.value)) extreme = { position, value };
  };

  const member_trace = {
    x: [],
    y: [],
    z: [],
    text: [],
    type: "scatter3d",
    mode: "lines",
    name: "deformed_members",
    line: { width: 6, color: [] },
    hovertemplate: "%{text}<extra></extra>",
  };
  Object.entries(members).forEach(([member_id, stations]) => {
    const node_A = structure.nodes[structure.members[member_id].node_A];
    const node_B = structure.nodes[structure.members[member_id].node_B];
    stations.forEach(({ t, d }) => {
      const base = {};
      COMPONENTS.forEach((axis) => (base[axis] = node_A[axis] + (node_B[axis] - node_A[axis]) * t));
      const { vector, value } = getComponent(d, component);
      const display_value = value * to_display;
      const position = move(base, vector);
      COMPONENTS.forEach((axis) => member_trace[axis].push(position[axis]));
      member_trace.line.color.push(display_value);
      member_trace.text.push(`${localGetCopy("member")} ${member_id}: ${formatValue(display_value)} ${display_unit}`);
      values.push(display_value);
      checkExtreme(position, display_value);
    });
    // The value of the gap is repeated, a null color breaks the color scale
    COMPONENTS.forEach((axis) => member_trace[axis].push(null));
    member_trace.line.color.push(member_trace.line.color[member_trace.line.color.length - 1]);
    member_trace.text.push("");
  });

  const plate_trace = {
    x: [],
    y: [],
    z: [],
    i: [],
    j: [],
    k: [],
    intensity: [],
    type: "mesh3d",
    name: "deformed_plates",
    opacity: 0.95,
    flatshading: true,
    // Matte, so the colors match the color bar
    lighting: { ambient: 0.85, diffuse: 0.3, specular: 0, roughness: 1, fresnel: 0 },
    hovertemplate: `%{intensity:.4g} ${display_unit}<extra>${localGetCopy("plate")}</extra>`,
  };
  const mesh_lines = {
    x: [],
    y: [],
    z: [],
    type: "scatter3d",
    mode: "lines",
    hoverinfo: "none",
    line: { width: 1, color: DEFORMED_MESH_LINES_COLOR },
  };
  const vertex_index = {};
  const drawn_edges = new Set();
  Object.values(quads).forEach((corners) => {
    const vertices = corners.map(({ node_id, d }) => {
      if (vertex_index[node_id] === undefined) {
        const { vector, value } = getComponent(d, component);
        const display_value = value * to_display;
        const position = move(structure.nodes[node_id], vector);
        vertex_index[node_id] = plate_trace.x.length;
        COMPONENTS.forEach((axis) => plate_trace[axis].push(position[axis]));
        plate_trace.intensity.push(display_value);
        values.push(display_value);
        checkExtreme(position, display_value);
      }
      return vertex_index[node_id];
    });
    for (let k = 1; k < vertices.length - 1; k++) {
      plate_trace.i.push(vertices[0]);
      plate_trace.j.push(vertices[k]);
      plate_trace.k.push(vertices[k + 1]);
    }
    vertices.forEach((vertex_a, k) => {
      const vertex_b = vertices[(k + 1) % vertices.length];
      const key = vertex_a < vertex_b ? `${vertex_a}-${vertex_b}` : `${vertex_b}-${vertex_a}`;
      if (drawn_edges.has(key)) return;
      drawn_edges.add(key);
      [vertex_a, vertex_b].forEach((vertex) => COMPONENTS.forEach((axis) => mesh_lines[axis].push(plate_trace[axis][vertex])));
      COMPONENTS.forEach((axis) => mesh_lines[axis].push(null));
    });
  });

  if (values.length === 0) return [];
  let cmin = Math.min(...values);
  let cmax = Math.max(...values);
  let colorscale = DISPLACEMENT_COLORSCALE;
  if (component !== "sum") {
    // Centered on no displacement
    colorscale = SIGNED_COLORSCALE;
    cmax = Math.max(Math.abs(cmin), Math.abs(cmax));
    cmin = -cmax;
  }
  if (cmax - cmin < 1e-12) {
    cmin -= 1;
    cmax += 1;
  }
  // Above the card of the results, at the bottom right
  const colorbar = { title: { text: title, side: "right" }, thickness: 12, len: 0.45, x: 0.98, y: 0.62, yanchor: "middle" };
  const traces = [];
  // Only one trace shows the color bar, both share the range
  if (plate_trace.x.length > 0) {
    Object.assign(plate_trace, { cmin, cmax, colorscale, showscale: true, colorbar });
    traces.push(plate_trace, mesh_lines);
  }
  if (member_trace.x.length > 0) {
    Object.assign(member_trace.line, { cmin, cmax, colorscale, showscale: plate_trace.x.length === 0, colorbar });
    traces.push(member_trace);
  }
  if (extreme) {
    traces.push({
      x: [extreme.position.x],
      y: [extreme.position.y],
      z: [extreme.position.z],
      text: [`${localGetCopy("max_displacement")} ${formatValue(extreme.value)} ${display_unit}`],
      type: "scatter3d",
      mode: "markers+text",
      name: "max_displacement",
      textposition: "top center",
      textfont: { color: "#1A202C", size: 12 },
      marker: { size: 4, color: "#1A202C" },
      hoverinfo: "none",
    });
  }
  // Plotly keeps the colors of a trace that changes from one scale to another, a new uid redraws it
  traces.forEach((trace, i) => (trace.uid = `deformed-${i}-${component}`));
  return traces;
}

const resultsLayer = { tagResults, getDisplacementResults, getDeformedTraces };

export default resultsLayer;
