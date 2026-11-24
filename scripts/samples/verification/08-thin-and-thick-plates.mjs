// Verification model 8: two square plates in one model, simply supported along their four edges under a uniform pressure, one thin
// (a / t = 100, where Kirchhoff plate theory holds) and one thick (a / t = 5, where Reissner-Mindlin shear deformation matters).
// The thick plate is beside the thin one, `gap` further along x. Both share the side, the divisions and the material.
// The supports are hard simple supports (SS1): the translations and the rotation about the edge's normal are fixed, so the boundary
// conditions are the ones of Navier's solution in both theories. Poisson's ratio is 0.3, as in the tables of Timoshenko.
// The mesh is a grid of N x N elements cut through the supported nodes of the edges.
import { createModel, L, ROW } from "../model.mjs";

const N = 16;
const SUPPORT_ROW = 120;
// Each plate takes a band of rows: its edges have N + 1 supports
const BAND = (N + 2) * SUPPORT_ROW;

export function buildPlates() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const r = (id) => [id, "result_out-value"];

  // Shared inputs
  const zero = m.number(0, 0, L.origin, 0, undefined, "length");
  const a = m.number(0, ROW, { es: "Lado a [m]", en: "Side a [m]" }, 4, { min: 2, max: 8, step: 0.5 }, "length");
  const n = m.number(0, 2 * ROW, { es: "Divisiones por lado", en: "Divisions per side" }, N, undefined, "dimensionless");
  const gap = m.number(0, 3 * ROW, { es: "Separación entre placas [m]", en: "Gap between plates [m]" }, 2, undefined, "length");
  const material = m.concrete(4 * ROW, 4 * ROW, 0.3);
  // Tx Ty Tz Rx Ry Rz: the rotation about the normal of each edge is fixed (Ry on y = 0 and y = a, Rx on x = 0 and x = a)
  const edge_y = m.text(0, 7 * ROW, { es: "Apoyo bordes y = 0 y y = a", en: "Support of edges y = 0 and y = a" }, "FFFRFR");
  const edge_x = m.text(0, 8 * ROW, { es: "Apoyo bordes x = 0 y x = a", en: "Support of edges x = 0 and x = a" }, "FFFFRR");
  const corner = m.text(0, 9 * ROW, { es: "Apoyo esquinas", en: "Corner support" }, "FFFFFR");
  const half = m.number(0, 10 * ROW, "0.5", 0.5, undefined, "dimensionless");

  // Coordinates 0, d, 2d, ..., a along each side
  const d = m.math("divideNumbers", 1, 0, { es: "d = a / n", en: "d = a / n" }, v(a), v(n));
  const half_a = m.math("multiplyNumbers", 1, ROW, { es: "a / 2", en: "a / 2" }, v(a), v(half));
  const cs = [v(zero)];
  for (let i = 1; i < N; i++) {
    const index = m.number(2, (i - 1) * ROW, `i = ${i}`, i, undefined, "dimensionless");
    cs.push(r(m.math("multiplyNumbers", 3, (i - 1) * ROW, `c = ${i} d`, r(d), v(index))));
  }
  cs.push(v(a));

  /**
   * One plate, its supports, pressure and results, in the band of rows from y0
   * @param {number} y0 First row of its boxes (px)
   * @param {{es: string, en: string}} name
   * @param {[string, string] | null} x0 Source of the x of its edge x = 0, or null for the origin
   */
  const plate = ({ y0, name, x0, thickness, pressure, thickness_favorite, pressure_favorite }) => {
    const label = (es, en) => ({ es: `${es} (${name.es})`, en: `${en} (${name.en})` });
    const t = m.number(4, y0, label("Espesor t [mm]", "Thickness t [mm]"), thickness, thickness_favorite, "section_length");
    const q = m.number(4, y0 + ROW, label("Presión q [kPa]", "Pressure q [kPa]"), pressure, pressure_favorite, "pressure");
    // x of the nodes: the shared coordinates moved by x0
    const xs = x0 ? cs.map((c, i) => r(m.math("sumNumbers", 4, y0 + (i + 3) * ROW, `x = x0 + c${i}`, x0, c))) : cs;

    const edge = (col, edge_label, coordinates, codes) =>
      coordinates.map(([x, y], i) => {
        const point = m.point(col, y0 + i * SUPPORT_ROW, label(`${edge_label.es} ${i + 1}`, `${edge_label.en} ${i + 1}`), [x, y, v(zero)]);
        m.support(col + 1, y0 + i * SUPPORT_ROW, label(`Apoyo ${edge_label.es} ${i + 1}`, `Support ${edge_label.en} ${i + 1}`), point, codes(i));
        return point;
      });
    const along_x = (y) => xs.map((x) => [x, y]);
    const end_codes = (i) => (i === 0 || i === N ? corner : edge_y);
    const bottom = edge(5, { es: "Borde y = 0", en: "Edge y = 0" }, along_x(v(zero)), end_codes);
    const top = edge(7, { es: "Borde y = a", en: "Edge y = a" }, along_x(v(a)), end_codes);
    edge(9, { es: "Borde x = 0", en: "Edge x = 0" }, cs.slice(1, -1).map((y) => [xs[0], y]), () => edge_x);
    edge(11, { es: "Borde x = a", en: "Edge x = a" }, cs.slice(1, -1).map((y) => [xs[N], y]), () => edge_x);
    // The center node, where the largest deflection is
    const center_x = x0 ? r(m.math("sumNumbers", 13, y0, label("x centro", "Center x"), x0, r(half_a))) : r(half_a);
    m.point(14, y0, label("Centro", "Center"), [center_x, r(half_a), v(zero)]);

    const shell = m.plate(14, y0 + SUPPORT_ROW, label("Placa", "Plate"), [bottom[0], bottom[N], top[N], top[0]], t, material);
    m.pressure(14, y0 + 2 * SUPPORT_ROW, label("Presión uniforme", "Uniform pressure"), shell, q);
    const reactions = m.nodeResult(15, y0, label("Reacciones borde y = 0", "Reactions edge y = 0"), bottom, "z");
    m.plot(16, y0, label("Reacciones borde y = 0", "Reactions edge y = 0"), reactions);
  };

  plate({
    y0: 0,
    name: { es: "delgada", en: "thin" },
    x0: null,
    thickness: 40,
    pressure: -0.5,
    thickness_favorite: { min: 20, max: 100, step: 5 },
    pressure_favorite: { min: -2, max: 0, step: 0.1 },
  });
  // The thick plate starts at x = a + gap
  const x0 = m.math("sumNumbers", 1, 2 * ROW, { es: "x0 = a + separación", en: "x0 = a + gap" }, v(a), v(gap));
  plate({
    y0: BAND,
    name: { es: "gruesa", en: "thick" },
    x0: r(x0),
    thickness: 800,
    pressure: -100,
    thickness_favorite: { min: 400, max: 1000, step: 50 },
    pressure_favorite: { min: -200, max: 0, step: 5 },
  });
  return m;
}

export default {
  id: "verification-thin-thick-plates",
  build: buildPlates,
  title: { es: "Verificación 8: placa delgada y gruesa", en: "Verification 8: thin and thick plates" },
  description: {
    es: "Dos placas cuadradas con apoyos simples en los cuatro bordes y presión uniforme, una delgada (a/t = 100) y una gruesa (a/t = 5). Compara la deflexión central y los momentos con la solución de Navier para placas de Kirchhoff (Timoshenko) y de Reissner-Mindlin, que incluye la deformación por cortante.",
    en: "Two square plates simply supported on their four edges under a uniform pressure, one thin (a/t = 100) and one thick (a/t = 5). Check the central deflection and the moments against Navier's solutions for Kirchhoff plates (Timoshenko) and Reissner-Mindlin plates, which include shear deformation.",
  },
  tags: { es: ["Verificación", "Placa", "Delgada", "Gruesa"], en: ["Verification", "Plate", "Thin", "Thick"] },
  // Its post in the Verification category of the paramele-site blog
  tutorial: { es: "placa-delgada-y-placa-gruesa", en: "thin-and-thick-plates" },
  // Mesh size larger than the spacing of the supported nodes, so the mesh follows them (see verification 4)
  settings: { global: { mesh_plates: true, mesh_size: 1 } },
};
