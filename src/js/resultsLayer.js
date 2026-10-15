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
// Force diagrams: where each result is in member_forces, the local axis it is drawn along and the sign it is drawn with.
// Moments are drawn on the tension side: a positive Mz (sagging) has its tension on -y, a positive My on -z
const FORCE_RESULTS = {
  moment_x: { key: "torsion", axis: "y", sign: 1, kind: "moment" },
  moment_y: { key: "bending_moment_y", axis: "z", sign: -1, kind: "moment" },
  moment_z: { key: "bending_moment_z", axis: "y", sign: -1, kind: "moment" },
  shear_y: { key: "shear_force_y", axis: "y", sign: 1, kind: "force" },
  shear_z: { key: "shear_force_z", axis: "z", sign: 1, kind: "force" },
  axial: { key: "axial_force", axis: "y", sign: 1, kind: "force" },
};
// The largest value of a diagram drawn with the automatic scale, as a fraction of the median length of the members
const DIAGRAM_SCALE_TARGET = 0.25;
const DIAGRAM_OUTLINE_COLOR = "rgba(26, 32, 44, 0.75)";
// Up to this many members with a diagram, the values at the ends of each one and its largest and smallest values are labeled; above it,
// only the largest and smallest of all of them
const MAX_LABELED_MEMBERS = 16;

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
  // Its forces are in the force units of the model, and so its moments in force by length units
  const moment_unit = solver_engine === "skyciv" ? units.moment : `${units.force}-${units.length}`;
  Object.values(results || {}).forEach((lc_results) => {
    if (!lc_results || typeof lc_results !== "object") return;
    if (!lc_results.displacement_unit) lc_results.displacement_unit = displacement_unit;
    if (!lc_results.force_unit) lc_results.force_unit = units.force;
    if (!lc_results.moment_unit) lc_results.moment_unit = moment_unit;
  });
}

/**
 * Values of several results along a member, at the positions of the first one
 * @param {(Object<string, number>|undefined)[]} by_result Values of each result by position along the member, in % of its length
 * @returns {{t: number, values: number[]}[]|null} By position (t from 0 at node A to 1), null when a result is missing
 */
function getMemberStations(by_result) {
  if (by_result.some((values) => !values || typeof values !== "object")) return null;
  const stations = Object.keys(by_result[0])
    .map((key) => ({ key, t: Number(key) }))
    .filter(({ t }) => Number.isFinite(t))
    .sort((a, b) => a.t - b.t);
  if (stations.length < 2) return null;
  return stations.map(({ key, t }) => ({ t: t / 100, values: by_result.map((values) => Number(values[key]) || 0) }));
}

/**
 * Members and plates of the structure that have displacements in the results
 * @param {object} structure
 * @param {object} lc_results
 */
function getDisplacedElements(structure, lc_results) {
  const members = {};
  const member_displacements = lc_results.member_displacements || {};
  Object.keys(structure.members || {}).forEach((member_id) => {
    const stations = getMemberStations(COMPONENTS.map((axis) => (member_displacements[`displacement_${axis}`] || {})[member_id]));
    if (!stations) return;
    members[member_id] = stations.map(({ t, values }) => {
      const d = {};
      COMPONENTS.forEach((axis, i) => (d[axis] = values[i]));
      return { t, d };
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
 * Results that belong to the current structure, or null when there are none
 * @param {object} structure
 * @param {string} [load_case] Key of the load case in the results, the first one by default
 * @returns {import("./types").ParamEleResults|null}
 */
function getResults(structure, load_case) {
  const results = getState("results");
  if (!results || typeof results !== "object") return null;
  // The results are only drawn on the geometry they were solved with
  const solved_geometry = state.getGlobalVariable("results_geometry");
  if (solved_geometry && solved_geometry !== getGeometrySignature(structure)) return null;
  const load_cases = Object.entries(results)
    .filter(([, lc_results]) => lc_results && (lc_results.member_displacements || lc_results.plate_displacements || lc_results.member_forces))
    .map(([key, lc_results]) => ({ key, name: lc_results.name !== undefined ? String(lc_results.name) : key }));
  if (load_cases.length === 0) return null;
  const key = load_cases.some((lc) => lc.key === load_case) ? load_case : load_cases[0].key;
  const lc_results = results[key];
  const displacements = getDisplacementResults(structure, lc_results);
  const forces = getForceResults(structure, lc_results);
  if (!displacements && !forces) return null;
  return { load_cases, load_case: key, displacements, forces };
}

/**
 * Displacements of a load case on the structure, or null when there are none
 * @param {object} structure
 * @param {object} lc_results
 * @returns {import("./types").ParamEleDisplacementResults|null}
 */
function getDisplacementResults(structure, lc_results) {
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
 * Internal forces of a load case along the members of the structure, or null when there are none
 * @param {object} structure
 * @param {object} lc_results
 * @returns {import("./types").ParamEleForceResults|null}
 */
function getForceResults(structure, lc_results) {
  const member_forces = lc_results.member_forces;
  if (!member_forces || typeof member_forces !== "object") return null;
  const result_names = Object.keys(FORCE_RESULTS).filter((name) => member_forces[FORCE_RESULTS[name].key]);
  if (result_names.length === 0) return null;
  const members = {};
  Object.keys(structure.members || {}).forEach((member_id) => {
    const stations = getMemberStations(result_names.map((name) => member_forces[FORCE_RESULTS[name].key][member_id]));
    if (!stations) return;
    members[member_id] = stations.map(({ t, values }) => {
      const f = {};
      result_names.forEach((name, i) => (f[name] = values[i]));
      return { t, f };
    });
  });
  if (Object.keys(members).length === 0) return null;
  const extremes = {};
  result_names.forEach((name) => {
    const values = Object.values(members).flatMap((stations) => stations.map(({ f }) => f[name]));
    extremes[name] = { min: Math.min(0, ...values), max: Math.max(0, ...values) };
  });
  const { units } = structure.settings;
  const unit_by_kind = {
    force: formatUnit(lc_results.force_unit || units.force),
    moment: formatUnit(lc_results.moment_unit || units.moment || `${units.force}-${units.length}`),
  };
  const result_units = {};
  result_names.forEach((name) => (result_units[name] = unit_by_kind[FORCE_RESULTS[name].kind]));
  // The largest value of each diagram drawn at a fraction of the usual length of the members
  const lengths = Object.keys(members)
    .map((member_id) => getMemberLength(structure, member_id))
    .sort((a, b) => a - b);
  const target = DIAGRAM_SCALE_TARGET * (lengths[Math.floor(lengths.length / 2)] || 1);
  const auto_scale = {};
  result_names.forEach((name) => {
    const largest = Math.max(Math.abs(extremes[name].min), Math.abs(extremes[name].max));
    auto_scale[name] = largest > 0 ? target / largest : 1;
  });
  return { members, results: result_names, units: result_units, extremes, auto_scale };
}

/**
 * Units as they are written in the results (kn-m) to show them (kN·m)
 * @param {string} unit
 */
function formatUnit(unit) {
  return String(unit || "")
    .split("-")
    .map((atom) => ({ kn: "kN", n: "N", kip: "kip", lb: "lb" }[atom] || atom))
    .join("·");
}

function getMemberLength(structure, member_id) {
  const { node_A, node_B } = structure.members[member_id];
  const a = structure.nodes[node_A];
  const b = structure.nodes[node_B];
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Local axes of a member as the results use them. They are PyNite's (local y horizontal for members that are not along Y, and
 * local z on top of the member) with y and z swapped, as model_solver.py returns its results: y = PyNite z, z = -PyNite y
 * @param {{x: number, y: number, z: number}} a Node A
 * @param {{x: number, y: number, z: number}} b Node B
 * @returns {{x: number[], y: number[], z: number[]}} Unit vectors
 */
function getMemberAxes(a, b) {
  // As Python's math.isclose, the one PyNite uses
  const isClose = (u, v) => Math.abs(u - v) <= 1e-9 * Math.max(Math.abs(u), Math.abs(v));
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const unit = (u) => {
    const length = Math.hypot(...u);
    return u.map((value) => value / length);
  };
  const x = unit([b.x - a.x, b.y - a.y, b.z - a.z]);
  let y;
  let z;
  if (isClose(a.x, b.x) && isClose(a.z, b.z)) {
    // Along global Y
    y = b.y > a.y ? [-1, 0, 0] : [1, 0, 0];
    z = [0, 0, 1];
  } else if (isClose(a.y, b.y)) {
    y = [0, 1, 0];
    z = unit(cross(x, y));
  } else {
    const projection = [b.x - a.x, 0, b.z - a.z];
    z = unit(b.y > a.y ? cross(projection, x) : cross(x, projection));
    y = unit(cross(z, x));
  }
  return { x, y: z, z: y.map((value) => -value) };
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
  const title = `${localGetCopy(`result_displacement_${component}`)} (${display_unit})`;
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
      text: [`${localGetCopy("max")} ${formatValue(extreme.value)} ${display_unit}`],
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

/**
 * Diagram of an internal force along the members, drawn across them along the local axis of the result
 * @param {object} structure
 * @param {import("./types").ParamEleForceResults} force_results
 * @param {{result: string, scale: number}} view Scale relative to the automatic one
 * @returns {object[]} Plotly traces
 */
function getDiagramTraces(structure, force_results, view) {
  const { result, scale } = view;
  const { axis, sign } = FORCE_RESULTS[result];
  const unit = force_results.units[result];
  const length_unit = structure.settings.units.length;
  const factor = sign * force_results.auto_scale[result] * scale;
  const { min, max } = force_results.extremes[result];
  const largest = Math.max(Math.abs(min), Math.abs(max));
  // Values below this are zero: the noise of the solver would draw a diagram of a member without forces
  const tolerance = largest * 1e-6;

  const fill = {
    x: [],
    y: [],
    z: [],
    i: [],
    j: [],
    k: [],
    intensity: [],
    text: [],
    type: "mesh3d",
    name: "force_diagram",
    opacity: 0.7,
    flatshading: true,
    lighting: { ambient: 0.85, diffuse: 0.3, specular: 0, roughness: 1, fresnel: 0 },
    hovertemplate: "%{text}<extra></extra>",
  };
  const outline = {
    x: [],
    y: [],
    z: [],
    type: "scatter3d",
    mode: "lines",
    name: "force_diagram_outline",
    hoverinfo: "none",
    line: { width: 2, color: DIAGRAM_OUTLINE_COLOR },
  };
  // Values of each member and of all of them, labeled
  const member_extremes = [];
  let drawn_members = 0;
  const extremes = { max: null, min: null };
  Object.entries(force_results.members).forEach(([member_id, stations]) => {
    const node_A = structure.nodes[structure.members[member_id].node_A];
    const node_B = structure.nodes[structure.members[member_id].node_B];
    const direction = getMemberAxes(node_A, node_B)[axis];
    const member_length = getMemberLength(structure, member_id);
    const values = stations.map(({ f }) => (Math.abs(f[result]) > tolerance ? f[result] : 0));
    if (values.every((value) => value === 0)) return;
    // Where the diagram crosses the member, so the area of each sign is drawn on its side
    const points = [];
    stations.forEach(({ t }, s) => {
      if (s > 0 && values[s - 1] * values[s] < 0) {
        const t_zero = stations[s - 1].t + ((stations[s].t - stations[s - 1].t) * values[s - 1]) / (values[s - 1] - values[s]);
        points.push({ t: t_zero, value: 0 });
      }
      points.push({ t, value: values[s] });
    });
    const getText = (t, value) =>
      `${localGetCopy("member")} ${member_id} · x = ${Number((t * member_length).toFixed(2))} ${length_unit}<br>${localGetCopy(
        `result_${result}`
      )}: ${formatValue(value)} ${unit}`;
    drawn_members++;
    const first_vertex = fill.x.length;
    const own = { max: null, min: null };
    const ends = [];
    const tips = points.map(({ t, value }, s) => {
      const base = COMPONENTS.map((coordinate) => node_A[coordinate] + (node_B[coordinate] - node_A[coordinate]) * t);
      const tip = base.map((coordinate, i) => coordinate + direction[i] * value * factor);
      [base, tip].forEach((point) => {
        COMPONENTS.forEach((coordinate, i) => fill[coordinate].push(point[i]));
        fill.intensity.push(value);
        fill.text.push(getText(t, value));
      });
      [own, extremes].forEach((found) => {
        if (value > 0 && (!found.max || value > found.max.value)) found.max = { position: tip, value };
        if (value < 0 && (!found.min || value < found.min.value)) found.min = { position: tip, value };
      });
      if (s === 0 || s === points.length - 1) ends.push({ position: tip, value });
      return tip;
    });
    for (let s = 0; s < points.length - 1; s++) {
      const [base, tip, next_base, next_tip] = [0, 1, 2, 3].map((offset) => first_vertex + 2 * s + offset);
      fill.i.push(base, base);
      fill.j.push(tip, next_tip);
      fill.k.push(next_tip, next_base);
    }
    // Closed at the ends of the member
    const start = [node_A.x, node_A.y, node_A.z];
    const end = [node_B.x, node_B.y, node_B.z];
    [start, ...tips, end].forEach((point) => COMPONENTS.forEach((coordinate, i) => outline[coordinate].push(point[i])));
    COMPONENTS.forEach((coordinate) => outline[coordinate].push(null));

    // A value much smaller than the largest one of the member is not worth a label
    const own_largest = Math.max(own.max?.value || 0, -(own.min?.value || 0));
    const own_values = points.map(({ value }) => value);
    if (Math.max(...own_values) - Math.min(...own_values) <= 0.01 * own_largest) {
      // A constant value, labeled once in the middle
      member_extremes.push({ position: tips[Math.floor(tips.length / 2)], value: points[Math.floor(points.length / 2)].value });
      return;
    }
    const labeled = [...ends, ...Object.values(own)].filter((extreme) => extreme && Math.abs(extreme.value) >= 0.05 * own_largest);
    // The largest value is often at an end
    member_extremes.push(...labeled.filter((extreme, k) => labeled.findIndex(({ position }) => position === extreme.position) === k));
  });

  if (fill.x.length === 0) return [];
  const cmax = largest || 1;
  const title = `${localGetCopy(`result_${result}`)} (${unit})`;
  Object.assign(fill, {
    cmin: -cmax,
    cmax,
    colorscale: SIGNED_COLORSCALE,
    showscale: true,
    colorbar: { title: { text: title, side: "right" }, thickness: 12, len: 0.45, x: 0.98, y: 0.62, yanchor: "middle" },
  });
  const traces = [fill, outline];
  const by_member = drawn_members <= MAX_LABELED_MEMBERS;
  const labels = by_member
    ? member_extremes.map(({ position, value }) => ({ position, text: `${formatValue(value)}` }))
    : Object.entries(extremes)
        .filter(([, extreme]) => extreme)
        .map(([kind, { position, value }]) => ({ position, text: `${localGetCopy(kind)} ${formatValue(value)} ${unit}` }));
  if (labels.length > 0) {
    traces.push({
      x: labels.map(({ position }) => position[0]),
      y: labels.map(({ position }) => position[1]),
      z: labels.map(({ position }) => position[2]),
      text: labels.map(({ text }) => text),
      type: "scatter3d",
      mode: "markers+text",
      name: "force_extremes",
      textposition: "top center",
      textfont: { color: "#1A202C", size: by_member ? 11 : 12 },
      marker: { size: 3, color: "#1A202C" },
      hoverinfo: "none",
    });
  }
  traces.forEach((trace, i) => (trace.uid = `diagram-${i}-${result}`));
  return traces;
}

/**
 * What the 3D view draws for the chosen result: the deformed shape or a force diagram
 * @param {object} structure
 * @param {{results: import("./types").ParamEleResults, result: string, scale: number}} view
 */
function getResultTraces(structure, view) {
  const { results, result, scale } = view;
  if (result.startsWith("displacement_"))
    return getDeformedTraces(structure, results.displacements, { component: result.replace("displacement_", ""), scale });
  return getDiagramTraces(structure, results.forces, { result, scale });
}

const resultsLayer = { FORCE_RESULTS, tagResults, getResults, getResultTraces, getMemberAxes };

export default resultsLayer;
