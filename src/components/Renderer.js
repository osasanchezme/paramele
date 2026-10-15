import Plot from "./Plot";
import renderer from "../js/renderer";
import drawingLayer from "../js/drawingLayer";
import drawing from "../js/drawing";
import modelLinks from "../js/modelLinks";
import sectionsLibrary from "../js/sectionsLibrary";
import getState from "../getState";
import state from "../state";
import DrawingToolbar from "./drawing_toolbar";
import EntityEditor from "./entity_editor";
import SectionsPanel from "./sections_panel";
import drawingDimensions from "./drawing_dimensions";
import { notify } from "./notification";
import AxisIndicator from "./axis_indicator";
import ResultsToolbar from "./results_toolbar";
import VisibilityPanel from "./visibility_panel";
import resultsLayer from "../js/resultsLayer";
import React from "react";
import { createPortal } from "react-dom";

const TOOL_SHORTCUTS = {
  m: "member",
  p: "plate",
  s: "support",
  l: "point_load",
  d: "distributed_load",
  a: "pressure",
  o: "moment",
  e: "delete",
  t: "assign",
};
// Tools that act on a clicked structural node
const NODE_ACTIONS = {
  point_load: (id, drawing_state) => drawing.addPointLoad(id, drawing_state.force),
  moment: (id, drawing_state) => drawing.addMoment(id, drawing_state.moment),
  support: (id, drawing_state) => drawing.addSupport(id, drawing_state.restraint_code),
};
// Loads and supports each tool clicks to edit them (the other targets of the tool are for adding)
const TOOL_EDIT_KINDS = {
  point_load: "point_loads",
  moment: "moments",
  support: "supports",
  distributed_load: "distributed_loads",
  pressure: "pressures",
};
// Moving less than this between pressing and releasing is a click, more is rotating the view
const CLICK_TOLERANCE = 5;
// Parts of the drawing state that Plotly draws. The hover feedback is drawn over the plot instead, replotting on every hover makes rotating slow
const PLOTTED_KEYS = ["tool", "plane", "offset", "spacing", "points", "selected_target", "highlight"];
// Mouse events that would rotate the view while the assign tool paints
const PAINT_BLOCKED_EVENTS = ["mousedown", "mousemove", "mouseup"];
const HOVER_COLORS = { delete: "#E53E3E", default: "#DD6B20" };

/** @returns {import("../js/types").ParamEleDrawingState} */
function getInitialDrawingState() {
  return {
    tool: "none",
    plane: "xy",
    offset: 0,
    spacing: 1,
    points: [],
    hover_point: null,
    hover_target: null,
    selected_target: null,
    highlight: [],
    force: { x: 0, y: 0, z: -10 },
    distributed: { x: 0, y: 0, z: -5 },
    moment: { x: 0, y: 0, z: 10 },
    pressure: { x: 0, y: 0, z: -5 },
    pressure_axes: "global",
    thickness: 200,
    restraint_code: "FFFFFF",
    assign_mode: "section",
    active_section: null,
    active_material: null,
  };
}

function isSamePoint(point_a, point_b) {
  if (!point_a || !point_b) return point_a === point_b;
  return ["x", "y", "z"].every((axis) => Math.abs(point_a[axis] - point_b[axis]) < 1e-6);
}

function isTyping(event) {
  let tag = event.target?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable;
}

/**
 * Hover feedback drawn over the plot: a ring on what is under the cursor and the preview of the next member or plate
 */
function HoverVisual({ visual }) {
  let { ring, preview, is_polygon, color, dimensions } = visual;
  let preview_points = preview && preview.map(({ x, y }) => `${x},${y}`).join(" ");
  return (
    <svg className="drawing-hover">
      {preview &&
        (is_polygon ? (
          <polygon points={preview_points} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={3} strokeDasharray="6 4" />
        ) : (
          <polyline points={preview_points} fill="none" stroke={color} strokeWidth={3} strokeDasharray="6 4" />
        ))}
      <circle cx={ring.x} cy={ring.y} r={8} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={2} />
      {dimensions && <drawingDimensions.DrawingDimensions {...dimensions} color={color} />}
    </svg>
  );
}

class Renderer extends React.Component {
  constructor(props) {
    super(props);
    this.drawing_state = getInitialDrawingState();
    /** @type {import("../js/types").ParamEleResultsView} */
    this.results_view = { result: "displacement_sum", scale: null, diagram_scale: 1, load_case: null };
    this.updateBaseData();
    this.state = {
      data: this.base_data,
      layout: renderer.getLayout(),
      frames: [],
      config: renderer.getConfig(),
      drawing_state: this.drawing_state,
      // What is under the cursor, in pixels of the renderer
      hover_visual: null,
      levels: [],
      can_undo: drawing.canUndo(),
      // Element being edited in place: its box, where it was clicked and its inputs
      editor: null,
      results: this.results,
      results_view: this.results_view,
      // Section or material whose elements are highlighted from the sections panel
      highlighted_item: null,
    };
    this.updateRenderer = this.updateRenderer.bind(this);
    this.handleMainPlotRelayout = this.handleMainPlotRelayout.bind(this);
    this.handleMainPlotRelayouting = this.handleMainPlotRelayouting.bind(this);
    this.updateAxisIndicator = this.updateAxisIndicator.bind(this);
    this.axis_indicator = React.createRef();
    this.setDrawingState = this.setDrawingState.bind(this);
    this.setResultsView = this.setResultsView.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.blockMouseWhilePainting = this.blockMouseWhilePainting.bind(this);
    window.ParamEle.updateRenderer = this.updateRenderer.bind(this);
    window.ParamEle.resetRendererView = this.resetView.bind(this);
  }
  componentDidMount() {
    window.addEventListener("keydown", this.handleKeyDown);
    // Plotly only picks what is closest to the cursor, even lines that do not hover, so the drawing tools pick on their own
    this.plot_element = document.getElementById("renderer-container");
    this.plot_element.addEventListener("pointerdown", this.handlePointerDown, true);
    this.plot_element.addEventListener("pointermove", this.handlePointerMove, true);
    this.plot_element.addEventListener("pointerup", this.handlePointerUp, true);
    this.plot_element.addEventListener("pointerleave", this.handlePointerLeave);
    PAINT_BLOCKED_EVENTS.forEach((type) => this.plot_element.addEventListener(type, this.blockMouseWhilePainting, true));
    this.removeUndoListener = drawing.onUndoChange(() => this.setState({ can_undo: drawing.canUndo() }));
    this.removeHighlightListener = modelLinks.onHighlight((node_ids) => this.highlightBoxes(node_ids));
  }
  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
    this.plot_element.removeEventListener("pointerdown", this.handlePointerDown, true);
    this.plot_element.removeEventListener("pointermove", this.handlePointerMove, true);
    this.plot_element.removeEventListener("pointerup", this.handlePointerUp, true);
    this.plot_element.removeEventListener("pointerleave", this.handlePointerLeave);
    PAINT_BLOCKED_EVENTS.forEach((type) => this.plot_element.removeEventListener(type, this.blockMouseWhilePainting, true));
    this.removeUndoListener();
    this.removeHighlightListener();
  }
  updateRenderer() {
    this.updateBaseData();
    if (this.scene_ranges || this.drawing_state.tool !== "none") this.updateSceneRanges();
    this.refreshEditor();
    this.refreshHighlight();
    this.updatePlotData();
  }
  /**
   * Another model was opened: Plotly fits the view to it again and the element being edited is gone
   */
  resetView() {
    this.scene_ranges = null;
    this.closeEditor();
    this.clearHighlight();
    this.updateSceneRanges();
  }
  /**
   * Highlights the elements of some boxes, picked in the editor or in the explorer. It replaces the element being edited
   * @param {string[]} node_ids
   */
  highlightBoxes(node_ids) {
    this.highlighted_boxes = node_ids;
    if (this.state.highlighted_item) this.setState({ highlighted_item: null });
    if (this.state.editor) this.setState({ editor: null });
    this.setDrawingState({ selected_target: null, highlight: this.getHighlight() });
  }
  /**
   * Highlights the elements of a section or a material, picked in the sections panel
   * @param {{kind: "section"|"material", key: string}|null} item
   */
  highlightItem(item) {
    this.highlighted_boxes = null;
    this.setState({ highlighted_item: item, ...(this.state.editor ? { editor: null } : {}) });
    this.setDrawingState({ selected_target: null, highlight: item ? sectionsLibrary.getItemElements(item) : [] });
  }
  getHighlight() {
    if (this.state.highlighted_item) return sectionsLibrary.getItemElements(this.state.highlighted_item);
    return (this.highlighted_boxes || []).flatMap((node_id) => modelLinks.getBoxElements(node_id));
  }
  /**
   * The highlighted boxes may create other elements after the model changes
   */
  refreshHighlight() {
    if (this.highlighted_boxes || this.state.highlighted_item) this.drawing_state = { ...this.drawing_state, highlight: this.getHighlight() };
  }
  clearHighlight() {
    if (!this.highlighted_boxes && !this.state.highlighted_item) return;
    this.highlighted_boxes = null;
    if (this.state.highlighted_item) this.setState({ highlighted_item: null });
    this.setDrawingState({ highlight: [] });
  }
  /**
   * Opens the card to edit an element in place
   * @param {{kind: string, id: string, x: number, y: number, z: number}} candidate
   * @param {{x: number, y: number}} position Pixels in the renderer
   */
  openEditor(candidate, position) {
    let node_id = drawing.getElementNodeId(candidate.kind, candidate.id);
    // Elements of a group box are only shown with the box they come from
    let entity = node_id ? drawing.getEntity(node_id) : modelLinks.getGroupEntity(candidate.kind, candidate.id);
    if (!entity) {
      notify("warning", "drawing_not_editable", null, true);
      return;
    }
    // Edits must not move the view away from the card, so it is fixed from what is shown now
    let full_scene = this.plot_element._fullLayout?.scene;
    if (!this.scene_ranges && full_scene) {
      this.scene_ranges = { x: [...full_scene.xaxis.range], y: [...full_scene.yaxis.range], z: [...full_scene.zaxis.range] };
      this.updateSceneRanges();
    }
    this.highlighted_boxes = null;
    this.setState({ editor: { node_id: entity.node_id, kind: candidate.kind, position, entity }, highlighted_item: null });
    this.setDrawingState({ selected_target: candidate, highlight: [] });
  }
  closeEditor() {
    if (!this.state.editor) return;
    this.setState({ editor: null });
    this.setDrawingState({ selected_target: null });
  }
  /**
   * The edited element changes with the model (its values, or it is gone)
   */
  refreshEditor() {
    let { editor } = this.state;
    if (!editor) return;
    let entity = editor.entity.group ? modelLinks.getGroupEntity(editor.kind, editor.entity.element_id) : drawing.getEntity(editor.node_id);
    if (!entity) return this.closeEditor();
    // Keeps the highlight and the card on the element if it moved
    let position = editor.position;
    let trace = this.base_data.find(({ name }) => name === editor.kind);
    let index = trace?.customdata?.findIndex((id) => String(id) === String(entity.element_id));
    if (index !== undefined && index >= 0) {
      let selected_target = { kind: editor.kind, id: entity.element_id, x: trace.x[index], y: trace.y[index], z: trace.z[index] };
      this.drawing_state = { ...this.drawing_state, selected_target };
      let screen = drawingLayer.getScreenProjector(this.plot_element)?.(selected_target);
      if (screen) position = screen;
    }
    this.setState({ editor: { ...editor, entity, position } });
  }
  /**
   * Once drawing starts, the axis ranges are fixed (they only grow), otherwise Plotly fits the view again after every new element,
   * and when going back to navigate or editing an element in place. They are released when another model is opened
   */
  updateSceneRanges() {
    this.syncCamera();
    let is_drawing = this.drawing_state.tool !== "none";
    if (is_drawing || this.scene_ranges)
      this.scene_ranges = drawingLayer.getSceneRanges(this.drawing_state, getState("structure"), this.scene_ranges);
    let scene = { ...this.state.layout.scene };
    ["x", "y", "z"].forEach((axis) => {
      let axis_layout = { ...scene[`${axis}axis`] };
      if (this.scene_ranges) {
        axis_layout.range = this.scene_ranges[axis];
        axis_layout.autorange = false;
      } else {
        delete axis_layout.range;
        axis_layout.autorange = true;
      }
      scene[`${axis}axis`] = axis_layout;
    });
    // "data" sizes the scene with the extent of the traces, which changes when the grid comes and goes
    if (this.scene_ranges) {
      let spans = ["x", "y", "z"].map((axis) => this.scene_ranges[axis][1] - this.scene_ranges[axis][0]);
      let max_span = Math.max(...spans);
      scene.aspectmode = "manual";
      scene.aspectratio = { x: spans[0] / max_span, y: spans[1] / max_span, z: spans[2] / max_span };
    } else {
      scene.aspectmode = "data";
      delete scene.aspectratio;
    }
    let hovermode = is_drawing ? false : "closest";
    scene.hovermode = hovermode;
    this.setState({ layout: { ...this.state.layout, hovermode, scene } });
  }
  /**
   * Plotly only saves the camera in the layout when a drag ends on the plot. Saving it before every update keeps the view
   * where the user left it, instead of going back to the last saved camera
   */
  syncCamera() {
    let scene = this.plot_element?._fullLayout?.scene?._scene;
    let layout_scene = this.state.layout.scene;
    if (scene && layout_scene && typeof scene.getCamera === "function") layout_scene.camera = scene.getCamera();
  }
  updateBaseData() {
    let previous_displacements = this.results?.displacements;
    this.results = resultsLayer.getResults(getState("structure"), this.results_view.load_case);
    // Other displacements get their own automatic scale
    let displacements = this.results?.displacements;
    if (previous_displacements && displacements && previous_displacements.max_displacement !== displacements.max_displacement)
      this.results_view = { ...this.results_view, scale: null };
    this.base_data = renderer.getData(this.drawing_state, this.getResultsView());
    this.pick_candidates = null;
    // The element under the cursor may have moved, the next pointer move finds it again
    this.drawing_state = { ...this.drawing_state, hover_target: null };
  }
  /**
   * The chosen result is drawn while the results have it for the structure and no drawing tool is active
   */
  getResultsView() {
    let { result, scale, diagram_scale } = this.results_view;
    if (!this.results || result === "none" || this.drawing_state.tool !== "none") return null;
    let { displacements, forces } = this.results;
    if (result.startsWith("displacement_")) return displacements ? { results: this.results, result, scale: scale ?? displacements.auto_scale } : null;
    return forces && forces.results.includes(result) ? { results: this.results, result, scale: diagram_scale } : null;
  }
  /**
   * @param {Partial<import("../js/types").ParamEleResultsView>} update
   */
  setResultsView(update) {
    this.results_view = { ...this.results_view, ...update };
    this.updateBaseData();
    this.updatePlotData();
  }
  /**
   * Plotly is only updated when the structure or what the drawing tools draw changes, not on hover
   */
  updatePlotData() {
    this.syncCamera();
    let structure = getState("structure");
    this.length_unit = structure.settings?.units?.length || "";
    let overlay = drawingLayer.getOverlayTraces(this.drawing_state, structure);
    this.setState({
      data: [...this.base_data, ...overlay],
      drawing_state: this.drawing_state,
      levels: this.getLevels(structure),
      results: this.results,
      results_view: this.results_view,
    });
  }
  /**
   * @param {Partial<import("../js/types").ParamEleDrawingState>} update
   */
  setDrawingState(update) {
    let previous = this.drawing_state;
    let next = { ...previous, ...update };
    // Changing tool or plane drops the element being drawn
    if (update.tool !== undefined && update.tool !== previous.tool) {
      Object.assign(next, { points: [], hover_point: null, hover_target: null, selected_target: null });
      if (this.state.editor) this.setState({ editor: null });
    }
    if (update.plane !== undefined && update.plane !== previous.plane) next.offset = 0;
    // The assign tool always paints something: the first section or material when none was picked
    if (next.tool === "assign") {
      let library = {
        section: () => sectionsLibrary.getSections().find(({ editable }) => editable),
        material: () => sectionsLibrary.getMaterials()[0],
      };
      ["section", "material"].forEach((mode) => {
        let active_key = `active_${mode}`;
        if (!next[active_key]) next[active_key] = library[mode]()?.node_id || "default";
      });
    }
    this.drawing_state = next;
    if (next.tool !== previous.tool) {
      this.updateBaseData();
      if (next.tool !== "none") document.activeElement?.blur?.();
    }
    // The snap line normal to the work plane goes through the last picked point
    if (next.points !== previous.points) this.pick_candidates = null;
    if (next.assign_mode !== previous.assign_mode) this.pick_candidates = null;
    if (["tool", "plane", "offset", "spacing"].some((key) => next[key] !== previous[key])) {
      this.pick_candidates = null;
      // Plotly hover labels would compete with the drawing highlight, and the view is fixed while drawing
      this.updateSceneRanges();
    }
    if (PLOTTED_KEYS.some((key) => next[key] !== previous[key])) this.updatePlotData();
    else this.setState({ drawing_state: next });
    if (next.hover_point !== previous.hover_point || next.hover_target !== previous.hover_target || next.points !== previous.points)
      this.updateHoverVisual();
  }
  /**
   * Highlight of what is under the cursor and preview of the next element, projected to pixels of the renderer
   */
  updateHoverVisual() {
    let { tool, points, hover_point, hover_target } = this.drawing_state;
    let hovered = hover_point || hover_target;
    let project = hovered && drawingLayer.getScreenProjector(this.plot_element);
    if (!project) return this.state.hover_visual && this.setState({ hover_visual: null });
    let ring = project(hovered);
    let preview = null;
    let dimensions = null;
    if (hover_point && points.length > 0) {
      // The next member, or the plate with the hovered corner
      let preview_points = tool === "plate" ? [...points, hover_point] : [points[points.length - 1], hover_point];
      preview = preview_points.map(project);
      if (preview.some((point) => !point)) preview = null;
      else dimensions = drawingDimensions.getDrawingDimensions({ tool, points, hover_point, project, unit: this.length_unit });
    }
    let color = HOVER_COLORS[tool] || HOVER_COLORS.default;
    if (tool === "assign") color = this.getAssignColor();
    this.setState({ hover_visual: ring && { ring, preview, is_polygon: tool === "plate" && points.length >= 2, color, dimensions } });
  }
  /**
   * Color of the section the assign tool paints, so the cursor shows what a click gives the member
   */
  getAssignColor() {
    let { assign_mode, active_section } = this.drawing_state;
    if (assign_mode !== "section") return HOVER_COLORS.default;
    let section = sectionsLibrary.getSections().find(({ node_id }) => node_id === active_section);
    return section?.color || sectionsLibrary.DEFAULT_SECTION_COLOR;
  }
  /**
   * Point of the drawing for a picked grid point or structural node
   * @returns {import("../js/types").ParamEleDrawingPoint|null}
   */
  getDrawingPoint(candidate) {
    if (!candidate) return null;
    if (drawingLayer.isSnapKind(candidate.kind)) return { x: candidate.x, y: candidate.y, z: candidate.z };
    if (candidate.kind === "nodes") return { x: candidate.x, y: candidate.y, z: candidate.z, structural_id: candidate.id };
    return null;
  }
  /**
   * Element of the active tool under the cursor
   * @param {PointerEvent} event
   */
  pick(event) {
    let project = drawingLayer.getScreenProjector(this.plot_element);
    if (!project) return null;
    if (!this.pick_candidates) {
      // The snap points are part of the overlay, which is computed on every update
      let grid_traces = drawingLayer.getOverlayTraces({ ...this.drawing_state, hover_point: null, hover_target: null }, getState("structure"));
      let { tool, assign_mode } = this.drawing_state;
      this.pick_candidates = drawingLayer.getPickCandidates([...this.base_data, ...grid_traces], tool, assign_mode);
    }
    return drawingLayer.pickCandidate(this.pick_candidates, project, this.getPlotPosition(event));
  }
  getPlotPosition(event) {
    let rect = this.plot_element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  isInteractive() {
    return !this.props.model_locked;
  }
  handlePointerDown(event) {
    // The browser may leave out the mouse release of the last painting
    this.is_mouse_blocked = false;
    this.pointer_down = event.button === 0 && this.isInteractive() ? { x: event.clientX, y: event.clientY } : null;
    // Pressing on an element with the assign tool paints every element the pointer goes over, instead of rotating the view
    if (this.pointer_down && this.drawing_state.tool === "assign") {
      let candidate = this.pick(event);
      if (candidate) {
        event.preventDefault();
        event.stopPropagation();
        this.painting = { kind: candidate.kind, ids: [candidate.id] };
        this.is_mouse_blocked = true;
        this.setDrawingState({ highlight: [{ structure_key: candidate.kind, element_id: candidate.id }] });
        return;
      }
    }
    // Dragging rotates the view, which leaves the hover feedback behind
    if (this.state.hover_visual) this.setState({ hover_visual: null });
  }
  handlePointerMove(event) {
    if (this.painting) return this.paintMove(event);
    if (!this.isInteractive() || event.buttons !== 0) return;
    let candidate = this.pick(event);
    if (drawingLayer.isPointTool(this.drawing_state.tool)) {
      let hover_point = this.getDrawingPoint(candidate);
      if (!isSamePoint(hover_point, this.drawing_state.hover_point)) this.setDrawingState({ hover_point });
    } else {
      let current = this.drawing_state.hover_target;
      let is_same = candidate && current ? candidate.kind === current.kind && candidate.id === current.id : candidate === current;
      if (!is_same) this.setDrawingState({ hover_target: candidate });
    }
  }
  handlePointerLeave() {
    if (this.drawing_state.hover_point || this.drawing_state.hover_target) this.setDrawingState({ hover_point: null, hover_target: null });
  }
  handlePointerUp(event) {
    let down = this.pointer_down;
    this.pointer_down = null;
    if (this.painting) return this.finishPainting();
    if (!down || !this.isInteractive() || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE) return;
    let candidate = this.pick(event);
    if (candidate) this.handlePick(candidate, this.getPlotPosition(event));
    else if (this.drawing_state.tool === "none") {
      this.closeEditor();
      this.clearHighlight();
    }
  }
  /**
   * The camera of Plotly rotates with the mouse events (it reads the pressed buttons on every move), they do not reach it while painting
   * @param {MouseEvent} event
   */
  blockMouseWhilePainting(event) {
    if (!this.is_mouse_blocked) return;
    event.stopPropagation();
    event.preventDefault();
    // The release that ends the painting is the last one
    if (event.type === "mouseup") this.is_mouse_blocked = false;
  }
  paintMove(event) {
    let candidate = this.pick(event);
    if (candidate && candidate.kind === this.painting.kind && !this.painting.ids.includes(candidate.id)) {
      this.painting.ids.push(candidate.id);
      this.setDrawingState({ highlight: this.painting.ids.map((element_id) => ({ structure_key: candidate.kind, element_id })) });
    }
    if (candidate !== this.drawing_state.hover_target) this.setDrawingState({ hover_target: candidate });
  }
  /**
   * Gives the painted elements the section or material of the assign tool, in one undo step
   */
  finishPainting() {
    let { kind, ids } = this.painting;
    this.painting = null;
    let { assign_mode, active_section, active_material } = this.drawing_state;
    let active = assign_mode === "section" ? active_section : active_material;
    this.setDrawingState({ highlight: this.getHighlight() });
    sectionsLibrary.assignToElements(kind, ids, active === "default" ? null : active);
  }
  /**
   * Acts on the element clicked with the active tool
   * @param {{kind: string, id: string, x: number, y: number, z: number}} candidate
   * @param {{x: number, y: number}} position Pixels of the click in the renderer
   */
  handlePick(candidate, position) {
    let { tool, points } = this.drawing_state;
    let drawing_state = this.drawing_state;
    if (tool === "none" || TOOL_EDIT_KINDS[tool] === candidate.kind) return this.openEditor(candidate, position);
    switch (tool) {
      case "member": {
        let point = this.getDrawingPoint(candidate);
        let last_point = points[points.length - 1];
        // Clicking the last point again ends the chain of members
        if (isSamePoint(point, last_point)) return this.setDrawingState({ points: [] });
        if (!last_point) return this.setDrawingState({ points: [point], ...this.getFollowedPlane(candidate) });
        let end_node_id = drawing.addMember(last_point, point, drawing_state.active_section);
        this.setDrawingState({ points: end_node_id ? [{ ...point, node_id: end_node_id }] : [], ...this.getFollowedPlane(candidate) });
        break;
      }
      case "plate": {
        let point = this.getDrawingPoint(candidate);
        if (points.length >= 3 && isSamePoint(point, points[0])) return this.finishPlate();
        if (points.some((picked) => isSamePoint(picked, point))) return;
        this.setDrawingState({ points: [...points, point], ...this.getFollowedPlane(candidate) });
        break;
      }
      case "distributed_load":
        drawing.addDistributedLoad(candidate.id, drawing_state.distributed);
        break;
      case "pressure":
        drawing.addPressure(candidate.id, drawing_state.pressure, drawing_state.pressure_axes);
        break;
      case "assign": {
        let active = drawing_state.assign_mode === "section" ? drawing_state.active_section : drawing_state.active_material;
        sectionsLibrary.assignToElements(candidate.kind, [candidate.id], active === "default" ? null : active);
        break;
      }
      case "delete":
        drawing.deleteElement(candidate.kind, candidate.id);
        this.setDrawingState({ hover_target: null });
        break;
      default:
        NODE_ACTIONS[tool](candidate.id, drawing_state);
        break;
    }
  }
  /**
   * Leaving the work plane along its snap line, or clicking a node at another level, takes the plane along, so drawing
   * goes on at that level
   * @returns {Partial<import("../js/types").ParamEleDrawingState>}
   */
  getFollowedPlane(candidate) {
    if (candidate.kind !== "normal_line" && candidate.kind !== "nodes") return {};
    let { normal } = drawingLayer.getPlaneAxes(this.drawing_state.plane);
    // Rounded like the levels of the toolbar, so it matches the coordinates of the structure
    let offset = Number(Number(candidate[normal]).toPrecision(10));
    if (!Number.isFinite(offset) || Math.abs(offset - this.drawing_state.offset) < 1e-9) return {};
    return { offset };
  }
  finishPlate() {
    let { points, thickness } = this.drawing_state;
    if (points.length >= 3) drawing.addPlate(points, thickness);
    this.setDrawingState({ points: [] });
  }
  isShown() {
    return this.props.visible || this.props.settings.side_by_side;
  }
  handleKeyDown(event) {
    // Side by side, the shortcuts are only for the renderer while the pointer is over it
    let is_target = this.props.settings.side_by_side ? this.is_pointer_over : this.isShown();
    if (!is_target || isTyping(event) || this.props.model_locked) return;
    let { tool, points } = this.drawing_state;
    let key = event.key.toLowerCase();
    if (key === "escape" && this.state.editor) return this.closeEditor();
    if (key === "escape" && (this.highlighted_boxes || this.state.highlighted_item)) return this.clearHighlight();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      if (!drawing.canUndo()) return;
      event.preventDefault();
      this.setDrawingState({ points: [] });
      drawing.undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "escape") {
      if (points.length > 0) this.setDrawingState({ points: [] });
      else if (tool !== "none") this.setDrawingState({ tool: "none" });
    } else if (key === "enter") {
      if (tool === "plate") this.finishPlate();
      else if (tool === "member") this.setDrawingState({ points: [] });
    } else if (TOOL_SHORTCUTS[key]) {
      this.setDrawingState({ tool: TOOL_SHORTCUTS[key] });
    }
  }
  /**
   * Coordinates of the structure along the axis normal to the work plane, to jump between levels
   */
  getLevels(structure) {
    let { normal } = drawingLayer.getPlaneAxes(this.drawing_state.plane);
    // The nodes made by the mesher are not levels of the model
    let structure_mesh = state.getGlobalVariable("structure_mesh");
    let mesh_node_ids = new Set(structure_mesh ? structure_mesh.node_ids.map(String) : []);
    let values = Object.entries(structure.nodes)
      .filter(([node_id]) => !mesh_node_ids.has(node_id))
      .map(([, node]) => Number(Number(node[normal]).toPrecision(10)));
    return [...new Set(values)].sort((a, b) => a - b);
  }
  handleMainPlotRelayout(eventData) {
    this.updateAxisIndicator(eventData["scene.camera"]);
    if (!eventData["scene.camera"]) return;
    // The camera moved: the hover feedback is stale and the card goes back next to its element
    let editor = this.state.editor;
    let selected_target = this.drawing_state.selected_target;
    let editor_position = editor && selected_target && drawingLayer.getScreenProjector(this.plot_element)?.(selected_target);
    this.setState({ hover_visual: null, ...(editor_position ? { editor: { ...editor, position: editor_position } } : {}) });
  }
  /**
   * Plotly reports the camera on every move of a drag, so the axis indicator follows it while rotating
   */
  handleMainPlotRelayouting(eventData) {
    this.updateAxisIndicator(eventData["scene.camera"]);
  }
  /**
   * @param {object} [camera] Scene camera, read from the renderer when not given
   */
  updateAxisIndicator(camera) {
    let scene = this.plot_element?._fullLayout?.scene?._scene;
    if (!camera?.eye && scene && typeof scene.getCamera === "function") camera = scene.getCamera();
    if (camera) this.axis_indicator.current?.setCamera(camera);
  }
  componentDidUpdate(prevProps) {
    if (prevProps.settings.side_by_side !== this.props.settings.side_by_side || prevProps.width !== this.props.width) {
      this.updateRenderer();
    }
  }
  render() {
    let { tool, hover_target } = this.state.drawing_state;
    let drawing_class = tool === "none" ? "" : " drawing";
    // Elements that open the editor show a pointer
    if (hover_target && (tool === "none" || tool === "assign" || TOOL_EDIT_KINDS[tool] === hover_target.kind)) drawing_class += " pointing";
    let global_style = { zIndex: this.props.visible ? 4 : 2, width: String(this.props.width) + "%", right: this.props.layout.renderer_right + "%" };

    return (
      <div
        className={`renderer-container${drawing_class}`}
        style={global_style}
        onMouseEnter={() => (this.is_pointer_over = true)}
        onMouseLeave={() => (this.is_pointer_over = false)}
      >
        <Plot
          data={this.state.data}
          layout={this.state.layout}
          frames={this.state.frames}
          config={this.state.config}
          onRelayout={this.handleMainPlotRelayout}
          onRelayouting={this.handleMainPlotRelayouting}
          onAfterPlot={this.updateAxisIndicator}
          divId={"renderer-container"}
        />
        {this.isShown() && (
          <DrawingToolbar
            drawing_state={this.state.drawing_state}
            setDrawingState={this.setDrawingState}
            levels={this.state.levels}
            can_undo={this.state.can_undo}
            undo={() => {
              this.setDrawingState({ points: [] });
              drawing.undo();
            }}
            model_locked={this.props.model_locked}
          />
        )}
        {this.state.hover_visual && <HoverVisual visual={this.state.hover_visual} />}
        {this.state.editor && (
          <EntityEditor
            entity={this.state.editor.entity}
            position={this.state.editor.position}
            container_size={{ width: this.plot_element?.clientWidth || 0, height: this.plot_element?.clientHeight || 0 }}
            model_locked={this.props.model_locked}
            onChange={(field_key, value) => drawing.updateEntityField(this.state.editor.node_id, field_key, value)}
            onDetach={(field_key) => drawing.detachEntityField(this.state.editor.node_id, field_key)}
            onLinkChange={(link_key, value) => drawing.updateEntityLink(this.state.editor.node_id, link_key, value)}
            onCreateLink={(kind, spec) =>
              kind === "section"
                ? sectionsLibrary.createSection(spec, [this.state.editor.node_id])
                : sectionsLibrary.createMaterial(spec, [this.state.editor.node_id])
            }
            onShowBox={modelLinks.focusBox}
            onClose={() => this.closeEditor()}
          />
        )}
        {this.isShown() &&
          this.props.panel_dock &&
          createPortal(
            <SectionsPanel
              model_locked={this.props.model_locked}
              drawing_state={this.state.drawing_state}
              setDrawingState={this.setDrawingState}
              highlighted={this.state.highlighted_item}
              onHighlight={(item) => this.highlightItem(item)}
            />,
            this.props.panel_dock
          )}
        {this.isShown() &&
          this.props.panel_dock &&
          createPortal(<VisibilityPanel is_showing_result={Boolean(this.getResultsView())} />, this.props.panel_dock)}
        {this.isShown() &&
          this.props.panel_dock &&
          this.state.results &&
          tool === "none" &&
          createPortal(
            <ResultsToolbar results={this.state.results} view={this.state.results_view} onChange={this.setResultsView} />,
            this.props.panel_dock
          )}
        <AxisIndicator ref={this.axis_indicator} />
      </div>
    );
  }
}

export default Renderer;
