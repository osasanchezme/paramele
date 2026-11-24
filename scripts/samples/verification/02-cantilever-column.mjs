// Verification model 2: cantilever column fixed at its base, with a gravity point load and a lateral trapezoidal load
// (thesis, chapter 3)
import { createModel, L, ROW, PLOT_ROW } from "../model.mjs";

function build() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const zero = m.number(0, 0, L.origin, 0, undefined, "length");
  const height = m.number(0, ROW, { es: "Altura H [m]", en: "Height H [m]" }, 4, { min: 2, max: 8, step: 0.25 }, "length");
  const P = m.number(0, 2 * ROW, { es: "Carga gravitacional P [kN]", en: "Gravity load P [kN]" }, -200, { min: -1000, max: 0, step: 10 }, "force");
  const w_base = m.number(0, 3 * ROW, { es: "Carga lateral en la base [kN/m]", en: "Lateral load at the base [kN/m]" }, 2, { min: 0, max: 20, step: 0.5 }, "distributed_force");
  const w_top = m.number(0, 4 * ROW, { es: "Carga lateral en la cabeza [kN/m]", en: "Lateral load at the top [kN/m]" }, 6, { min: 0, max: 20, step: 0.5 }, "distributed_force");

  const base = m.point(1, 0, { es: "Base", en: "Base" }, [v(zero), v(zero), v(zero)]);
  const top = m.point(1, 120, { es: "Cabeza", en: "Top" }, [v(zero), v(zero), v(height)]);

  const material = m.concrete(5 * ROW + 20, 260);
  const b = m.number(1, 420, { es: "Base b [mm]", en: "Width b [mm]" }, 400, { min: 250, max: 800, step: 50 }, "section_length");
  const h = m.number(1, 420 + ROW, { es: "Altura h [mm]", en: "Depth h [mm]" }, 400, { min: 250, max: 800, step: 50 }, "section_length");
  const section = m.section(2, 260, { es: "Sección de la columna", en: "Column section" }, material, b, h);

  m.fixedSupport(2, 0, { es: "Empotramiento", en: "Fixed base" }, base);
  const column = m.member(3, 0, { es: "Columna", en: "Column" }, base, top, section);

  m.pointLoad(4, 0, { es: "Carga gravitacional", en: "Gravity load" }, top, { z: P });
  // Trapezoidal lateral load along X, from the base (A) to the top (B) of the column
  const lateral = m.box("structuralDistributedLoad", 4, 140, { custom_label: { es: "Carga lateral trapezoidal", en: "Trapezoidal lateral load" } });
  m.wire(column, "member_out-id", lateral, "member-id");
  m.wire(w_base, "value-value", lateral, "x_mag_A-value");
  m.wire(w_top, "value-value", lateral, "x_mag_B-value");

  const moment = m.memberResult(5, 0, L.moment, [column], "moment", "z");
  m.plot(6, 0, L.moment, moment);
  const shear = m.memberResult(5, PLOT_ROW, { es: "Cortante", en: "Shear" }, [column], "shear", "y");
  m.plot(6, PLOT_ROW, { es: "Cortante", en: "Shear" }, shear);
  const drift = m.memberResult(5, 2 * PLOT_ROW, { es: "Desplazamiento lateral", en: "Lateral displacement" }, [column], "displacement", "x");
  m.plot(6, 2 * PLOT_ROW, { es: "Desplazamiento lateral", en: "Lateral displacement" }, drift);
  const axial = m.memberResult(5, 3 * PLOT_ROW, { es: "Fuerza axial", en: "Axial force" }, [column], "axial", "x");
  m.plot(6, 3 * PLOT_ROW, { es: "Fuerza axial", en: "Axial force" }, axial);
  return m;
}

export default {
  id: "verification-cantilever-column",
  build,
  title: { es: "Verificación 2: columna en voladizo", en: "Verification 2: cantilever column" },
  description: {
    es: "Modelo de verificación de la tesis: columna empotrada en la base con una carga puntual gravitacional y una carga lateral trapezoidal.",
    en: "Thesis verification model: column fixed at its base with a gravity point load and a trapezoidal lateral load.",
  },
  tags: { es: ["Verificación", "Columna"], en: ["Verification", "Column"] },
  // Its post in the Verification category of the paramele-site blog
  tutorial: { es: "verificacion-columna-en-voladizo", en: "verification-cantilever-column" },
};
