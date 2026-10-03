import { convertModel } from "../submodules/paramele-parsers/utils/model_converter";
import utils from "../utils";
import settings_template from "./../settings_template.json";

function repairModel(model) {
  model.nodes.forEach((node) => {
    if (!node.data) node.data = {};
    node.data.aux = utils.getDefaultAuxData();
  });
  return model;
}

function repairSettings(settings) {
  // Older files have auto_update (removed) and mini_map (now a global setting) under general
  let { general } = settings;
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
      if (should_update_all || !settings[global_key].hasOwnProperty(setting_key)) settings[global_key][setting_key] = setting.default;
    });
  });
  return settings;
}

/**
 *
 * @param {import("../submodules/paramele-parsers/types").s3d_model} structure
 * @param {import("../submodules/paramele-parsers/types").solver_engine} solver_engine
 */
function repairStructuralModel(structure, solver_engine) {
  let used_section_ids = [...new Set(Object.values(structure.members).map(({ section_id }) => section_id))];
  let used_material_ids = [
    ...new Set(used_section_ids.map((section_id) => (structure.sections[section_id] ? structure.sections[section_id].material_id : "1"))),
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
    // Rotate all the member 90 degrees since the Z-axis is the vertical one
    structure.members = Object.fromEntries(
      Object.entries(structure.members).map(([key, member_data]) => [key, { ...member_data, rotation_angle: 90 }])
    );
  }

  if (solver_engine === "pynite" || solver_engine === "pynite_wasm") {
    structure = convertModel(structure, { section_length: "m" });
  }
  // TODO - Move the CSI model conversion to here

  // TODO - Let the user know in some way that the section and/or the material are assumed with some default
  return structure;
}

const repair = { repairModel, repairSettings, repairStructuralModel };

export default repair;
