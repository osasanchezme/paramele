// Verification model 1: simply supported beam with a gravity distributed load (thesis, chapter 3)
import { createModel, L, ROW, PLOT_ROW } from "../model.mjs";

function build() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const zero = m.number(0, 0, L.origin, 0, undefined, "length");
  const span = m.number(0, ROW, { es: "Luz L [m]", en: "Span L [m]" }, 6, { min: 3, max: 12, step: 0.5 }, "length");
  const w = m.number(0, 2 * ROW, L.w, -20, { min: -60, max: 0, step: 1 }, "distributed_force");

  const A = m.point(1, 0, { es: "Nodo A", en: "Node A" }, [v(zero), v(zero), v(zero)]);
  const B = m.point(1, 120, { es: "Nodo B", en: "Node B" }, [v(span), v(zero), v(zero)]);

  const material = m.concrete(300, 300);
  const b = m.number(1, 460, { es: "Base b [mm]", en: "Width b [mm]" }, 300, { min: 200, max: 600, step: 50 }, "section_length");
  const h = m.number(1, 460 + ROW, { es: "Altura h [mm]", en: "Depth h [mm]" }, 500, { min: 250, max: 900, step: 50 }, "section_length");
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
  const shear = m.memberResult(5, PLOT_ROW, { es: "Cortante", en: "Shear" }, [beam], "shear", "y");
  m.plot(6, PLOT_ROW, { es: "Cortante", en: "Shear" }, shear);
  const deflection = m.memberResult(5, 2 * PLOT_ROW, L.deflection, [beam], "displacement", "z");
  m.plot(6, 2 * PLOT_ROW, L.deflection, deflection);
  const reactions = m.nodeResult(5, 3 * PLOT_ROW, L.reactions, [A, B], "z");
  m.plot(6, 3 * PLOT_ROW, L.reactions, reactions);
  return m;
}

export default {
  id: "verification-simply-supported-beam",
  build,
  title: { es: "Verificación 1: viga simplemente apoyada", en: "Verification 1: simply supported beam" },
  description: {
    es: "Modelo de verificación de la tesis: una luz con carga distribuida gravitacional, articulación y rodillo. Momento, cortante, deflexión y reacciones.",
    en: "Thesis verification model: one span with a gravity distributed load, a pin and a roller. Moment, shear, deflection and reactions.",
  },
  tags: { es: ["Verificación", "Viga"], en: ["Verification", "Beam"] },
  // Its post in the Verification category of the paramele-site blog
  tutorial: { es: "verificacion-viga-simplemente-apoyada", en: "verification-simply-supported-beam" },
};
