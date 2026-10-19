import units from "./units";
import unitInference from "./unitInference";
import drawingLayer from "./drawingLayer";

const metric = units.SYSTEM_DEFAULTS.metric;
const imperial = units.SYSTEM_DEFAULTS.imperial;

const DECLARATIONS = {
  inputNumber: { adaptive: ["value-value"] },
  variableRange: { adaptive: ["slider-value"] },
  structuralNode: { handles: { "x-value": "length", "y-value": "length", "z-value": "length" } },
  structuralRectangleSection: { handles: { "base-value-1": "section_length", "height-value-1": "section_length" } },
  structuralPointLoad: { handles: { "x_mag-value": "force" } },
  structuralMoment: { handles: { "x_mag-value": "moment" } },
  sumNumbers: { rule: { type: "same", inputs: ["num_1-value", "num_2-value"], output: "result_out-value" } },
  multiplyNumbers: { rule: { type: "multiply", inputs: ["num_1-value", "num_2-value"], output: "result_out-value" } },
  divideNumbers: { rule: { type: "divide", inputs: ["num-value", "den-value"], output: "result_out-value" } },
  sin: { handles: { "num-value": "unit:rad", "result_out-value": "unit:dimensionless" } },
};

const number = (id, value, unit) => ({ id, type: "inputNumber", data: { "value-value": value, ...(unit ? { unit } : {}) } });
const box = (id, type, data = {}) => ({ id, type, data });
const link = (id, source, sourceHandle, target, targetHandle) => ({ id, source, sourceHandle, target, targetHandle });

const close = (a, b) => expect(a).toBeCloseTo(b, 9);

describe("units", () => {
  test("converts between the units of a quantity", () => {
    close(units.convertQuantity(1, "length", metric, imperial), 1 / 0.3048);
    close(units.convertQuantity(1, "section_length", metric, imperial), 1 / 25.4);
    close(units.convertQuantity(1, "moment", metric, imperial), 1000 / (4448.2216152605 * 0.3048));
    close(units.convertQuantity(200000, "material_strength", metric, { ...metric, material_strength: "gpa" }), 200);
    close(units.convertQuantity(10, "distributed_force", metric, { ...metric, length: "mm" }), 0.01);
  });

  test("writes derived units with the units of the model", () => {
    expect(units.formatUnit(units.getQuantityUnit("moment"), metric)).toBe("kN·m");
    expect(units.formatUnit(units.getQuantityUnit("unit:rad"), metric)).toBe("rad");
    expect(units.formatUnit(units.getQuantityUnit("unit:deg"), metric)).toBe("°");
    expect(units.formatUnit(units.getQuantityUnit("angle"), metric)).toBe("°");
    expect(units.formatUnit(units.getQuantityUnit("dimensionless"), metric)).toBe("");
    expect(units.formatUnit(units.getQuantityUnit("distributed_force"), imperial)).toBe("kip/ft");
    expect(units.formatUnit(units.getQuantityUnit("inertia"), metric)).toBe("mm⁴");
    expect(units.formatUnit(units.multiplyUnits(units.getQuantityUnit("length"), units.getQuantityUnit("length")), metric)).toBe("m²");
    expect(units.formatUnit(units.getQuantityUnit("dimensionless"), metric)).toBe("");
  });

  test("never mixes unit systems", () => {
    expect(units.repairUnits({ system: "metric", length: "ft", force: "kip" })).toEqual(metric);
    expect(units.repairUnits({ system: "imperial", length: "in" }).length).toBe("in");
    expect(units.repairUnits(undefined)).toEqual(metric);
  });

  test("reads the units of S3D models", () => {
    expect(units.fromS3DUnits(units.toS3DUnits(imperial))).toEqual(imperial);
    expect(units.fromS3DUnits({ length: "ft", section_length: "inch", force: "kip", pressure: "ksf", material_strength: "ksi" }).section_length).toBe(
      "in"
    );
    expect(units.fromS3DUnits({ length: "furlong" })).toBeNull();
    close(units.getS3DUnitFactor("kn-m"), 1000);
    close(units.getS3DUnitFactor("kn/m2"), 1000);
    close(units.getS3DUnitFactor("kip-ft"), 4448.2216152605 * 0.3048);
  });

  test("converts structures to the units of the solvers", () => {
    let structure = {
      settings: { units: units.toS3DUnits(imperial) },
      nodes: { 1: { x: 10, y: 0, z: 0 } },
      plates: { 1: { thickness: 6 } },
      sections: { 1: { info: { shape: "rectangle", dimensions: { b: 12, h: 24 } } } },
      materials: { 1: { elasticity_modulus: 29000, density: 490 } },
      point_loads: { 1: { x_mag: 1, y_mag: 0, z_mag: -10 } },
      distributed_loads: { 1: { x_mag_A: 1, position_A: 0, position_B: 100 } },
    };
    let converted = units.convertStructure(structure, imperial, units.SOLVER_UNITS);
    close(converted.nodes[1].x, 3.048);
    close(converted.plates[1].thickness, 152.4);
    close(converted.sections[1].info.dimensions.h, 609.6);
    close(converted.materials[1].elasticity_modulus, 29000 * 6.8947572931684);
    close(converted.point_loads[1].z_mag, -44.482216152605);
    close(converted.distributed_loads[1].x_mag_A, 4.4482216152605 / 0.3048);
    expect(converted.distributed_loads[1].position_B).toBe(100);
    expect(converted.settings.units.length).toBe("m");
  });
});

describe("rounding of converted values", () => {
  const convertBack = (value, quantity, path) => {
    let current = value;
    for (let i = 1; i < path.length; i++) current = units.roundConverted(units.convertQuantity(current, quantity, path[i - 1], path[i]));
    return current;
  };
  const with_units = (changes) => ({ ...metric, ...changes });

  test("writes converted values short", () => {
    expect(units.roundConverted(0.5 / 0.3048)).toBe(1.640419948);
    expect(units.roundConverted(0.30480000000000002)).toBe(0.3048);
    expect(units.roundConverted(0)).toBe(0);
  });

  test("lands back on the original value after a round trip", () => {
    expect(convertBack(0.5, "length", [metric, imperial, metric])).toBe(0.5);
    expect(convertBack(2, "length", [metric, imperial, with_units({ length: "mm" }), metric])).toBe(2);
    expect(convertBack(12, "length", [metric, with_units({ length: "cm" }), imperial, metric])).toBe(12);
    expect(convertBack(-1, "distributed_force", [metric, imperial, with_units({ length: "mm" }), metric])).toBe(-1);
    expect(convertBack(17.5, "moment", [metric, imperial, metric, imperial, metric])).toBe(17.5);
  });

  test("keeps converted values within the tolerance", () => {
    const value = units.roundConverted(units.convertQuantity(123.456789, "force", metric, imperial));
    const exact = units.convertQuantity(123.456789, "force", metric, imperial);
    expect(Math.abs(value - exact) / exact).toBeLessThanOrEqual(1e-9);
  });
});

describe("unit inference", () => {
  test("a number takes the unit of the input it goes into", () => {
    let model = { nodes: [number("n1", "3"), box("s1", "structuralNode")], edges: [link("e1", "n1", "value-value", "s1", "x-value")] };
    let inference = unitInference.inferUnits(model, DECLARATIONS, metric);
    expect(inference.adaptive["n1|value-value"]).toBe("inferred");
    expect(inference.edges.e1).toMatchObject({ factor: 1, error: false });
  });

  test("links between units of the same dimension convert, others are errors", () => {
    let model = {
      nodes: [number("n1", "3", "length"), box("r1", "structuralRectangleSection"), box("p1", "structuralPointLoad")],
      edges: [link("e1", "n1", "value-value", "r1", "base-value-1"), link("e2", "n1", "value-value", "p1", "x_mag-value")],
    };
    let inference = unitInference.inferUnits(model, DECLARATIONS, metric);
    expect(inference.edges.e1.error).toBe(false);
    close(inference.edges.e1.factor, 1000);
    expect(inference.edges.e2.error).toBe(true);
    expect(inference.has_errors).toBe(true);
  });

  test("a free number linked to two dimensions is an error on one of the links", () => {
    let model = {
      nodes: [number("n1", "3"), box("s1", "structuralNode"), box("p1", "structuralPointLoad")],
      edges: [link("e1", "n1", "value-value", "s1", "x-value"), link("e2", "n1", "value-value", "p1", "x_mag-value")],
    };
    let inference = unitInference.inferUnits(model, DECLARATIONS, metric);
    expect([inference.edges.e1.error, inference.edges.e2.error].sort()).toEqual([false, true]);
  });

  test("counts the unit errors of a model and of its group boxes", () => {
    const conflicted = () => ({
      nodes: [number("n1", "3"), box("s1", "structuralNode"), box("p1", "structuralPointLoad")],
      edges: [link("e1", "n1", "value-value", "s1", "x-value"), link("e2", "n1", "value-value", "p1", "x_mag-value")],
    });
    const group = { id: "g1", type: "nodesWrapper", data: { internal_logic: conflicted(), input_handles: [], output_handles: [] } };
    expect(unitInference.countUnitErrors(conflicted(), DECLARATIONS, metric)).toBe(1);
    expect(unitInference.countUnitErrors({ nodes: [group], edges: [] }, DECLARATIONS, metric)).toBe(1);
    expect(unitInference.countUnitErrors({ nodes: [number("n1", "3"), box("s1", "structuralNode")], edges: [] }, DECLARATIONS, metric)).toBe(0);
  });

  test("a sum works in the unit of its first input and converts the second", () => {
    let model = {
      nodes: [number("a", "2", "length"), number("b", "500", "section_length"), box("sum", "sumNumbers"), box("s1", "structuralNode")],
      edges: [
        link("e1", "a", "value-value", "sum", "num_1-value"),
        link("e2", "b", "value-value", "sum", "num_2-value"),
        link("e3", "sum", "result_out-value", "s1", "x-value"),
      ],
    };
    let inference = unitInference.inferUnits(model, DECLARATIONS, metric);
    close(inference.edges.e2.factor, 0.001);
    expect(inference.edges.e3).toMatchObject({ factor: 1, error: false });
  });

  test("a product of a force and a length goes into a moment", () => {
    let model = {
      nodes: [number("f", "2", "force"), number("l", "3", "length"), box("mul", "multiplyNumbers"), box("m1", "structuralMoment")],
      edges: [
        link("e1", "f", "value-value", "mul", "num_1-value"),
        link("e2", "l", "value-value", "mul", "num_2-value"),
        link("e3", "mul", "result_out-value", "m1", "x_mag-value"),
      ],
    };
    let inference = unitInference.inferUnits(model, DECLARATIONS, metric);
    expect(inference.edges.e3).toMatchObject({ factor: 1, error: false });
    model.edges[2] = link("e3", "mul", "result_out-value", "m1", "x_mag-value");
    model.nodes[1] = number("l", "3", "section_length");
    close(unitInference.inferUnits(model, DECLARATIONS, metric).edges.e3.factor, 0.001);
  });

  test("free factors of a product: the first takes the unit of the result, the second is a plain number", () => {
    let model = {
      nodes: [number("a", "2"), number("b", "3"), box("mul", "multiplyNumbers"), box("s1", "structuralNode")],
      edges: [
        link("e1", "a", "value-value", "mul", "num_1-value"),
        link("e2", "b", "value-value", "mul", "num_2-value"),
        link("e3", "mul", "result_out-value", "s1", "x-value"),
      ],
    };
    let inference = unitInference.inferUnits(model, DECLARATIONS, metric);
    expect(units.formatUnit(inference.handles["a|value-value"], metric)).toBe("m");
    expect(units.formatUnit(inference.handles["b|value-value"], metric)).toBe("");
    expect(inference.has_errors).toBe(false);
  });

  test("angles in degrees go into the trigonometric boxes in radians", () => {
    let model = { nodes: [number("a", "30", "angle"), box("sin1", "sin")], edges: [link("e1", "a", "value-value", "sin1", "num-value")] };
    close(unitInference.inferUnits(model, DECLARATIONS, metric).edges.e1.factor, Math.PI / 180);
  });

  test("group boxes take the units of the handles they map", () => {
    let inner = { nodes: [number("in1", "3"), box("s1", "structuralNode")], edges: [link("e1", "in1", "value-value", "s1", "x-value")] };
    let group = box("g1", "nodesWrapper", {
      internal_logic: inner,
      input_handles: [{ label: "span", type: "value", node_id_to_map: "in1", data_key_to_map: "value-value" }],
      output_handles: [],
    });
    let model = { nodes: [number("n1", "400", "section_length"), group], edges: [link("e1", "n1", "value-value", "g1", "span-value")] };
    let inference = unitInference.inferUnits(model, DECLARATIONS, metric);
    close(inference.edges.e1.factor, 0.001);
  });

  test("rejects connections between different dimensions", () => {
    let model = { nodes: [number("n1", "3", "force"), box("s1", "structuralNode")], edges: [] };
    let connection = { source: "n1", sourceHandle: "value-value", target: "s1", targetHandle: "x-value" };
    expect(unitInference.isValidConnection(model, connection, DECLARATIONS, metric)).toBe(false);
    model.nodes[0] = number("n1", "3");
    expect(unitInference.isValidConnection(model, connection, DECLARATIONS, metric)).toBe(true);
  });
});

describe("drawing tools in the model units", () => {
  const drawing_state = { tool: "member", offset: 3, spacing: 1, thickness: 200, force: { x: 0, y: 0, z: -10 }, moment: { x: 0, y: 0, z: 10 } };

  test("keep the size of the grid and the new elements", () => {
    const in_mm = drawingLayer.convertDrawingState(drawing_state, metric, { ...metric, length: "mm" });
    expect(in_mm).toMatchObject({ tool: "member", offset: 3000, spacing: 1000, thickness: 200, force: { z: -10 }, moment: { z: 10000 } });
  });

  test("come back to the same values", () => {
    const in_imperial = drawingLayer.convertDrawingState(drawing_state, metric, imperial);
    expect(in_imperial.spacing).toBe(3.280839895);
    expect(drawingLayer.convertDrawingState(in_imperial, imperial, metric)).toEqual(drawing_state);
  });
});
