import logic_runner from "./globalLogicRunner";

const edge = (source, target) => ({ source, target });

test("boxes run in the order of their links when there is no mesh box", () => {
  const order = logic_runner.getEvaluationOrder(["b", "a", "c"], [edge("a", "b"), edge("b", "c")], { a: "x", b: "x", c: "x" });
  expect(order).toEqual({ before_mesh: ["b", "a", "c"], mesh_boxes: [], after_mesh: [] });
});

test("a mesh box runs after the boxes that do not depend on it, and the ones that depend on it after their sources", () => {
  // plate -> mesh -> surface support <- ks number; a load on the plate comes later in the links
  const nodes_type = { plate: "structuralPlate", mesh: "structuralMesh", support: "structuralSurfaceSupport", result: "x", ks: "x", load: "x" };
  const edges = [edge("plate", "mesh"), edge("support", "result"), edge("mesh", "support"), edge("ks", "support"), edge("plate", "load")];
  const order = logic_runner.getEvaluationOrder(["mesh", "result", "support", "load"], edges, nodes_type);
  expect(order).toEqual({ before_mesh: ["load"], mesh_boxes: ["mesh"], after_mesh: ["support", "result"] });
});
