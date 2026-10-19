// Helpers shared by the sample models of build_samples.mjs: a builder of boxes and wires, and the copies they share.

// Grid of the editor in React Flow px: most boxes are 100 to 165 px wide, numbers 66 px tall and structural boxes 100 px.
// The plots (520 x 560) go in the last column
export const COL = 210;
export const ROW = 85;
export const PLOT_ROW = 590;

// Copies shared by the samples
export const L = {
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
 * Collects the boxes and wires of a model. Labels are {es, en} objects resolved per language when the model is written.
 */
export function createModel() {
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
    /**
     * A number box. `unit` pins its quantity (units.QUANTITIES), otherwise it takes it from its links
     */
    number(col, y, label, value, favorite, unit) {
      const id = model.box("inputNumber", col, y, { "value-value": String(value), custom_label: label, ...(unit ? { unit } : {}) });
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
    // Math box of two inputs (multiplyNumbers, sumNumbers: num_1, num_2; divideNumbers: num, den), the sources as [box, handle]
    math(type, col, y, label, [source_1, handle_1], [source_2, handle_2]) {
      const id = model.box(type, col, y, { custom_label: label });
      const [target_1, target_2] = type === "divideNumbers" ? ["num-value", "den-value"] : ["num_1-value", "num_2-value"];
      model.wire(source_1, handle_1, id, target_1);
      model.wire(source_2, handle_2, id, target_2);
      return id;
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
    // Point load at a node, from a box per component ({x, y, z}, any of them)
    pointLoad(col, y, label, node, components) {
      const id = model.box("structuralPointLoad", col, y, { custom_label: label });
      model.wire(node, "node_out-id", id, "node-id");
      Object.entries(components).forEach(([axis, source]) => model.wire(source, "value-value", id, `${axis}_mag-value`));
      return id;
    },
    // Plate through the nodes in order, with a thickness (mm) box
    plate(col, y, label, points, thickness, material) {
      const id = model.box("structuralPlate", col, y, { custom_label: label });
      points.forEach((point) => model.wire(point, "node_out-id", id, "nodes-ids"));
      model.wire(thickness, "value-value", id, "thickness-value");
      model.wire(material, "material_out-id", id, "material_id-id-1");
      return id;
    },
    // Uniform pressure on a plate, in the global Z direction
    pressure(col, y, label, plate, q) {
      const id = model.box("structuralPressure", col, y, { custom_label: label });
      model.wire(plate, "plate_out-id", id, "plate_id-id");
      model.wire(q, "value-value", id, "z_mag-value");
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
