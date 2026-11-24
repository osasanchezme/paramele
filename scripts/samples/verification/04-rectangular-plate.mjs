// Verification model 4: flat rectangular plate, simply supported along its edges, with a uniform pressure perpendicular to
// its plane (thesis, chapter 3).
// The supports are nodes along the four edges, every a / NX and b / NY, each with a simple support (translations fixed,
// rotations free). The mesher cuts the plate through every node on its edges, so with a mesh size larger than that spacing
// (the sample sets 1 m) every node of the edges is supported and the mesh is a grid of NX x NY elements.
import { createModel, L, ROW } from "../model.mjs";

const NX = 12;
const NY = 8;
const SUPPORT_ROW = 120;

function build() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const r = (id) => [id, "result_out-value"];
  const zero = m.number(0, 0, L.origin, 0, undefined, "length");
  const a = m.number(0, ROW, { es: "Largo a (x) [m]", en: "Length a (x) [m]" }, 6, { min: 3, max: 12, step: 0.5 }, "length");
  const b = m.number(0, 2 * ROW, { es: "Ancho b (y) [m]", en: "Width b (y) [m]" }, 4, { min: 2, max: 8, step: 0.5 }, "length");
  const t = m.number(0, 3 * ROW, { es: "Espesor t [mm]", en: "Thickness t [mm]" }, 200, { min: 100, max: 400, step: 10 }, "section_length");
  const q = m.number(0, 4 * ROW, { es: "Presión q [kPa]", en: "Pressure q [kPa]" }, -10, { min: -50, max: 0, step: 1 }, "pressure");
  const nx = m.number(0, 5 * ROW, { es: "Divisiones en x", en: "Divisions along x" }, NX, undefined, "dimensionless");
  const ny = m.number(0, 6 * ROW, { es: "Divisiones en y", en: "Divisions along y" }, NY, undefined, "dimensionless");
  const material = m.concrete(7 * ROW, 0);
  const simple = m.text(0, 10 * ROW, { es: "Código apoyo simple", en: "Simple support code" }, "FFFRRR");

  // Spacing of the supported nodes, and their coordinates i a / NX and j b / NY
  const dx = m.math("divideNumbers", 1, 120, { es: "dx = a / nx", en: "dx = a / nx" }, v(a), v(nx));
  const dy = m.math("divideNumbers", 1, 240, { es: "dy = b / ny", en: "dy = b / ny" }, v(b), v(ny));
  const indices = [];
  for (let i = 1; i < Math.max(NX, NY); i++) indices.push(m.number(2, (i - 1) * ROW, `i = ${i}`, i, undefined, "dimensionless"));
  const xs = [v(zero)];
  for (let i = 1; i < NX; i++) xs.push(r(m.math("multiplyNumbers", 3, (i - 1) * 110, `x = ${i} dx`, r(dx), v(indices[i - 1]))));
  xs.push(v(a));
  const ys = [v(zero)];
  for (let j = 1; j < NY; j++) ys.push(r(m.math("multiplyNumbers", 4, (j - 1) * 110, `y = ${j} dy`, r(dy), v(indices[j - 1]))));
  ys.push(v(b));

  // Nodes of each edge (corners in the bottom and top edges), each with its support in the next column
  const edge = (col, label, coordinates) =>
    coordinates.map(([x, y], i) => {
      const point = m.point(col, i * SUPPORT_ROW, { es: `${label.es} ${i + 1}`, en: `${label.en} ${i + 1}` }, [x, y, v(zero)]);
      m.support(col + 1, i * SUPPORT_ROW, { es: `Apoyo ${label.es} ${i + 1}`, en: `Support ${label.en} ${i + 1}` }, point, simple);
      return point;
    });
  const bottom = edge(5, { es: "Borde y = 0", en: "Edge y = 0" }, xs.map((x) => [x, v(zero)]));
  const top = edge(7, { es: "Borde y = b", en: "Edge y = b" }, xs.map((x) => [x, v(b)]));
  edge(9, { es: "Borde x = 0", en: "Edge x = 0" }, ys.slice(1, -1).map((y) => [v(zero), y]));
  edge(11, { es: "Borde x = a", en: "Edge x = a" }, ys.slice(1, -1).map((y) => [v(a), y]));

  const plate = m.plate(13, 0, { es: "Placa", en: "Plate" }, [bottom[0], bottom[NX], top[NX], top[0]], t, material);
  m.pressure(13, 160, { es: "Presión uniforme", en: "Uniform pressure" }, plate, q);

  const reactions = m.nodeResult(14, 0, { es: "Reacciones borde y = 0", en: "Reactions edge y = 0" }, bottom, "z");
  m.plot(15, 0, { es: "Reacciones borde y = 0", en: "Reactions edge y = 0" }, reactions);
  return m;
}

export default {
  id: "verification-rectangular-plate",
  build,
  title: { es: "Verificación 4: placa rectangular", en: "Verification 4: rectangular plate" },
  description: {
    es: "Modelo de verificación de la tesis: placa plana con apoyos simples a lo largo de sus bordes y presión uniforme perpendicular a su plano. Compara la deflexión central con la solución de Navier.",
    en: "Thesis verification model: flat plate simply supported along its edges with a uniform pressure perpendicular to its plane. Check the central deflection against Navier's solution.",
  },
  tags: { es: ["Verificación", "Placa"], en: ["Verification", "Plate"] },
  // Its post in the Verification category of the paramele-site blog
  tutorial: { es: "verificacion-placa-rectangular", en: "verification-rectangular-plate" },
  // The mesh follows the supported nodes of the edges (see above), mesh size larger than their spacing
  settings: { global: { mesh_plates: true, mesh_size: 1 } },
};
