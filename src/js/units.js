// Units of the model. Each quantity of the settings (length, force...) is given a unit by the user from one unit system, so
// metric and imperial units are never mixed. The units of the boxes are written as powers of these quantities (a moment is
// force·length), so they follow the units of the model and a value can be converted when the units change.

const SI_TOLERANCE = 1e-9;

/**
 * Units each quantity of the settings can take, by unit system. `factor` converts to SI (N, m, kg, rad)
 * @type {Object<string, {dimension: Object<string, number>, units: Object<string, {label: string, factor: number, system: string|null}>}>}
 */
const BASE_QUANTITIES = {
  length: {
    dimension: { L: 1 },
    units: {
      m: { label: "m", factor: 1, system: "metric" },
      cm: { label: "cm", factor: 0.01, system: "metric" },
      mm: { label: "mm", factor: 0.001, system: "metric" },
      ft: { label: "ft", factor: 0.3048, system: "imperial" },
      in: { label: "in", factor: 0.0254, system: "imperial" },
    },
  },
  force: {
    dimension: { F: 1 },
    units: {
      n: { label: "N", factor: 1, system: "metric" },
      kn: { label: "kN", factor: 1e3, system: "metric" },
      kgf: { label: "kgf", factor: 9.80665, system: "metric" },
      tonf: { label: "tonf", factor: 9806.65, system: "metric" },
      lbf: { label: "lbf", factor: 4.4482216152605, system: "imperial" },
      kip: { label: "kip", factor: 4448.2216152605, system: "imperial" },
    },
  },
  stress: {
    dimension: { F: 1, L: -2 },
    units: {
      pa: { label: "Pa", factor: 1, system: "metric" },
      kpa: { label: "kPa", factor: 1e3, system: "metric" },
      mpa: { label: "MPa", factor: 1e6, system: "metric" },
      gpa: { label: "GPa", factor: 1e9, system: "metric" },
      "kgf/cm2": { label: "kgf/cm²", factor: 98066.5, system: "metric" },
      "tonf/m2": { label: "tonf/m²", factor: 9806.65, system: "metric" },
      psf: { label: "psf", factor: 47.880258980336, system: "imperial" },
      ksf: { label: "ksf", factor: 47880.258980336, system: "imperial" },
      psi: { label: "psi", factor: 6894.7572931684, system: "imperial" },
      ksi: { label: "ksi", factor: 6894757.2931684, system: "imperial" },
    },
  },
  density: {
    dimension: { M: 1, L: -3 },
    units: {
      "kg/m3": { label: "kg/m³", factor: 1, system: "metric" },
      "ton/m3": { label: "t/m³", factor: 1000, system: "metric" },
      "lb/ft3": { label: "lb/ft³", factor: 16.01846337396, system: "imperial" },
    },
  },
  angle: {
    // Radians are dimensionless, so an angle can go into any number (the trigonometric boxes take radians)
    dimension: {},
    units: {
      deg: { label: "°", factor: Math.PI / 180, system: null },
      rad: { label: "rad", factor: 1, system: null },
    },
  },
};

/**
 * Quantities the user gives a unit to (Settings > Units), with the kind of units they take
 * @type {Object<string, string>}
 */
const SETTING_QUANTITIES = {
  length: "length",
  section_length: "length",
  translation: "length",
  force: "force",
  pressure: "stress",
  material_strength: "stress",
  density: "density",
  angle: "angle",
};

const SYSTEM_DEFAULTS = {
  metric: {
    system: "metric",
    length: "m",
    section_length: "mm",
    translation: "mm",
    force: "kn",
    pressure: "kpa",
    material_strength: "mpa",
    density: "kg/m3",
    angle: "deg",
  },
  imperial: {
    system: "imperial",
    length: "ft",
    section_length: "in",
    translation: "in",
    force: "kip",
    pressure: "ksf",
    material_strength: "ksi",
    density: "lb/ft3",
    angle: "deg",
  },
};
const SYSTEMS = Object.keys(SYSTEM_DEFAULTS);

// Units the solvers and the exports get the structure in (the units ParamEle always used)
const SOLVER_UNITS = SYSTEM_DEFAULTS.metric;

/**
 * Quantities the boxes and the structure use, as powers of the setting quantities
 * @type {Object<string, Object<string, number>>}
 */
const QUANTITIES = {
  dimensionless: {},
  length: { length: 1 },
  section_length: { section_length: 1 },
  translation: { translation: 1 },
  area: { length: 2 },
  section_area: { section_length: 2 },
  inertia: { section_length: 4 },
  force: { force: 1 },
  moment: { force: 1, length: 1 },
  distributed_force: { force: 1, length: -1 },
  pressure: { pressure: 1 },
  material_strength: { material_strength: 1 },
  density: { density: 1 },
  angle: { angle: 1 },
};
// Quantities a number box can be given, in the order they are offered
const PICKABLE_QUANTITIES = [
  "length",
  "section_length",
  "force",
  "moment",
  "distributed_force",
  "pressure",
  "material_strength",
  "density",
  "angle",
  "area",
];

/**
 * @param {Object<string, number>} terms
 * @param {number} [scale]
 * @param {string} [quantity]
 * @returns {import("./types").ParamEleUnit}
 */
function makeUnit(terms, scale = 1, quantity) {
  let clean = {};
  Object.entries(terms).forEach(([key, power]) => {
    if (Math.abs(power) > SI_TOLERANCE) clean[key] = power;
  });
  let unit = { terms: clean, scale };
  if (quantity) unit.quantity = quantity;
  return unit;
}

const DIMENSIONLESS = makeUnit({});
// Units that do not follow the settings (the trigonometric boxes always work in radians), with how they are written
const FIXED_UNITS = {
  rad: { ...makeUnit({}), label: "rad" },
  deg: { ...makeUnit({}, Math.PI / 180), label: "°" },
  percent: { ...makeUnit({}), label: "%" },
};

/**
 * Unit of a quantity (see QUANTITIES) or of a fixed unit ("unit:rad")
 * @param {string} declaration
 * @returns {import("./types").ParamEleUnit}
 */
function getQuantityUnit(declaration) {
  if (declaration.startsWith("unit:")) return FIXED_UNITS[declaration.slice(5)] || DIMENSIONLESS;
  if (!QUANTITIES[declaration]) throw new Error(`Unknown quantity ${declaration}`);
  return makeUnit(QUANTITIES[declaration], 1, declaration);
}

function multiplyUnits(a, b, power_b = 1) {
  let terms = { ...a.terms };
  Object.entries(b.terms).forEach(([key, power]) => (terms[key] = (terms[key] || 0) + power * power_b));
  return makeUnit(terms, a.scale * b.scale ** power_b);
}

function powerUnit(a, power) {
  let terms = {};
  Object.entries(a.terms).forEach(([key, value]) => (terms[key] = value * power));
  return makeUnit(terms, a.scale ** power);
}

function isDimensionless(unit) {
  return Object.keys(getDimension(unit)).length === 0;
}

/**
 * Physical dimension of a unit, e.g. {F: 1, L: -2} for a pressure
 * @param {import("./types").ParamEleUnit} unit
 */
function getDimension(unit) {
  let dimension = {};
  Object.entries(unit.terms).forEach(([key, power]) => {
    Object.entries(BASE_QUANTITIES[SETTING_QUANTITIES[key]].dimension).forEach(([base, base_power]) => {
      dimension[base] = (dimension[base] || 0) + base_power * power;
    });
  });
  Object.keys(dimension).forEach((base) => {
    if (Math.abs(dimension[base]) < SI_TOLERANCE) delete dimension[base];
  });
  return dimension;
}

function haveSameDimension(a, b) {
  let dimension_a = getDimension(a);
  let dimension_b = getDimension(b);
  let keys = new Set([...Object.keys(dimension_a), ...Object.keys(dimension_b)]);
  return [...keys].every((key) => Math.abs((dimension_a[key] || 0) - (dimension_b[key] || 0)) < SI_TOLERANCE);
}

function getUnitDefinition(setting_key, unit_key) {
  return BASE_QUANTITIES[SETTING_QUANTITIES[setting_key]]?.units[unit_key];
}

/**
 * Factor from a unit, in the given model units, to SI
 * @param {import("./types").ParamEleUnit} unit
 * @param {object} model_units Settings units
 */
function getFactor(unit, model_units) {
  let factor = unit.scale;
  Object.entries(unit.terms).forEach(([key, power]) => {
    let definition = getUnitDefinition(key, model_units[key]) || getUnitDefinition(key, SOLVER_UNITS[key]);
    factor *= definition.factor ** power;
  });
  return factor;
}

/**
 * Factor that converts a value in unit `from` to unit `to` (both in the same model units)
 * @param {import("./types").ParamEleUnit} from
 * @param {import("./types").ParamEleUnit} to
 * @param {object} model_units
 */
function getConversionFactor(from, to, model_units) {
  return getFactor(from, model_units) / getFactor(to, model_units);
}

/**
 * Factor that converts a value of a unit from some model units to others (e.g. 1 m in ft when the length goes from m to ft)
 * @param {import("./types").ParamEleUnit} unit
 * @param {object} from_units
 * @param {object} to_units
 */
function getChangeFactor(unit, from_units, to_units) {
  return getFactor(unit, from_units) / getFactor(unit, to_units);
}

// Largest relative error a converted value is rounded by
const ROUNDING_TOLERANCE = 1e-9;

/**
 * A converted number with the fewest significant digits that keep it within ROUNDING_TOLERANCE, so it is written short
 * (1.640419948 ft for 0.5 m) and converting it back lands on the number it came from (0.5000000002 m is 0.5 m)
 * @param {number} value
 * @returns {number}
 */
function roundConverted(value) {
  if (!Number.isFinite(value) || value === 0) return value;
  for (let digits = 1; digits < 17; digits++) {
    const rounded = Number(value.toPrecision(digits));
    if (Math.abs(rounded - value) <= ROUNDING_TOLERANCE * Math.abs(value)) return rounded;
  }
  return value;
}

/**
 * Factor of a quantity from some model units to others
 * @param {string} quantity
 * @param {object} from_units
 * @param {object} to_units
 */
function convertQuantity(value, quantity, from_units, to_units) {
  return value * getChangeFactor(getQuantityUnit(quantity), from_units, to_units);
}

const SUPERSCRIPTS = { "-": "⁻", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", 0: "⁰", ".": "·" };
const superscript = (power) =>
  String(Number(power.toFixed(3)))
    .split("")
    .map((character) => SUPERSCRIPTS[character] || character)
    .join("");

/**
 * How a unit is written in the model units, e.g. "kN·m" or "kN/m²"
 * @param {import("./types").ParamEleUnit} unit
 * @param {object} model_units
 * @returns {string} Empty for dimensionless units
 */
function formatUnit(unit, model_units) {
  if (!unit) return "";
  if (unit.label) return unit.label;
  if (Object.keys(unit.terms).length === 0) {
    if (Math.abs(unit.scale - Math.PI / 180) < SI_TOLERANCE) return "°";
    return "";
  }
  // The same unit of several quantities is written once (length·length is m²)
  let by_label = {};
  let order = ["force", "pressure", "material_strength", "density", "length", "section_length", "translation", "angle"];
  Object.keys(unit.terms)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .forEach((key) => {
      let label = getUnitDefinition(key, model_units[key])?.label || model_units[key] || key;
      by_label[label] = (by_label[label] || 0) + unit.terms[key];
    });
  let numerator = [];
  let denominator = [];
  Object.entries(by_label).forEach(([label, power]) => {
    if (Math.abs(power) < SI_TOLERANCE) return;
    let target = power > 0 ? numerator : denominator;
    let absolute = Math.abs(power);
    target.push(Math.abs(absolute - 1) < SI_TOLERANCE ? label : `${label}${superscript(absolute)}`);
  });
  let text = numerator.length > 0 ? numerator.join("·") : "1";
  if (denominator.length > 0) text += `/${denominator.join("·")}`;
  return text;
}

/**
 * Label of a unit of the settings, e.g. "kN" for "kn"
 * @param {string} setting_key
 * @param {string} unit_key
 */
function getUnitLabel(setting_key, unit_key) {
  return getUnitDefinition(setting_key, unit_key)?.label || unit_key || "";
}

/**
 * Units each setting quantity can take in a unit system
 * @param {string} setting_key
 * @param {string} system
 * @returns {string[]}
 */
function getUnitOptions(setting_key, system) {
  let units = BASE_QUANTITIES[SETTING_QUANTITIES[setting_key]].units;
  return Object.keys(units).filter((unit_key) => units[unit_key].system === null || units[unit_key].system === system);
}

/**
 * Valid units of a model: the defaults of its system for the missing or invalid ones, so units from different systems are never mixed
 * @param {object} [model_units]
 * @returns {object}
 */
function repairUnits(model_units) {
  let system = SYSTEMS.includes(model_units?.system) ? model_units.system : "metric";
  let units = { ...SYSTEM_DEFAULTS[system] };
  Object.keys(SETTING_QUANTITIES).forEach((key) => {
    let unit_key = model_units?.[key];
    if (unit_key && getUnitOptions(key, system).includes(unit_key)) units[key] = unit_key;
  });
  return units;
}

/**
 * Units of a S3D model as units of the catalog, whatever their system. The ones that are missing or unknown are left out
 * @param {object} s3d_units
 * @returns {object}
 */
function readS3DUnits(s3d_units) {
  let aliases = { inch: "in", lb: "lbf", kips: "kip", "kn/m2": "kpa", "n/m2": "pa", "n/mm2": "mpa", "lb/in2": "psi", "kip/in2": "ksi" };
  let read_units = {};
  if (!s3d_units || typeof s3d_units !== "object") return read_units;
  ["length", "section_length", "translation", "force", "pressure", "material_strength", "density"].forEach((key) => {
    let value = String(s3d_units[key] ?? (key === "material_strength" ? s3d_units.stress ?? "" : "")).toLowerCase();
    value = aliases[value] || value;
    if (getUnitDefinition(key, value)) read_units[key] = value;
  });
  return read_units;
}

/**
 * Units of the model from the units of a S3D model, null when they cannot be read. The units from another system than the
 * length (or missing) take the default of its system
 * @param {object} s3d_units
 * @returns {object|null}
 */
function fromS3DUnits(s3d_units) {
  let read_units = readS3DUnits(s3d_units);
  if (!read_units.length) return null;
  return repairUnits({ ...read_units, system: getUnitDefinition("length", read_units.length).system, angle: "deg" });
}

/**
 * Units of the model as S3D writes them in `settings.units`
 * @param {object} model_units
 */
function toS3DUnits(model_units) {
  let units = repairUnits(model_units);
  let imperial = units.system === "imperial";
  return {
    length: units.length,
    section_length: units.section_length,
    material_strength: units.material_strength,
    density: units.density,
    force: units.force,
    moment: `${units.force}-${units.length}`,
    pressure: units.pressure,
    mass: imperial ? "lb" : "kg",
    temperature: imperial ? "degf" : "degc",
    translation: units.translation,
    stress: units.material_strength,
  };
}

// Values of the S3D structure by quantity. Each entry is [group, keys, quantity]
const STRUCTURE_FIELDS = [
  ["nodes", ["x", "y", "z"], "length"],
  ["members", ["offset_Ax", "offset_Ay", "offset_Az", "offset_Bx", "offset_By", "offset_Bz"], "length"],
  ["plates", ["thickness", "membrane_thickness", "shear_thickness", "bending_thickness"], "section_length"],
  ["sections", ["area", "A"], "section_area"],
  ["sections", ["Iz", "Iy", "J"], "inertia"],
  ["materials", ["density"], "density"],
  ["materials", ["elasticity_modulus", "yield_strength", "ultimate_strength"], "material_strength"],
  ["point_loads", ["x_mag", "y_mag", "z_mag"], "force"],
  ["moments", ["x_mag", "y_mag", "z_mag"], "moment"],
  ["distributed_loads", ["x_mag_A", "y_mag_A", "z_mag_A", "x_mag_B", "y_mag_B", "z_mag_B"], "distributed_force"],
  ["pressures", ["x_mag", "y_mag", "z_mag", "p1_magnitude", "p2_magnitude", "p3_magnitude"], "pressure"],
  ["area_loads", ["mag"], "pressure"],
  ["settlements", ["tx", "ty", "tz"], "translation"],
];

/**
 * Converts the values of a S3D structure between model units (a copy, `settings.units` is set to the new units)
 * @param {object} structure
 * @param {object} from_units Model units the structure is in
 * @param {object} to_units
 * @returns {object}
 */
function convertStructure(structure, from_units, to_units) {
  let converted = JSON.parse(JSON.stringify(structure));
  let convertValue = (value, quantity) => {
    if (value === null || value === undefined || value === "") return value;
    let number = Number(value);
    if (!Number.isFinite(number) || number === 0) return value;
    let result = convertQuantity(number, quantity, from_units, to_units);
    return typeof value === "string" ? String(result) : result;
  };
  STRUCTURE_FIELDS.forEach(([group, keys, quantity]) => {
    Object.values(converted[group] || {}).forEach((element) => {
      keys.forEach((key) => {
        if (key in element) element[key] = convertValue(element[key], quantity);
      });
    });
  });
  Object.values(converted.sections || {}).forEach((section) => {
    let dimensions = section?.info?.dimensions;
    if (!dimensions) return;
    Object.keys(dimensions).forEach((key) => (dimensions[key] = convertValue(dimensions[key], "section_length")));
  });
  // Positions of distributed loads given as a length instead of a percentage of the member
  Object.values(converted.distributed_loads || {}).forEach((load) => {
    if (load.position_units && load.position_units !== "percentage")
      ["position_A", "position_B"].forEach((key) => (load[key] = convertValue(load[key], "length")));
  });
  converted.settings = { ...(converted.settings || {}), units: toS3DUnits(to_units) };
  return converted;
}

const S3D_ALIASES = { inch: "in", lb: "lbf", kips: "kip" };

/**
 * Factor to SI of a unit written as in S3D, e.g. "kn-m", "kn/m2" or "mm"
 * @param {string} unit_string
 * @returns {number|null} null when a part of it is unknown
 */
function getS3DUnitFactor(unit_string) {
  let [numerator, denominator] = String(unit_string || "")
    .toLowerCase()
    .split("/");
  let factor = 1;
  let ok = true;
  let applyPart = (part, sign) => {
    part.split(/[-*]/).forEach((atom) => {
      if (!atom) return;
      let definition = Object.values(BASE_QUANTITIES)
        .map(({ units }) => units[atom] || units[S3D_ALIASES[atom]])
        .find(Boolean);
      let power = 1;
      if (!definition) {
        let match = atom.match(/^([a-z]+)(\d+)$/);
        if (match) {
          definition = Object.values(BASE_QUANTITIES)
            .map(({ units }) => units[match[1]] || units[S3D_ALIASES[match[1]]])
            .find(Boolean);
          power = Number(match[2]);
        }
      }
      if (!definition) ok = false;
      else factor *= definition.factor ** (power * sign);
    });
  };
  applyPart(numerator || "", 1);
  if (denominator) applyPart(denominator, -1);
  return ok && String(unit_string || "") !== "" ? factor : null;
}

/**
 * Factor from a result in a S3D unit (as the solvers return them) to a quantity in the model units
 * @param {string} result_unit e.g. "kn-m"
 * @param {string} quantity
 * @param {object} model_units
 */
function getResultFactor(result_unit, quantity, model_units) {
  let from = getS3DUnitFactor(result_unit);
  if (from === null) return 1;
  return from / getFactor(getQuantityUnit(quantity), model_units);
}

/**
 * Model units of a S3D structure in ParamEle, from its `settings.units`
 * @param {object} structure
 */
function getStructureUnits(structure) {
  return fromS3DUnits(structure?.settings?.units) || SOLVER_UNITS;
}

const units = {
  SYSTEMS,
  SYSTEM_DEFAULTS,
  SOLVER_UNITS,
  SETTING_QUANTITIES,
  QUANTITIES,
  PICKABLE_QUANTITIES,
  DIMENSIONLESS,
  getQuantityUnit,
  multiplyUnits,
  powerUnit,
  isDimensionless,
  getDimension,
  haveSameDimension,
  getFactor,
  getConversionFactor,
  getChangeFactor,
  convertQuantity,
  roundConverted,
  formatUnit,
  getUnitLabel,
  getUnitOptions,
  repairUnits,
  fromS3DUnits,
  readS3DUnits,
  toS3DUnits,
  convertStructure,
  getStructureUnits,
  getS3DUnitFactor,
  getResultFactor,
};

export default units;
