// Verification model 7: building of 5 levels, 5 spans along X (the main, longer direction) and 3 along Y, with shear walls
// in the border spans of the two long faces, an elevator core in the central bay, distributed loads on the beams (one
// value along X and another along Y, others on the roof) and a wind load on the columns of the windward face that grows
// linearly with the height (thesis, chapter 3; storey heights and sections from the building of chapter 6).
// PyNite and SkyCiv agree within 0.7% in displacements, reactions and the members away from the walls. The forces of the
// columns and beams along the edges of the walls differ up to 7%: they share the load with the wall through its in-plane
// (membrane) stiffness at the edge, which each engine's shell element models differently, and change with the mesh.
import { createModel, ROW, PLOT_ROW } from "../model.mjs";

const SPANS_X = 5;
const SPANS_Y = 3;
const LEVELS = 5;
// Box layout: rows of the repeated boxes and the first column of each group
const BOX_ROW = 120;
const COLUMNS = { inputs: 0, math: 1, nodes: 2, supports: 8, columns: 9, beams_x: 15, beams_y: 20, walls: 25, loads: 30, results: 37 };

function build() {
  const m = createModel();
  const v = (id) => [id, "value-value"];
  const r = (id) => [id, "result_out-value"];
  const number = (row, label, value, favorite, unit) => m.number(COLUMNS.inputs, row * ROW, label, value, favorite, unit);

  // Parameters
  const zero = number(0, { es: "Origen (0)", en: "Origin (0)" }, 0, undefined, "length");
  const Lx = number(1, { es: "Luz en X [m]", en: "Span along X [m]" }, 6, { min: 4, max: 9, step: 0.25 }, "length");
  const Ly = number(2, { es: "Luz en Y [m]", en: "Span along Y [m]" }, 5, { min: 4, max: 9, step: 0.25 }, "length");
  const H1 = number(3, { es: "Altura primer piso [m]", en: "First storey height [m]" }, 4, { min: 3, max: 6, step: 0.25 }, "length");
  const H = number(4, { es: "Altura de piso [m]", en: "Storey height [m]" }, 3.5, { min: 2.5, max: 5, step: 0.25 }, "length");
  const wx = number(5, { es: "Carga vigas en X [kN/m]", en: "Load on beams along X [kN/m]" }, -20, { min: -60, max: 0, step: 1 }, "distributed_force");
  const wy = number(6, { es: "Carga vigas en Y [kN/m]", en: "Load on beams along Y [kN/m]" }, -15, { min: -60, max: 0, step: 1 }, "distributed_force");
  const wx_roof = number(7, { es: "Carga vigas en X cubierta [kN/m]", en: "Roof load on beams along X [kN/m]" }, -12, { min: -60, max: 0, step: 1 }, "distributed_force");
  const wy_roof = number(8, { es: "Carga vigas en Y cubierta [kN/m]", en: "Roof load on beams along Y [kN/m]" }, -10, { min: -60, max: 0, step: 1 }, "distributed_force");
  const wind_base = number(9, { es: "Viento en la base [kN/m]", en: "Wind at the base [kN/m]" }, 2, { min: 0, max: 20, step: 0.5 }, "distributed_force");
  const wind_top = number(10, { es: "Viento en la cubierta [kN/m]", en: "Wind at the roof [kN/m]" }, 5, { min: 0, max: 20, step: 0.5 }, "distributed_force");
  const wall_t = number(11, { es: "Espesor muros [mm]", en: "Wall thickness [mm]" }, 250, { min: 150, max: 500, step: 25 }, "section_length");
  const core_t = number(12, { es: "Espesor núcleo [mm]", en: "Core thickness [mm]" }, 250, { min: 150, max: 500, step: 25 }, "section_length");
  const col_ext = number(13, { es: "Columnas perimetrales [mm]", en: "Perimeter columns [mm]" }, 400, undefined, "section_length");
  const col_int = number(14, { es: "Columnas interiores [mm]", en: "Interior columns [mm]" }, 500, undefined, "section_length");
  const beam_ext_b = number(15, { es: "Base vigas perimetrales [mm]", en: "Perimeter beam width [mm]" }, 350, undefined, "section_length");
  const beam_int_b = number(16, { es: "Base vigas interiores [mm]", en: "Interior beam width [mm]" }, 400, undefined, "section_length");
  const beam_h = number(17, { es: "Altura vigas [mm]", en: "Beam depth [mm]" }, 500, undefined, "section_length");
  const minus_one = number(18, { es: "Factor -1", en: "Factor -1" }, -1, undefined, "dimensionless");
  const factors = [];
  for (let i = 1; i <= Math.max(SPANS_X, LEVELS); i++) factors.push(number(18 + i, `${i}`, i, undefined, "dimensionless"));

  // Grid lines: x_i = i Lx, y_j = j Ly, z_k = H1 + (k - 1) H
  let math_row = 0;
  const math = (type, label, a, b) => m.math(type, COLUMNS.math, math_row++ * BOX_ROW, label, a, b);
  const xs = [v(zero), v(Lx)];
  for (let i = 2; i <= SPANS_X; i++) xs.push(r(math("multiplyNumbers", `x${i} = ${i} Lx`, v(Lx), v(factors[i - 1]))));
  const ys = [v(zero), v(Ly)];
  for (let j = 2; j <= SPANS_Y; j++) ys.push(r(math("multiplyNumbers", `y${j} = ${j} Ly`, v(Ly), v(factors[j - 1]))));
  const zs = [v(zero), v(H1)];
  for (let k = 2; k <= LEVELS; k++) {
    const above = math("multiplyNumbers", `${k - 1} H`, v(H), v(factors[k - 2]));
    zs.push(r(math("sumNumbers", `z${k} = H1 + ${k - 1} H`, v(H1), r(above))));
  }
  // Wind along the height: w(z) = w_base + (w_top - w_base) z / z_roof
  const minus_base = math("multiplyNumbers", "-w base", v(wind_base), v(minus_one));
  const increase = math("sumNumbers", "w top - w base", v(wind_top), r(minus_base));
  const slope = math("divideNumbers", { es: "Pendiente del viento", en: "Wind slope" }, r(increase), zs[LEVELS]);
  const winds = [v(wind_base)];
  for (let k = 1; k <= LEVELS; k++) {
    const rise = math("multiplyNumbers", `slope z${k}`, r(slope), zs[k]);
    winds.push(r(math("sumNumbers", `w(z${k})`, v(wind_base), r(rise))));
  }

  // Nodes, by level, x line and y line
  const nodes = [];
  for (let k = 0; k <= LEVELS; k++) {
    nodes.push([]);
    for (let i = 0; i <= SPANS_X; i++) {
      nodes[k].push([]);
      for (let j = 0; j <= SPANS_Y; j++) {
        const row = i * (SPANS_Y + 1) + j;
        nodes[k][i].push(m.point(COLUMNS.nodes + k, row * BOX_ROW, `N ${k}-${i}-${j}`, [xs[i], ys[j], zs[k]]));
      }
    }
  }

  // Material (its properties in the inputs column) and sections, under the math boxes
  const section_col = COLUMNS.math;
  const section_row = math_row * BOX_ROW + 60;
  const material = m.concrete(25 * ROW, section_row + 560);
  const perimeter_column = m.section(section_col, section_row, { es: "Columnas perimetrales", en: "Perimeter columns" }, material, col_ext, col_ext);
  const interior_column = m.section(section_col, section_row + 140, { es: "Columnas interiores", en: "Interior columns" }, material, col_int, col_int);
  const perimeter_beam = m.section(section_col, section_row + 280, { es: "Vigas perimetrales", en: "Perimeter beams" }, material, beam_ext_b, beam_h);
  const interior_beam = m.section(section_col, section_row + 420, { es: "Vigas interiores", en: "Interior beams" }, material, beam_int_b, beam_h);

  // Fixed bases
  for (let i = 0; i <= SPANS_X; i++) {
    for (let j = 0; j <= SPANS_Y; j++) {
      m.fixedSupport(COLUMNS.supports, (i * (SPANS_Y + 1) + j) * BOX_ROW, `Base ${i}-${j}`, nodes[0][i][j]);
    }
  }

  // Columns, from each level to the next (node A at the bottom)
  const on_perimeter = (i, j) => i === 0 || i === SPANS_X || j === 0 || j === SPANS_Y;
  const columns = [];
  for (let k = 0; k < LEVELS; k++) {
    columns.push([]);
    for (let i = 0; i <= SPANS_X; i++) {
      columns[k].push([]);
      for (let j = 0; j <= SPANS_Y; j++) {
        const section = on_perimeter(i, j) ? perimeter_column : interior_column;
        const row = i * (SPANS_Y + 1) + j;
        columns[k][i].push(m.member(COLUMNS.columns + k, row * BOX_ROW, `C ${k + 1}-${i}-${j}`, nodes[k][i][j], nodes[k + 1][i][j], section));
      }
    }
  }

  // Beams of each level, along X and along Y, with their loads
  const beams_x = [];
  let load_row = 0;
  const load = (member, w) => m.uniformLoad(COLUMNS.loads + Math.floor(load_row / 60), (load_row++ % 60) * 330, `w ${load_row}`, member, w);
  for (let k = 1; k <= LEVELS; k++) {
    beams_x.push([]);
    let row = 0;
    for (let j = 0; j <= SPANS_Y; j++) {
      for (let i = 0; i < SPANS_X; i++) {
        const section = j === 0 || j === SPANS_Y ? perimeter_beam : interior_beam;
        const beam = m.member(COLUMNS.beams_x + k - 1, row++ * BOX_ROW, `BX ${k}-${i}-${j}`, nodes[k][i][j], nodes[k][i + 1][j], section);
        beams_x[k - 1].push(beam);
        load(beam, k === LEVELS ? wx_roof : wx);
      }
    }
    row = 0;
    for (let i = 0; i <= SPANS_X; i++) {
      for (let j = 0; j < SPANS_Y; j++) {
        const section = i === 0 || i === SPANS_X ? perimeter_beam : interior_beam;
        const beam = m.member(COLUMNS.beams_y + k - 1, row++ * BOX_ROW, `BY ${k}-${i}-${j}`, nodes[k][i][j], nodes[k][i][j + 1], section);
        load(beam, k === LEVELS ? wy_roof : wy);
      }
    }
  }

  // Wind on the columns of the windward face (y = 0), along +Y: from w(z_k) at the bottom of each column to w(z_k+1)
  let wind_row = 0;
  for (let k = 0; k < LEVELS; k++) {
    for (let i = 0; i <= SPANS_X; i++) {
      const wind = m.box("structuralDistributedLoad", COLUMNS.loads + 4, wind_row++ * 330, { custom_label: `Wind ${k + 1}-${i}` });
      m.wire(columns[k][i][0], "member_out-id", wind, "member-id");
      m.wire(winds[k][0], winds[k][1], wind, "y_mag_A-value");
      m.wire(winds[k + 1][0], winds[k + 1][1], wind, "y_mag_B-value");
    }
  }

  // Walls of each storey: in the border spans of the long faces (along X), and the four walls of the core around the
  // central bay
  const core_i = Math.floor(SPANS_X / 2);
  const core_j = Math.floor(SPANS_Y / 2);
  let wall_row = 0;
  const wall = (k, [i1, j1], [i2, j2], thickness, label) =>
    m.plate(COLUMNS.walls + Math.floor(wall_row / 20), (wall_row++ % 20) * BOX_ROW, label, [nodes[k][i1][j1], nodes[k][i2][j2], nodes[k + 1][i2][j2], nodes[k + 1][i1][j1]], thickness, material);
  for (let k = 0; k < LEVELS; k++) {
    for (const j of [0, SPANS_Y]) {
      wall(k, [0, j], [1, j], wall_t, `Wall ${k + 1} x0 y${j}`);
      wall(k, [SPANS_X - 1, j], [SPANS_X, j], wall_t, `Wall ${k + 1} x${SPANS_X - 1} y${j}`);
    }
    wall(k, [core_i, core_j], [core_i + 1, core_j], core_t, `Core ${k + 1} south`);
    wall(k, [core_i + 1, core_j], [core_i + 1, core_j + 1], core_t, `Core ${k + 1} east`);
    wall(k, [core_i + 1, core_j + 1], [core_i, core_j + 1], core_t, `Core ${k + 1} north`);
    wall(k, [core_i, core_j + 1], [core_i, core_j], core_t, `Core ${k + 1} west`);
  }

  // Results: drift of a windward corner column line, base reactions along the wind and moments of the first floor beams
  const corner_line = columns.map((level) => level[0][0]);
  const drift = m.memberResult(COLUMNS.results, 0, { es: "Deriva columna esquina", en: "Corner column drift" }, corner_line, "displacement", "y");
  m.plot(COLUMNS.results + 1, 0, { es: "Deriva columna esquina", en: "Corner column drift" }, drift);
  const bases = nodes[0].flat();
  const base_shear = m.nodeResult(COLUMNS.results, PLOT_ROW, { es: "Reacciones en Y", en: "Reactions along Y" }, bases, "y");
  m.plot(COLUMNS.results + 1, PLOT_ROW, { es: "Reacciones en Y", en: "Reactions along Y" }, base_shear);
  const axial = m.nodeResult(COLUMNS.results, 2 * PLOT_ROW, { es: "Reacciones verticales", en: "Vertical reactions" }, bases, "z");
  m.plot(COLUMNS.results + 1, 2 * PLOT_ROW, { es: "Reacciones verticales", en: "Vertical reactions" }, axial);
  const moment = m.memberResult(COLUMNS.results, 3 * PLOT_ROW, { es: "Momento vigas en X piso 1", en: "Level 1 X beam moments" }, beams_x[0], "moment", "z");
  m.plot(COLUMNS.results + 1, 3 * PLOT_ROW, { es: "Momento vigas en X piso 1", en: "Level 1 X beam moments" }, moment);
  return m;
}

export default {
  id: "verification-building",
  build,
  title: { es: "Verificación 7: edificio de 5 niveles", en: "Verification 7: 5 storey building" },
  description: {
    es: "Modelo de verificación de la tesis: 5 niveles, 5 luces en X y 3 en Y, muros en los vanos extremos de las fachadas largas, núcleo de ascensores, cargas en las vigas y viento en las columnas.",
    en: "Thesis verification model: 5 levels, 5 spans along X and 3 along Y, walls in the end spans of the long faces, an elevator core, loads on the beams and wind on the columns.",
  },
  tags: { es: ["Verificación", "Edificio", "Placa"], en: ["Verification", "Building", "Plate"] },
  // Its post in the Verification category of the paramele-site blog
  tutorial: { es: "verificacion-edificio-de-5-niveles", en: "verification-5-storey-building" },
  settings: { global: { mesh_plates: true, mesh_size: 1 } },
};
