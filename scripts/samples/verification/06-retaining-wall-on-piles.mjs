// Verification model 6: retaining wall on piles, with a trapezoidal (earth) pressure on the face of the wall (thesis,
// chapter 3; dimensions from chapter 6). The wall is a plate in the XZ plane on a rectangular beam along its base, and the
// beam rests on circular piles centered under the wall. The piles are fixed at their tips.
import { createModel, L, ROW, PLOT_ROW } from "../model.mjs";

function build() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const r = (id) => [id, "result_out-value"];
  const zero = m.number(0, 0, L.origin, 0, undefined, "length");
  const length = m.number(0, ROW, { es: "Longitud del muro [m]", en: "Wall length [m]" }, 4, { min: 2, max: 10, step: 0.5 }, "length");
  const height = m.number(0, 2 * ROW, { es: "Altura del muro [m]", en: "Wall height [m]" }, 3.5, { min: 1.5, max: 8, step: 0.25 }, "length");
  const t = m.number(0, 3 * ROW, { es: "Espesor del muro [mm]", en: "Wall thickness [mm]" }, 700, { min: 200, max: 1200, step: 50 }, "section_length");
  const spacing = m.number(0, 4 * ROW, { es: "Separación pilotes [m]", en: "Pile spacing [m]" }, 2, { min: 0.5, max: 8, step: 0.1 }, "length");
  const pile_length = m.number(0, 5 * ROW, { es: "Longitud pilotes [m]", en: "Pile length [m]" }, 8, { min: 3, max: 20, step: 0.5 }, "length");
  const D = m.number(0, 6 * ROW, { es: "Diámetro pilotes [mm]", en: "Pile diameter [mm]" }, 700, { min: 300, max: 1500, step: 50 }, "section_length");
  const beam_b = m.number(0, 7 * ROW, { es: "Base viga b [mm]", en: "Beam width b [mm]" }, 1500, { min: 600, max: 3000, step: 100 }, "section_length");
  const beam_h = m.number(0, 8 * ROW, { es: "Altura viga h [mm]", en: "Beam depth h [mm]" }, 1200, { min: 400, max: 2000, step: 100 }, "section_length");
  const p = m.number(0, 9 * ROW, { es: "Presión en la base p [kPa]", en: "Pressure at the base p [kPa]" }, 20, { min: 0, max: 100, step: 1 }, "pressure");
  const p_top = m.number(0, 10 * ROW, { es: "Presión en la corona [kPa]", en: "Pressure at the top [kPa]" }, 0, undefined, "pressure");
  const half = m.number(0, 11 * ROW, { es: "Factor 0.5", en: "Factor 0.5" }, 0.5, undefined, "dimensionless");
  const minus_half = m.number(0, 12 * ROW, { es: "Factor -0.5", en: "Factor -0.5" }, -0.5, undefined, "dimensionless");
  const minus_one = m.number(0, 13 * ROW, { es: "Factor -1", en: "Factor -1" }, -1, undefined, "dimensionless");
  const material = m.concrete(14 * ROW, 14 * ROW);

  // Piles centered under the wall: x = L / 2 -+ s / 2, from the base of the wall down to z = -pile length
  const mid = m.math("multiplyNumbers", 1, 0, { es: "L / 2", en: "L / 2" }, v(length), v(half));
  const half_spacing = m.math("multiplyNumbers", 1, 120, { es: "s / 2", en: "s / 2" }, v(spacing), v(half));
  const minus_half_spacing = m.math("multiplyNumbers", 1, 240, { es: "-s / 2", en: "-s / 2" }, v(spacing), v(minus_half));
  const x_1 = m.math("sumNumbers", 1, 360, { es: "x pilote 1", en: "x pile 1" }, r(mid), r(minus_half_spacing));
  const x_2 = m.math("sumNumbers", 1, 480, { es: "x pilote 2", en: "x pile 2" }, r(mid), r(half_spacing));
  const tip_z = m.math("multiplyNumbers", 1, 600, { es: "z punta", en: "Tip z" }, v(pile_length), v(minus_one));

  // Wall corners (counterclockwise seen from -Y) and piles
  const A = m.point(2, 0, { es: "Muro base izquierda", en: "Wall bottom left" }, [v(zero), v(zero), v(zero)]);
  const B = m.point(2, 120, { es: "Muro base derecha", en: "Wall bottom right" }, [v(length), v(zero), v(zero)]);
  const C = m.point(2, 240, { es: "Muro corona derecha", en: "Wall top right" }, [v(length), v(zero), v(height)]);
  const Dn = m.point(2, 360, { es: "Muro corona izquierda", en: "Wall top left" }, [v(zero), v(zero), v(height)]);
  const head_1 = m.point(2, 480, { es: "Cabeza pilote 1", en: "Pile 1 head" }, [r(x_1), v(zero), v(zero)]);
  const head_2 = m.point(2, 600, { es: "Cabeza pilote 2", en: "Pile 2 head" }, [r(x_2), v(zero), v(zero)]);
  const tip_1 = m.point(2, 720, { es: "Punta pilote 1", en: "Pile 1 tip" }, [r(x_1), v(zero), r(tip_z)]);
  const tip_2 = m.point(2, 840, { es: "Punta pilote 2", en: "Pile 2 tip" }, [r(x_2), v(zero), r(tip_z)]);

  const beam_section = m.section(3, 14 * ROW, { es: "Sección viga", en: "Beam section" }, material, beam_b, beam_h);
  const pile_section = m.box("structuralCircularSection", 3, 14 * ROW + 140, { custom_label: { es: "Sección pilotes", en: "Pile section" } });
  m.wire(material, "material_out-id", pile_section, "material_id-id-1");
  m.wire(D, "value-value", pile_section, "diameter-value-1");

  const wall = m.plate(3, 0, { es: "Muro", en: "Wall" }, [A, B, C, Dn], t, material);
  const beam = m.member(3, 140, { es: "Viga de cimentación", en: "Foundation beam" }, A, B, beam_section);
  const pile_1 = m.member(3, 260, { es: "Pilote 1", en: "Pile 1" }, tip_1, head_1, pile_section);
  const pile_2 = m.member(3, 380, { es: "Pilote 2", en: "Pile 2" }, tip_2, head_2, pile_section);
  m.fixedSupport(3, 500, { es: "Empotramiento pilote 1", en: "Pile 1 fixed tip" }, tip_1);
  m.fixedSupport(3, 620, { es: "Empotramiento pilote 2", en: "Pile 2 fixed tip" }, tip_2);

  // Earth pressure along +Y: p at the base of the wall and nothing at its top (linear in between)
  const direction = m.text(3, 740, { es: "Dirección de la presión", en: "Pressure direction" }, "Y");
  const pressure = m.box("structuralTrapezoidalPressure", 4, 0, { custom_label: { es: "Empuje de tierras", en: "Earth pressure" } });
  m.wire(wall, "plate_out-id", pressure, "plate_id-id");
  m.wire(direction, "value-string", pressure, "load_direction-string-Z");
  [
    [Dn, p_top],
    [C, p_top],
    [A, p],
  ].forEach(([point, magnitude], i) => {
    m.wire(point, "node_out-id", pressure, `p${i + 1}_point_id-id`);
    m.wire(magnitude, "value-value", pressure, `p${i + 1}_magnitude-value`);
  });

  const pile_moment = m.memberResult(5, 0, { es: "Momento en los pilotes", en: "Pile bending moment" }, [pile_1, pile_2], "moment", "y");
  m.plot(6, 0, { es: "Momento en los pilotes", en: "Pile bending moment" }, pile_moment);
  const pile_drift = m.memberResult(5, PLOT_ROW, { es: "Desplazamiento de los pilotes", en: "Pile displacement" }, [pile_1, pile_2], "displacement", "y");
  m.plot(6, PLOT_ROW, { es: "Desplazamiento de los pilotes", en: "Pile displacement" }, pile_drift);
  // The earth pressure twists the foundation beam (moment about its axis, x)
  const beam_torsion = m.memberResult(5, 2 * PLOT_ROW, { es: "Torsión en la viga", en: "Beam torsion" }, [beam], "moment", "x");
  m.plot(6, 2 * PLOT_ROW, { es: "Torsión en la viga", en: "Beam torsion" }, beam_torsion);
  const reactions = m.nodeResult(5, 3 * PLOT_ROW, { es: "Reacciones horizontales", en: "Horizontal reactions" }, [tip_1, tip_2], "y");
  m.plot(6, 3 * PLOT_ROW, { es: "Reacciones horizontales", en: "Horizontal reactions" }, reactions);
  return m;
}

export default {
  id: "verification-retaining-wall-on-piles",
  build,
  title: { es: "Verificación 6: muro de contención sobre pilotes", en: "Verification 6: retaining wall on piles" },
  description: {
    es: "Modelo de verificación de la tesis: muro sobre una viga de cimentación y dos pilotes circulares empotrados en la punta, con un empuje de tierras trapezoidal en su cara.",
    en: "Thesis verification model: a wall on a foundation beam and two circular piles fixed at their tips, with a trapezoidal earth pressure on its face.",
  },
  tags: { es: ["Verificación", "Muro", "Placa"], en: ["Verification", "Wall", "Plate"] },
  // SkyCiv lumps the linear pressure on the mesh nodes (PyNite integrates it), with 0.25 m both agree within 0.3%
  settings: { global: { mesh_plates: true, mesh_size: 0.25 } },
};
