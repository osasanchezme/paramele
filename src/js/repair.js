import { convertModel } from "../submodules/paramele-parsers/utils/model_converter";
import utils from "../utils";
import settings_template from "./../settings_template.json";
import solverCredentials from "./solverCredentials";
import { units } from "../submodulesAPI";
import modelUnits from "./units";

function repairModel(model) {
  model.nodes.forEach((node) => {
    if (!node.data) node.data = {};
    node.data.aux = utils.getDefaultAuxData();
    // Models open with nothing selected
    delete node.selected;
  });
  (model.edges || []).forEach((edge) => delete edge.selected);
  // Favorite parameters of nodes that are not in the model anymore are dropped
  let node_ids = new Set(model.nodes.map(({ id }) => id));
  model.favorites = (model.favorites || []).filter(({ node_id }) => node_ids.has(node_id));
  return model;
}

function repairSettings(settings) {
  // Older files have auto_update (removed) and mini_map (now a global setting) under general
  let { general } = settings;
  // The spacing between possibilities is now calculated from their heights (see globalLogicRunner.stackCombination)
  if (settings.global) delete settings.global.spacing_between_combinations;
  if (general) {
    delete general.auto_update;
    if (general.hasOwnProperty("mini_map")) {
      settings.global = { mini_map: general.mini_map, ...settings.global };
      delete general.mini_map;
    }
  }
  Object.entries(settings_template).forEach(([global_key, global_setting]) => {
    let should_update_all = false;
    if (!settings.hasOwnProperty(global_key)) {
      should_update_all = true;
      settings[global_key] = {};
    }
    Object.entries(global_setting).forEach(([setting_key, setting]) => {
      if (setting.scope === "user") return;
      if (should_update_all || !settings[global_key].hasOwnProperty(setting_key)) settings[global_key][setting_key] = setting.default;
    });
  });
  // Units from one unit system, the metric defaults for older files
  settings.units = modelUnits.repairUnits(settings.units);
  // Older files carry the SkyCiv credentials, which now belong to the user (see solverCredentials.js)
  solverCredentials.removeFromSettings(settings.global);
  return settings;
}

/**
 * Structure ready for a solver or an export, in the units they take (units.SOLVER_UNITS) whatever the units of the model
 * @param {import("../submodules/paramele-parsers/types").s3d_model} structure
 * @param {import("../submodules/paramele-parsers/types").solver_engine} solver_engine
 */
function repairStructuralModel(structure, solver_engine) {
  structure = modelUnits.convertStructure(structure, modelUnits.getStructureUnits(structure), modelUnits.SOLVER_UNITS);
  let used_section_ids = [...new Set(Object.values(structure.members).map(({ section_id }) => section_id))];
  let used_material_ids = [
    ...new Set([
      ...used_section_ids.map((section_id) => (structure.sections[section_id] ? structure.sections[section_id].material_id : "1")),
      ...Object.values(structure.plates).map(({ material_id }) => material_id ?? "1"),
    ]),
  ];
  if (used_section_ids.length === 0) used_section_ids.push("1");
  if (used_material_ids.length === 0) used_material_ids.push("1");

  used_material_ids.forEach((material_id) => {
    if (structure.materials[material_id] === undefined) {
      structure.materials[material_id] = {
        density: 2500,
        elasticity_modulus: 17000,
        poissons_ratio: 0.2,
        name: "DefaultConcrete",
        class: "concrete",
      };
    }
  });
  used_section_ids.forEach((section_id) => {
    if (structure.sections[section_id] === undefined) {
      structure.sections[section_id] = {
        name: `DefaultSection_${section_id}`,
        base: 500,
        height: 500,
        material_id: "1",
        info: {
          shape: "rectangle",
          dimensions: {
            h: 500,
            b: 500,
          },
        },
      };
    }
  });

  if (solver_engine === "skyciv") {
    // Plate results at each node of each element, as PyNite gives them: averaged over the elements around the node, they
    // differ from PyNite's wherever they jump (point loads, supports, plates meeting at an angle)
    structure.settings = { ...structure.settings, smooth_plate_nodal_results: false };
    // Rotate all the member 90 degrees since the Z-axis is the vertical one
    structure.members = Object.fromEntries(
      Object.entries(structure.members).map(([key, member_data]) => [key, { ...member_data, rotation_angle: 90 }])
    );
  }

  if (solver_engine === "pynite" || solver_engine === "pynite_wasm") {
    // Plate thicknesses are in section length units (as in SkyCiv), PyNite takes them in length units like the sections
    let { section_length, length } = structure.settings.units;
    structure.plates = Object.fromEntries(
      Object.entries(structure.plates).map(([plate_id, plate]) => {
        let converted = { ...plate };
        ["thickness", "membrane_thickness", "shear_thickness", "bending_thickness"].forEach((key) => {
          if (plate[key] !== null && plate[key] !== undefined && plate[key] !== "")
            converted[key] = units.convert(Number(plate[key]), section_length, length);
        });
        return [plate_id, converted];
      })
    );
    // PyNite builds its sections from their shape, so generic ones are left out (members that use them are reported by
    // structure.solveStructure before solving)
    Object.entries(structure.sections).forEach(([section_id, section]) => {
      if (!section.info?.dimensions) delete structure.sections[section_id];
    });
    structure = convertModel(structure, { section_length: "m" });
    // PyNite takes consistent units: with forces in kN and lengths in m, the elasticity modulus goes in kN/m2 (kPa), not in MPa
    let { material_strength, force } = structure.settings.units;
    let consistent_strength = force === "kn" ? "kpa" : "pa";
    structure.materials = Object.fromEntries(
      Object.entries(structure.materials).map(([material_id, material]) => [
        material_id,
        { ...material, elasticity_modulus: units.convert(Number(material.elasticity_modulus), material_strength, consistent_strength) },
      ])
    );
  }
  // TODO - Move the CSI model conversion to here

  // TODO - Let the user know in some way that the section and/or the material are assumed with some default
  return structure;
}

const repair = { repairModel, repairSettings, repairStructuralModel };

export default repair;
