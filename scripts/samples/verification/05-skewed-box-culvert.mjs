// Verification model 5: skewed box culvert on soil, with gravity pressures on its top slab (thesis, chapter 3).
// One cell along Y: two walls (x = 0 and x = B) and two slabs, the ends cut parallel to the road, which crosses at the skew
// angle (the slabs are parallelograms). Dimensions between the axes of the walls and slabs. The bottom slab is on soil: a
// mesh box meshes it and a surface spring support puts a spring ks · A on each of its nodes (FFSRRR: vertical springs, the
// soil holds it in its plane). The fill (1.5 m at 19 kN/m³) and a traffic surcharge load the top slab.
import { createModel, L, ROW } from "../model.mjs";

function build() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const r = (id) => [id, "result_out-value"];
  const zero = m.number(0, 0, L.origin, 0, undefined, "length");
  const span = m.number(0, ROW, { es: "Luz entre ejes de muros [m]", en: "Span between wall axes [m]" }, 3.3, { min: 1.5, max: 6, step: 0.1 }, "length");
  const height = m.number(0, 2 * ROW, { es: "Altura entre ejes de losas [m]", en: "Height between slab axes [m]" }, 2.7, { min: 1.5, max: 5, step: 0.1 }, "length");
  const length = m.number(0, 3 * ROW, { es: "Longitud (eje Y) [m]", en: "Length (Y axis) [m]" }, 8, { min: 4, max: 20, step: 0.5 }, "length");
  const skew = m.number(0, 4 * ROW, { es: "Ángulo de esviaje [°]", en: "Skew angle [°]" }, 30, { min: 0, max: 45, step: 5 }, "angle");
  const t_top = m.number(0, 5 * ROW, { es: "Espesor losa superior [mm]", en: "Top slab thickness [mm]" }, 300, { min: 200, max: 600, step: 25 }, "section_length");
  const t_wall = m.number(0, 6 * ROW, { es: "Espesor muros [mm]", en: "Wall thickness [mm]" }, 300, { min: 200, max: 600, step: 25 }, "section_length");
  const t_bottom = m.number(0, 7 * ROW, { es: "Espesor losa inferior [mm]", en: "Bottom slab thickness [mm]" }, 350, { min: 200, max: 600, step: 25 }, "section_length");
  const fill = m.number(0, 8 * ROW, { es: "Presión del relleno [kPa]", en: "Fill pressure [kPa]" }, -28.5, { min: -100, max: 0, step: 0.5 }, "pressure");
  const traffic = m.number(0, 9 * ROW, { es: "Sobrecarga vehicular [kPa]", en: "Traffic surcharge [kPa]" }, -10, { min: -50, max: 0, step: 1 }, "pressure");
  const ks = m.number(0, 10 * ROW, { es: "Módulo de balasto ks [kN/m³]", en: "Subgrade modulus ks [kN/m³]" }, 30000, { min: 5000, max: 120000, step: 1000 }, "subgrade_modulus");
  const mesh_size = m.number(0, 11 * ROW, { es: "Tamaño de malla losa inferior [m]", en: "Bottom slab mesh size [m]" }, 0.5, undefined, "length");
  const material = m.concrete(12 * ROW, 12 * ROW);

  // Skew offset along Y of the wall x = B: B tan(skew)
  const skew_rad = m.box("deg2rad", 1, 0, { custom_label: { es: "Esviaje [rad]", en: "Skew [rad]" } });
  m.wire(skew, "value-value", skew_rad, "num-value");
  const tangent = m.box("tan", 1, 120, { custom_label: { es: "tan(esviaje)", en: "tan(skew)" } });
  m.wire(skew_rad, "result_out-value", tangent, "num-value");
  const offset = m.math("multiplyNumbers", 1, 240, { es: "Desfase B tan(esviaje)", en: "Offset B tan(skew)" }, v(span), r(tangent));
  const far_end = m.math("sumNumbers", 1, 360, { es: "Desfase + longitud", en: "Offset + length" }, r(offset), v(length));

  // Corners: wall x = 0 from y = 0 to L, wall x = B shifted by the offset; bottom (z = 0) and top (z = H)
  const corner = (row, label, x, y, z) => m.point(2, row * 120, label, [x, y, z]);
  const A0 = corner(0, { es: "Esquina A inferior", en: "Corner A bottom" }, v(zero), v(zero), v(zero));
  const B0 = corner(1, { es: "Esquina B inferior", en: "Corner B bottom" }, v(span), r(offset), v(zero));
  const C0 = corner(2, { es: "Esquina C inferior", en: "Corner C bottom" }, v(span), r(far_end), v(zero));
  const D0 = corner(3, { es: "Esquina D inferior", en: "Corner D bottom" }, v(zero), v(length), v(zero));
  const A1 = corner(4, { es: "Esquina A superior", en: "Corner A top" }, v(zero), v(zero), v(height));
  const B1 = corner(5, { es: "Esquina B superior", en: "Corner B top" }, v(span), r(offset), v(height));
  const C1 = corner(6, { es: "Esquina C superior", en: "Corner C top" }, v(span), r(far_end), v(height));
  const D1 = corner(7, { es: "Esquina D superior", en: "Corner D top" }, v(zero), v(length), v(height));

  const bottom = m.plate(3, 0, { es: "Losa inferior", en: "Bottom slab" }, [A0, B0, C0, D0], t_bottom, material);
  m.plate(3, 140, { es: "Muro x = 0", en: "Wall x = 0" }, [A0, D0, D1, A1], t_wall, material);
  m.plate(3, 280, { es: "Muro x = B", en: "Wall x = B" }, [B0, C0, C1, B1], t_wall, material);
  const top = m.plate(3, 420, { es: "Losa superior", en: "Top slab" }, [A1, B1, C1, D1], t_top, material);
  m.pressure(4, 420, { es: "Relleno", en: "Fill" }, top, fill);
  m.pressure(4, 600, { es: "Sobrecarga vehicular", en: "Traffic surcharge" }, top, traffic);

  // Soil under the bottom slab
  const mesh = m.box("structuralMesh", 4, 0, { custom_label: { es: "Malla losa inferior", en: "Bottom slab mesh" } });
  m.wire(bottom, "plate_out-id", mesh, "plates-ids");
  m.wire(mesh_size, "value-value", mesh, "mesh_size-value");
  const soil = m.box("structuralSurfaceSupport", 4, 140, { custom_label: { es: "Suelo de fundación", en: "Foundation soil" } });
  m.wire(mesh, "mesh_out-mesh", soil, "mesh-mesh");
  m.wire(ks, "value-value", soil, "ks-value");

  const reactions = m.box("structuralNodeResult", 5, 0, {
    custom_label: { es: "Reacciones del suelo", en: "Soil reactions" },
    "result-value": "reaction",
    "direction-value": "z",
  });
  m.wire(mesh, "node_list_out-ids", reactions, "nodes-ids");
  m.plot(6, 0, { es: "Reacciones del suelo", en: "Soil reactions" }, reactions);
  return m;
}

export default {
  id: "verification-skewed-box-culvert",
  build,
  title: { es: "Verificación 5: box-culvert con esviaje", en: "Verification 5: skewed box culvert" },
  description: {
    es: "Modelo de verificación de la tesis: alcantarilla de una celda con esviaje, apoyada sobre el suelo (módulo de balasto, apoyo elástico de superficie en la losa inferior), con el relleno y una sobrecarga vehicular sobre la losa superior.",
    en: "Thesis verification model: a one-cell skewed culvert resting on soil (subgrade modulus, surface spring support under the bottom slab), with the fill and a traffic surcharge on the top slab.",
  },
  tags: { es: ["Verificación", "Placa", "Suelo"], en: ["Verification", "Plate", "Soil"] },
  // The walls and the top slab take the global mesh size, the bottom slab the one of its mesh box
  settings: { global: { mesh_plates: true, mesh_size: 0.5 } },
};
