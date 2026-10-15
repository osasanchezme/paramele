import getState from "../getState";
import state from "../state";
import utils from "../utils";
import drawing from "./drawing";
import modelLinks from "./modelLinks";
import { notify } from "../components/notification";

// Sections and materials as the renderer shows them: each section or material box is one entry, even when the model has ranges
// and the box makes several sections. Assigning them only changes the links of the boxes, as the drawing tools do

// Distinct colors that read well as lines on the light background of the renderer
const PALETTE = ["#2B6CB0", "#DD6B20", "#2F855A", "#C53030", "#6B46C1", "#B7791F", "#00A3C4", "#B83280", "#4A5568", "#38A169", "#9C4221", "#5A67D8"];
// Members whose section is not made by any box (the solver gets a default one)
const DEFAULT_SECTION_COLOR = "#A0AEC0";
const SHAPE_TYPES = { rectangle: "structuralRectangleSection", circle: "structuralCircularSection" };
// Values of the new sections and materials, in the units of the model (mm for sections, MPa and kg/m³ for materials)
const SHAPE_DEFAULTS = { rectangle: { base: 300, height: 500 }, circle: { diameter: 400 } };
const SHAPE_PARAMETERS = { base: "b", height: "h", diameter: "D" };
const MATERIAL_PRESETS = {
  concrete: { elasticity_modulus: 24870, poissons_ratio: 0.2, density: 2400 },
  steel: { elasticity_modulus: 200000, poissons_ratio: 0.3, density: 7850 },
};
const MATERIAL_HANDLES = {
  elasticity_modulus: "elasticity_modulus-value-20000",
  poissons_ratio: "poissons_ratio-value-0.3",
  density: "density-value",
};
const MATERIAL_PARAMETERS = { elasticity_modulus: "E", poissons_ratio: "ν", density: "ρ" };

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("sections", copy_key);
}

/**
 * Boxes and links of the main model, where the structure in the renderer comes from
 * @returns {{nodes: object[], edges: object[]}}
 */
function getMainModel() {
  if (modelLinks.isEditingMainModel()) {
    let rf_instance = state.getRfInstance();
    if (rf_instance) return { nodes: rf_instance.getNodes(), edges: rf_instance.getEdges() };
  }
  let { nodes = [], edges = [] } = getState().model || {};
  return { nodes, edges };
}

function getNodeIndex({ id }) {
  return Number(String(id).replace(/\D/g, "")) || 0;
}

function getBoxLabel(node) {
  return node.data?.custom_label || utils.getDisplayCopy("nodes", node.type);
}

function getSectionBoxes(nodes) {
  return nodes.filter(({ type }) => drawing.SECTION_TYPES.includes(type)).sort((a, b) => getNodeIndex(a) - getNodeIndex(b));
}

/**
 * Colors of the sections: each section box takes the next color of the palette in the order the boxes were created,
 * so the colors do not change between evaluations. Sections made inside group boxes come after them
 * @param {object} structure
 * @param {object[]} [nodes] Boxes of the main model
 * @returns {{by_section_id: Object<string, string>, by_box: Object<string, string>}}
 */
function getSectionColors(structure, nodes = getMainModel().nodes) {
  let by_box = {};
  getSectionBoxes(nodes).forEach(({ id }, index) => (by_box[id] = PALETTE[index % PALETTE.length]));
  let next_index = Object.keys(by_box).length;
  let origins = state.getGlobalVariable("structure_origins")?.sections || {};
  let by_section_id = {};
  Object.keys(structure.sections || {})
    .sort((a, b) => Number(a) - Number(b))
    .forEach((section_id) => {
      let box_color = by_box[origins[section_id]];
      by_section_id[section_id] = box_color || PALETTE[next_index++ % PALETTE.length];
    });
  return { by_section_id, by_box };
}

/**
 * @param {Object<string, string>} by_section_id From getSectionColors
 * @param {number|string} section_id
 */
function getMemberColor(by_section_id, section_id) {
  return by_section_id[section_id] || DEFAULT_SECTION_COLOR;
}

function formatNumber(value) {
  let number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toPrecision(6))) : String(value);
}

function getUnits() {
  return getState("structure").settings?.units || {};
}

/**
 * Short description of a section from its inputs, e.g. "300 × 500 mm"
 * @param {import("./types").ParamEleDrawingEntity} entity
 */
function describeSection(entity) {
  let values = Object.fromEntries(entity.fields.map(({ key, value }) => [key, formatNumber(value)]));
  let unit = getUnits().section_length || "";
  if (entity.type === "structuralRectangleSection") return `${values.base} × ${values.height} ${unit}`.trim();
  if (entity.type === "structuralCircularSection") return `Ø ${values.diameter} ${unit}`.trim();
  return `A = ${values.area}`;
}

/**
 * Sections of the main model with the members that use them. Besides the section boxes, there is an entry for the sections
 * of each group box and one for the members whose section no box makes
 * @returns {import("./types").ParamEleLibrarySection[]}
 */
function getSections() {
  // The editor is not ready before the first render
  if (!state.getRfInstance()) return [];
  let { nodes, edges } = getMainModel();
  let structure = getState("structure");
  let origins = state.getGlobalVariable("structure_origins") || {};
  let group_origins = state.getGlobalVariable("structure_group_origins") || {};
  let { by_section_id, by_box } = getSectionColors(structure, nodes);
  let transaction = new drawing.DrawingTransaction();
  let nodes_by_id = Object.fromEntries(nodes.map((node) => [node.id, node]));

  let sections = getSectionBoxes(nodes).map((node) => {
    let entity = drawing.getEntity(node.id, transaction);
    let material_edge = edges.find(({ target, targetHandle }) => target === node.id && targetHandle === "material_id-id-1");
    let material_node = material_edge && nodes_by_id[material_edge.source];
    return {
      key: node.id,
      node_id: node.id,
      type: node.type,
      label: getBoxLabel(node),
      description: entity ? describeSection(entity) : "",
      color: by_box[node.id],
      material: material_node ? { node_id: material_node.id, label: getBoxLabel(material_node) } : null,
      member_ids: [],
      editable: true,
    };
  });
  let sections_by_key = Object.fromEntries(sections.map((section) => [section.key, section]));
  Object.entries(structure.members || {}).forEach(([member_id, { section_id }]) => {
    let key;
    if (!structure.sections?.[section_id]) key = "default";
    else if (origins.sections?.[section_id] && sections_by_key[origins.sections[section_id]]) key = origins.sections[section_id];
    else if (group_origins.sections?.[section_id]) key = `group:${group_origins.sections[section_id]}`;
    else key = "default";
    if (!sections_by_key[key]) {
      let group_id = key.startsWith("group:") ? key.slice(6) : null;
      let entry = {
        key,
        node_id: group_id,
        label: group_id ? getBoxLabel(nodes_by_id[group_id] || { type: "nodesWrapper" }) : localGetCopy("default_section"),
        description: group_id ? localGetCopy("from_group") : localGetCopy("default_section_description"),
        color: group_id ? by_section_id[section_id] : DEFAULT_SECTION_COLOR,
        material: null,
        member_ids: [],
        editable: false,
        is_default: !group_id,
      };
      sections_by_key[key] = entry;
      sections.push(entry);
    }
    sections_by_key[key].member_ids.push(member_id);
  });
  return sections;
}

/**
 * Material boxes of the main model, with the sections and plates that use them
 * @returns {import("./types").ParamEleLibraryMaterial[]}
 */
function getMaterials() {
  if (!state.getRfInstance()) return [];
  let { nodes, edges } = getMainModel();
  let structure = getState("structure");
  let origins = state.getGlobalVariable("structure_origins") || {};
  let transaction = new drawing.DrawingTransaction();
  return nodes
    .filter(({ type }) => type === "structuralMaterial")
    .sort((a, b) => getNodeIndex(a) - getNodeIndex(b))
    .map((node) => {
      let entity = drawing.getEntity(node.id, transaction);
      let section_node_ids = edges
        .filter(
          ({ source, sourceHandle, targetHandle }) => source === node.id && sourceHandle === "material_out-id" && targetHandle === "material_id-id-1"
        )
        .map(({ target }) => target)
        .filter((target) => drawing.SECTION_TYPES.includes(transaction.getNode(target)?.type));
      let plate_ids = Object.entries(structure.plates || {})
        .filter(([, { material_id }]) => origins.materials?.[material_id] === node.id)
        .map(([plate_id]) => plate_id);
      return {
        key: node.id,
        node_id: node.id,
        label: getBoxLabel(node),
        fields: entity?.fields || [],
        section_node_ids,
        plate_ids,
      };
    });
}

/**
 * Structural elements to highlight for a section or a material: its members, and for a material also its plates
 * @param {{kind: "section"|"material", key: string}} item
 * @returns {{structure_key: string, element_id: string}[]}
 */
function getItemElements({ kind, key }) {
  if (kind === "section") {
    let section = getSections().find((entry) => entry.key === key);
    return (section?.member_ids || []).map((element_id) => ({ structure_key: "members", element_id }));
  }
  let material = getMaterials().find((entry) => entry.key === key);
  if (!material) return [];
  let member_ids = getSections()
    .filter(({ node_id }) => material.section_node_ids.includes(node_id))
    .flatMap(({ member_ids }) => member_ids);
  return [
    ...member_ids.map((element_id) => ({ structure_key: "members", element_id })),
    ...material.plate_ids.map((element_id) => ({ structure_key: "plates", element_id })),
  ];
}

/**
 * Gives a section to members, or a material to plates, picked in the renderer
 * @param {"members"|"plates"} structure_key
 * @param {string[]} element_ids
 * @param {string|null} source_node_id Section or material box, null for the default one
 * @returns {boolean} Whether anything changed
 */
function assignToElements(structure_key, element_ids, source_node_id) {
  let node_ids = new Set();
  let has_locked = false;
  element_ids.forEach((element_id) => {
    let node_id = drawing.getElementNodeId(structure_key, element_id);
    if (node_id) node_ids.add(node_id);
    else has_locked = true;
  });
  if (has_locked) notify("warning", "drawing_not_editable", null, true);
  return drawing.linkBoxes([...node_ids], structure_key === "members" ? "section" : "material", source_node_id);
}

/**
 * Adds a section box with its own parameters
 * @param {object} options
 * @param {"rectangle"|"circle"} options.shape
 * @param {Object<string, number>} options.dimensions e.g. {base, height} or {diameter}
 * @param {string|null} [options.material_node_id]
 * @param {string} [options.label]
 * @param {string[]} [member_node_ids] Member boxes that take the section, in the same undo step
 * @returns {string} ID of the new box
 */
function createSection({ shape, dimensions, material_node_id = null, label = "" }, member_node_ids = []) {
  let type = SHAPE_TYPES[shape];
  let transaction = new drawing.DrawingTransaction();
  // The section has parameters of its own, so changing it does not change other sections with the same dimensions
  let sources = Object.keys(SHAPE_DEFAULTS[shape]).map((key) => ({
    key,
    ...transaction.addParameter(SHAPE_PARAMETERS[key], Number(dimensions[key] ?? SHAPE_DEFAULTS[shape][key])),
  }));
  let section_id = transaction.addBox(type, "sections", { custom_label: label.trim() || getNewSectionLabel(shape, dimensions) });
  sources.forEach(({ key, source, source_handle }) => transaction.connect(source, source_handle, section_id, `${key}-value-1`));
  if (material_node_id && transaction.getNode(material_node_id))
    transaction.connect(material_node_id, "material_out-id", section_id, "material_id-id-1");
  member_node_ids.forEach((member_node_id) => {
    if (!transaction.getNode(member_node_id)) return;
    transaction.edges = transaction.edges.filter(({ target, targetHandle }) => target !== member_node_id || targetHandle !== "section_id-id-1");
    transaction.connect(section_id, "section_out-id", member_node_id, "section_id-id-1");
  });
  transaction.commit();
  return section_id;
}

function getNewSectionLabel(shape, dimensions) {
  let values = { ...SHAPE_DEFAULTS[shape], ...dimensions };
  return shape === "circle" ? `Ø${formatNumber(values.diameter)}` : `${formatNumber(values.base)}×${formatNumber(values.height)}`;
}

/**
 * Adds a material box with its own parameters
 * @param {object} options
 * @param {"concrete"|"steel"} options.preset
 * @param {string} [options.label]
 * @returns {string} ID of the new box
 */
function createMaterial({ preset, label = "" }) {
  let values = MATERIAL_PRESETS[preset];
  let name = label.trim() || localGetCopy(preset);
  let transaction = new drawing.DrawingTransaction();
  let sources = Object.keys(MATERIAL_HANDLES).map((key) => ({ key, ...transaction.addParameter(MATERIAL_PARAMETERS[key], values[key]) }));
  let name_source = transaction.addParameter("Name", name);
  let class_source = transaction.addParameter("Class", preset);
  let material_id = transaction.addBox("structuralMaterial", "sections", { custom_label: name });
  sources.forEach(({ key, source, source_handle }) => transaction.connect(source, source_handle, material_id, MATERIAL_HANDLES[key]));
  transaction.connect(name_source.source, name_source.source_handle, material_id, "name-name-Concrete");
  transaction.connect(class_source.source, class_source.source_handle, material_id, "class-name-concrete");
  transaction.commit();
  return material_id;
}

/**
 * Changes the name a box shows (its custom label)
 * @param {string} node_id
 * @param {string} label
 */
function renameBox(node_id, label) {
  let transaction = new drawing.DrawingTransaction();
  let node = transaction.getNode(node_id);
  let custom_label = label.trim();
  if (!node || !custom_label || node.data.custom_label === custom_label) return;
  node.data = { ...node.data, custom_label };
  transaction.commit();
}

const sectionsLibrary = {
  DEFAULT_SECTION_COLOR,
  SHAPE_DEFAULTS,
  getSectionColors,
  getMemberColor,
  getSections,
  getMaterials,
  getItemElements,
  getUnits,
  assignToElements,
  createSection,
  createMaterial,
  renameBox,
};

export default sectionsLibrary;
