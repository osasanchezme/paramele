// Verification model 3: one storey plane frame with several spans, gravity distributed loads on the beams and lateral point
// loads at the top (free end) of each column (thesis, chapter 3)
import { createModel, L, ROW, PLOT_ROW } from "../model.mjs";

const SPANS = 3;

function build() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const r = (id) => [id, "result_out-value"];
  const zero = m.number(0, 0, L.origin, 0, undefined, "length");
  const span = m.number(0, ROW, { es: "Luz de cada vano L [m]", en: "Span of each bay L [m]" }, 5, { min: 3, max: 10, step: 0.5 }, "length");
  const height = m.number(0, 2 * ROW, { es: "Altura H [m]", en: "Height H [m]" }, 3.5, { min: 2.5, max: 6, step: 0.25 }, "length");
  const w = m.number(0, 3 * ROW, L.w, -25, { min: -60, max: 0, step: 1 }, "distributed_force");
  const P = m.number(0, 4 * ROW, { es: "Carga lateral P [kN]", en: "Lateral load P [kN]" }, 10, { min: -50, max: 50, step: 1 }, "force");

  // x of each column line: 0, L, 2 L, 3 L
  const xs = [v(zero), v(span)];
  for (let i = 2; i <= SPANS; i++) {
    const factor = m.number(0, (3 + i) * ROW, { es: `Factor ${i}`, en: `Factor ${i}` }, i, undefined, "dimensionless");
    const x = m.math("multiplyNumbers", 1, (i - 2) * 120, { es: `x = ${i} L`, en: `x = ${i} L` }, v(span), v(factor));
    xs.push(r(x));
  }

  const material = m.concrete(9 * ROW, 9 * ROW);
  const column_b = m.number(1, 9 * ROW + 160, { es: "Lado columna [mm]", en: "Column side [mm]" }, 400, { min: 250, max: 800, step: 50 }, "section_length");
  const beam_b = m.number(1, 9 * ROW + 160 + ROW, { es: "Base viga b [mm]", en: "Beam width b [mm]" }, 300, undefined, "section_length");
  const beam_h = m.number(1, 9 * ROW + 160 + 2 * ROW, { es: "Altura viga h [mm]", en: "Beam depth h [mm]" }, 500, { min: 250, max: 900, step: 50 }, "section_length");
  const column_section = m.section(2, 9 * ROW, { es: "Sección columnas", en: "Column section" }, material, column_b, column_b);
  const beam_section = m.section(2, 9 * ROW + 140, { es: "Sección vigas", en: "Beam section" }, material, beam_b, beam_h);

  const bases = xs.map((x, i) => m.point(2, i * 120, { es: `Base ${i + 1}`, en: `Base ${i + 1}` }, [x, v(zero), v(zero)]));
  const tops = xs.map((x, i) => m.point(3, i * 120, { es: `Cabeza ${i + 1}`, en: `Top ${i + 1}` }, [x, v(zero), v(height)]));

  bases.forEach((base, i) => m.fixedSupport(4, i * 120, { es: `Empotramiento ${i + 1}`, en: `Fixed base ${i + 1}` }, base));
  const columns = bases.map((base, i) => m.member(5, i * 120, { es: `Columna ${i + 1}`, en: `Column ${i + 1}` }, base, tops[i], column_section));
  const beams = tops
    .slice(0, -1)
    .map((top, i) => m.member(5, (SPANS + 1 + i) * 120, { es: `Viga ${i + 1}`, en: `Beam ${i + 1}` }, top, tops[i + 1], beam_section));

  beams.forEach((beam, i) => m.uniformLoad(6, i * 270, { es: `Carga viga ${i + 1}`, en: `Load beam ${i + 1}` }, beam, w));
  tops.forEach((top, i) =>
    m.pointLoad(7, i * 140, { es: `Carga lateral ${i + 1}`, en: `Lateral load ${i + 1}` }, top, { x: P })
  );

  const moment = m.memberResult(8, 0, { es: "Momento en las vigas", en: "Beam bending moment" }, beams, "moment", "z");
  m.plot(9, 0, { es: "Momento en las vigas", en: "Beam bending moment" }, moment);
  const drift = m.memberResult(8, PLOT_ROW, { es: "Desplazamiento lateral columnas", en: "Column lateral displacement" }, columns, "displacement", "x");
  m.plot(9, PLOT_ROW, { es: "Desplazamiento lateral columnas", en: "Column lateral displacement" }, drift);
  const horizontal = m.nodeResult(8, 2 * PLOT_ROW, { es: "Reacciones horizontales", en: "Horizontal reactions" }, bases, "x");
  m.plot(9, 2 * PLOT_ROW, { es: "Reacciones horizontales", en: "Horizontal reactions" }, horizontal);
  const vertical = m.nodeResult(8, 3 * PLOT_ROW, L.reactions, bases, "z");
  m.plot(9, 3 * PLOT_ROW, L.reactions, vertical);
  return m;
}

export default {
  id: "verification-multi-span-frame",
  build,
  title: { es: "Verificación 3: pórtico plano de varias luces", en: "Verification 3: multi-span plane frame" },
  description: {
    es: "Modelo de verificación de la tesis: pórtico de un nivel y tres luces con columnas empotradas, carga distribuida en las vigas y una carga lateral en la cabeza de cada columna.",
    en: "Thesis verification model: one storey, three-span frame with fixed columns, a distributed load on the beams and a lateral load at the top of each column.",
  },
  tags: { es: ["Verificación", "Pórtico"], en: ["Verification", "Frame"] },
};
