// Builds the sample models in public/samples (one file per language) and their catalog.
// The samples are served by the hosting and downloaded only when the user opens one (src/js/samples.js).
// Run with `npm run samples` after changing them here. Thumbnails (public/samples/<id>.webp) are captures of the 3D view of the app.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "samples");
const LANGUAGES = ["es", "en"];
const BLOG_URL = { es: "https://paramele.com/blog", en: "https://paramele.com/en/blog" };

// Grid of the editor in React Flow px: most boxes are 100 to 165 px wide, numbers 66 px tall and structural boxes 100 px.
// The plots (520 x 560) go in the last column
const COL = 210;
const ROW = 85;
const PLOT_ROW = 590;

/**
 * Collects the boxes and wires of a model. Labels are {es, en} objects resolved per language when the model is written.
 */
function createModel() {
  const nodes = [];
  const edges = [];
  const favorites = [];
  let next_id = 1;
  const model = {
    /**
     * Adds a box and returns its id
     * @param {string} type Box type from flow-nodes/handler.js
     * @param {number} col Column in the grid
     * @param {number} y Vertical position in px
     * @param {object} [data] Data of the box (custom_label may be {es, en})
     */
    box(type, col, y, data = {}) {
      const id = `node-${next_id++}`;
      nodes.push({ id, type, position: { x: col * COL + (type === "dataDisplay2DPlot" ? 50 : 0), y }, data });
      return id;
    },
    number(col, y, label, value, favorite) {
      const id = model.box("inputNumber", col, y, { "value-value": String(value), custom_label: label });
      if (favorite) favorites.push({ node_id: id, data_key: "value-value", ...favorite });
      return id;
    },
    text(col, y, label, value) {
      return model.box("inputString", col, y, { "value-string": value, custom_label: label });
    },
    wire(source, source_handle, target, target_handle) {
      edges.push({
        id: `e-${source}-${source_handle}-${target}-${target_handle}`,
        source,
        sourceHandle: source_handle,
        target,
        targetHandle: target_handle,
      });
    },
    // A structural node from three boxes that give its coordinates
    point(col, y, label, [x_src, y_src, z_src]) {
      const id = model.box("structuralNode", col, y, { custom_label: label });
      [
        ["x-value", x_src],
        ["y-value", y_src],
        ["z-value", z_src],
      ].forEach(([handle, [source, source_handle]]) => model.wire(source, source_handle, id, handle));
      return id;
    },
    member(col, y, label, node_A, node_B, section) {
      const id = model.box("structuralMember", col, y, { custom_label: label });
      model.wire(node_A, "node_out-id", id, "node_A-id");
      model.wire(node_B, "node_out-id", id, "node_B-id");
      model.wire(section, "section_out-id", id, "section_id-id-1");
      return id;
    },
    support(col, y, label, node, code) {
      const id = model.box("structuralGenericSupport", col, y, { custom_label: label });
      model.wire(node, "node_out-id", id, "node-id");
      model.wire(code, "value-string", id, "restraint_code-string-FFFFFF");
      return id;
    },
    fixedSupport(col, y, label, node) {
      const id = model.box("structuralFixedSupport", col, y, { custom_label: label });
      model.wire(node, "node_out-id", id, "node-id");
      return id;
    },
    // Uniform load along the whole member, in the global Z direction
    uniformLoad(col, y, label, member, w) {
      const id = model.box("structuralDistributedLoad", col, y, { custom_label: label });
      model.wire(member, "member_out-id", id, "member-id");
      model.wire(w, "value-value", id, "z_mag_A-value");
      model.wire(w, "value-value", id, "z_mag_B-value");
      return id;
    },
    memberResult(col, y, label, members, result, direction, result_type = "full") {
      const id = model.box("structuralMemberResult", col, y, {
        custom_label: label,
        "result-value": result,
        "direction-value": direction,
        "result_type-value": result_type,
      });
      members.forEach((member) => model.wire(member, "member_out-id", id, "members-ids"));
      return id;
    },
    nodeResult(col, y, label, points, direction) {
      const id = model.box("structuralNodeResult", col, y, { custom_label: label, "result-value": "reaction", "direction-value": direction });
      points.forEach((point) => model.wire(point, "node_out-id", id, "nodes-ids"));
      return id;
    },
    plot(col, y, label, source) {
      const id = model.box("dataDisplay2DPlot", col, y, { custom_label: label });
      model.wire(source, "plotable_out-plotly_data", id, "plotable-plotly_data");
      return id;
    },
    // Concrete: E [MPa], density [kg/m³] and Poisson's ratio boxes in column 0 from row y, the material in column 1
    concrete(y, material_y) {
      const material = model.box("structuralMaterial", 1, material_y, { custom_label: L.material });
      const E = model.number(0, y, L.E, 24870);
      const density = model.number(0, y + ROW, L.density, 2400);
      const nu = model.number(0, y + 2 * ROW, L.nu, 0.2);
      model.wire(E, "value-value", material, "elasticity_modulus-value-20000");
      model.wire(density, "value-value", material, "density-value");
      model.wire(nu, "value-value", material, "poissons_ratio-value-0.3");
      return material;
    },
    // Rectangular section of b x h (mm) from two boxes
    section(col, y, label, material, b, h) {
      const id = model.box("structuralRectangleSection", col, y, { custom_label: label });
      model.wire(material, "material_out-id", id, "material_id-id-1");
      model.wire(b, "value-value", id, "base-value-1");
      model.wire(h, "value-value", id, "height-value-1");
      return id;
    },
    toJSON(language) {
      const resolve = (value) => (value && typeof value === "object" && !Array.isArray(value) && language in value ? value[language] : value);
      return {
        nodes: nodes.map((node) => ({
          ...node,
          data: Object.fromEntries(Object.entries(node.data).map(([key, value]) => [key, resolve(value)])),
        })),
        edges,
        favorites,
      };
    },
  };
  return model;
}

// Copies shared by the samples
const L = {
  origin: { es: "Origen (0)", en: "Origin (0)" },
  material: { es: "Concreto", en: "Concrete" },
  E: { es: "E concreto [MPa]", en: "Concrete E [MPa]" },
  density: { es: "Densidad [kg/m³]", en: "Density [kg/m³]" },
  nu: { es: "Poisson", en: "Poisson's ratio" },
  pin: { es: "Código articulación", en: "Pin code" },
  roller: { es: "Código rodillo", en: "Roller code" },
  w: { es: "Carga w [kN/m]", en: "Load w [kN/m]" },
  moment: { es: "Momento flector", en: "Bending moment" },
  deflection: { es: "Deflexión", en: "Deflection" },
  reactions: { es: "Reacciones verticales", en: "Vertical reactions" },
};

/**
 * Sample 1: simply supported beam with a uniform load. A pin at one end and a roller at the other.
 */
function simplySupportedBeam() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const zero = m.number(0, 0, L.origin, 0);
  const span = m.number(0, ROW, { es: "Luz L [m]", en: "Span L [m]" }, 6, { min: 2, max: 12, step: 0.5 });
  const w = m.number(0, 2 * ROW, L.w, -20, { min: -60, max: 0, step: 1 });

  const A = m.point(1, 0, { es: "Nodo A", en: "Node A" }, [v(zero), v(zero), v(zero)]);
  const B = m.point(1, 120, { es: "Nodo B", en: "Node B" }, [v(span), v(zero), v(zero)]);

  const material = m.concrete(300, 300);
  const b = m.number(1, 460, { es: "Base b [mm]", en: "Width b [mm]" }, 300);
  const h = m.number(1, 460 + ROW, { es: "Altura h [mm]", en: "Depth h [mm]" }, 500, { min: 250, max: 900, step: 50 });
  const section = m.section(2, 300, { es: "Sección de la viga", en: "Beam section" }, material, b, h);

  // Tx Ty Tz Rx Ry Rz: F fixed, R released. Rx stays fixed so the beam cannot spin about its own axis
  const pin = m.text(2, 0, L.pin, "FFFFRR");
  const roller = m.text(2, ROW, L.roller, "RFFFRR");
  m.support(3, 0, { es: "Apoyo A (articulación)", en: "Support A (pin)" }, A, pin);
  m.support(3, 120, { es: "Apoyo B (rodillo)", en: "Support B (roller)" }, B, roller);
  const beam = m.member(3, 260, { es: "Viga", en: "Beam" }, A, B, section);

  m.uniformLoad(4, 160, { es: "Carga distribuida", en: "Distributed load" }, beam, w);

  const moment = m.memberResult(5, 0, L.moment, [beam], "moment", "z");
  m.plot(6, 0, L.moment, moment);
  const deflection = m.memberResult(5, PLOT_ROW, L.deflection, [beam], "displacement", "z");
  m.plot(6, PLOT_ROW, L.deflection, deflection);
  return m;
}

/**
 * Sample 2: single storey portal frame with fixed bases, a uniform load on the beam and a lateral load at the top
 */
function portalFrame() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const zero = m.number(0, 0, L.origin, 0);
  const span = m.number(0, ROW, { es: "Luz L [m]", en: "Span L [m]" }, 6, { min: 3, max: 12, step: 0.5 });
  const height = m.number(0, 2 * ROW, { es: "Altura H [m]", en: "Height H [m]" }, 3.5, { min: 2.5, max: 6, step: 0.25 });
  const w = m.number(0, 3 * ROW, L.w, -25, { min: -60, max: 0, step: 1 });
  const P = m.number(0, 4 * ROW, { es: "Carga lateral P [kN]", en: "Lateral load P [kN]" }, 15, { min: -50, max: 50, step: 1 });

  const base_left = m.point(1, 0, { es: "Base izquierda", en: "Left base" }, [v(zero), v(zero), v(zero)]);
  const base_right = m.point(1, 120, { es: "Base derecha", en: "Right base" }, [v(span), v(zero), v(zero)]);
  const top_left = m.point(1, 240, { es: "Esquina izquierda", en: "Left corner" }, [v(zero), v(zero), v(height)]);
  const top_right = m.point(1, 360, { es: "Esquina derecha", en: "Right corner" }, [v(span), v(zero), v(height)]);

  const material = m.concrete(500, 500);
  const column_side = m.number(1, 660, { es: "Lado columna [mm]", en: "Column side [mm]" }, 400, { min: 250, max: 800, step: 50 });
  const beam_b = m.number(1, 660 + ROW, { es: "Base viga b [mm]", en: "Beam width b [mm]" }, 300);
  const beam_h = m.number(1, 660 + 2 * ROW, { es: "Altura viga h [mm]", en: "Beam depth h [mm]" }, 500, { min: 250, max: 900, step: 50 });
  const column_section = m.section(2, 500, { es: "Sección columnas", en: "Column section" }, material, column_side, column_side);
  const beam_section = m.section(2, 640, { es: "Sección viga", en: "Beam section" }, material, beam_b, beam_h);

  m.fixedSupport(2, 0, { es: "Empotramiento izq.", en: "Left fixed base" }, base_left);
  m.fixedSupport(2, 120, { es: "Empotramiento der.", en: "Right fixed base" }, base_right);
  m.member(3, 240, { es: "Columna izquierda", en: "Left column" }, base_left, top_left, column_section);
  m.member(3, 360, { es: "Columna derecha", en: "Right column" }, base_right, top_right, column_section);
  const beam = m.member(3, 480, { es: "Viga", en: "Beam" }, top_left, top_right, beam_section);

  m.uniformLoad(4, 380, { es: "Carga en la viga", en: "Load on the beam" }, beam, w);
  const lateral = m.box("structuralPointLoad", 4, 220, { custom_label: { es: "Carga lateral", en: "Lateral load" } });
  m.wire(top_left, "node_out-id", lateral, "node-id");
  m.wire(P, "value-value", lateral, "x_mag-value");

  const moment = m.memberResult(5, 0, { es: "Momento en la viga", en: "Beam bending moment" }, [beam], "moment", "z");
  m.plot(6, 0, { es: "Momento en la viga", en: "Beam bending moment" }, moment);
  const reactions = m.nodeResult(5, PLOT_ROW, { es: "Reacciones horizontales", en: "Horizontal reactions" }, [base_left, base_right], "x");
  m.plot(6, PLOT_ROW, { es: "Reacciones horizontales", en: "Horizontal reactions" }, reactions);
  return m;
}

/**
 * Sample 3: beam over four supports (three equal spans), each span a member, the supports at multiples of the span
 */
function multiSpanBeam() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const r = (id) => [id, "result_out-value"];
  const zero = m.number(0, 0, L.origin, 0);
  const span = m.number(0, ROW, { es: "Luz de cada vano L [m]", en: "Span of each bay L [m]" }, 5, { min: 2, max: 10, step: 0.5 });
  const w = m.number(0, 2 * ROW, L.w, -20, { min: -60, max: 0, step: 1 });
  const two = m.number(0, 3 * ROW, { es: "Factor 2", en: "Factor 2" }, 2);
  const three = m.number(0, 4 * ROW, { es: "Factor 3", en: "Factor 3" }, 3);

  const x2 = m.box("multiplyNumbers", 1, 240, { custom_label: { es: "x = 2 L", en: "x = 2 L" } });
  m.wire(span, "value-value", x2, "num_1-value");
  m.wire(two, "value-value", x2, "num_2-value");
  const x3 = m.box("multiplyNumbers", 1, 360, { custom_label: { es: "x = 3 L", en: "x = 3 L" } });
  m.wire(span, "value-value", x3, "num_1-value");
  m.wire(three, "value-value", x3, "num_2-value");

  const material = m.concrete(500, 500);
  const b = m.number(1, 660, { es: "Base b [mm]", en: "Width b [mm]" }, 300);
  const h = m.number(1, 660 + ROW, { es: "Altura h [mm]", en: "Depth h [mm]" }, 450, { min: 250, max: 900, step: 50 });
  const section = m.section(2, 500, { es: "Sección de la viga", en: "Beam section" }, material, b, h);

  const n1 = m.point(2, 0, { es: "Nodo 1 (x = 0)", en: "Node 1 (x = 0)" }, [v(zero), v(zero), v(zero)]);
  const n2 = m.point(2, 120, { es: "Nodo 2 (x = L)", en: "Node 2 (x = L)" }, [v(span), v(zero), v(zero)]);
  const n3 = m.point(2, 240, { es: "Nodo 3 (x = 2 L)", en: "Node 3 (x = 2 L)" }, [r(x2), v(zero), v(zero)]);
  const n4 = m.point(2, 360, { es: "Nodo 4 (x = 3 L)", en: "Node 4 (x = 3 L)" }, [r(x3), v(zero), v(zero)]);

  const spans = [
    m.member(3, 0, { es: "Vano 1", en: "Bay 1" }, n1, n2, section),
    m.member(3, 120, { es: "Vano 2", en: "Bay 2" }, n2, n3, section),
    m.member(3, 240, { es: "Vano 3", en: "Bay 3" }, n3, n4, section),
  ];

  const pin = m.text(2, 640, L.pin, "FFFFRR");
  const roller = m.text(2, 640 + ROW, L.roller, "RFFFRR");
  m.support(3, 400, { es: "Apoyo 1 (articulación)", en: "Support 1 (pin)" }, n1, pin);
  [n2, n3, n4].forEach((point, index) =>
    m.support(3, 520 + index * 120, { es: `Apoyo ${index + 2} (rodillo)`, en: `Support ${index + 2} (roller)` }, point, roller)
  );

  spans.forEach((member, index) => m.uniformLoad(4, index * 270, { es: `Carga vano ${index + 1}`, en: `Load bay ${index + 1}` }, member, w));

  const moment = m.memberResult(5, 0, L.moment, spans, "moment", "z");
  m.plot(6, 0, L.moment, moment);
  const reactions = m.nodeResult(5, PLOT_ROW, L.reactions, [n1, n2, n3, n4], "z");
  m.plot(6, PLOT_ROW, L.reactions, reactions);
  return m;
}

const SETTINGS = {
  general: { auto_update: true, mini_map: false, show_nodes: true, side_by_side: true, show_properties_panel: false, show_parameters_panel: true },
  layout: { renderer_width: 45, editor_width: 55, panel_width: 0, renderer_right: 55 },
  global: { sliders_mode: "sliders_single", spacing_between_combinations: 1, solver_engine: "pynite_wasm" },
};

const SAMPLES = [
  {
    id: "simply-supported-beam",
    build: simplySupportedBeam,
    title: { es: "Viga simplemente apoyada", en: "Simply supported beam" },
    description: {
      es: "Una luz con carga uniforme, articulación y rodillo. Cambia la luz, la carga o la altura y compara con 5wL⁴/384EI.",
      en: "One span with a uniform load, a pin and a roller. Change the span, the load or the depth and check it against 5wL⁴/384EI.",
    },
    tags: { es: ["Viga", "Básico"], en: ["Beam", "Basic"] },
    tutorial: { es: "viga-simplemente-apoyada", en: "simply-supported-beam" },
  },
  {
    id: "portal-frame",
    build: portalFrame,
    title: { es: "Pórtico de un piso", en: "Single storey frame" },
    description: {
      es: "Dos columnas empotradas y una viga, con carga de gravedad y carga lateral. Mira cómo cambian los momentos al variar la altura.",
      en: "Two fixed-base columns and a beam, with gravity and lateral loads. See how the moments change as the height varies.",
    },
    tags: { es: ["Pórtico", "Básico"], en: ["Frame", "Basic"] },
    tutorial: { es: "portico-de-un-piso", en: "single-storey-frame" },
  },
  {
    id: "multi-span-beam",
    build: multiSpanBeam,
    title: { es: "Viga continua de tres vanos", en: "Three-span continuous beam" },
    description: {
      es: "Una viga sobre cuatro apoyos. Las posiciones salen de multiplicar la luz, así que un solo valor controla toda la geometría.",
      en: "A beam over four supports. Their positions multiply the span, so a single value drives the whole geometry.",
    },
    tags: { es: ["Viga", "Matemáticas"], en: ["Beam", "Math"] },
    tutorial: { es: "viga-continua-de-tres-vanos", en: "three-span-continuous-beam" },
  },
];

mkdirSync(OUT_DIR, { recursive: true });
const catalog = { samples: [] };
SAMPLES.forEach((sample) => {
  const model = sample.build();
  LANGUAGES.forEach((language) => {
    const file = { model: model.toJSON(language), settings: SETTINGS };
    writeFileSync(join(OUT_DIR, `${sample.id}.${language}.json`), JSON.stringify(file, undefined, 2) + "\n");
  });
  catalog.samples.push({
    id: sample.id,
    title: sample.title,
    description: sample.description,
    tags: sample.tags,
    boxes: model.toJSON("en").nodes.length,
    thumbnail: `${sample.id}.webp`,
    tutorial: Object.fromEntries(LANGUAGES.map((language) => [language, `${BLOG_URL[language]}/${sample.tutorial[language]}`])),
  });
});
writeFileSync(join(OUT_DIR, "catalog.json"), JSON.stringify(catalog, undefined, 2) + "\n");
console.log(`Wrote ${SAMPLES.length} samples to ${OUT_DIR}`);
