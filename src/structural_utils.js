import units from "./js/units";

function getResult(results, result_name, result_direction, operation_type, element_id, lc_name) {
  let lc_results = results[lc_name];
  let actual_result = {};
  let final_result;
  try {
    switch (result_name) {
      case "moment":
        switch (result_direction) {
          case "x":
            actual_result = lc_results.member_forces.torsion[element_id];
            break;
          case "y":
            actual_result = lc_results.member_forces.bending_moment_y[element_id];
            break;
          case "z":
            actual_result = lc_results.member_forces.bending_moment_z[element_id];
            break;
          default:
            break;
        }
        break;
      case "shear":
        switch (result_direction) {
          case "x":
            actual_result = lc_results.member_forces.shear_force_x[element_id];
            break;
          case "y":
            actual_result = lc_results.member_forces.shear_force_y[element_id];
            break;
          case "z":
            actual_result = lc_results.member_forces.shear_force_z[element_id];
            break;
          default:
            break;
        }
        break;
      case "axial":
        actual_result = lc_results.member_forces.axial_force[element_id];
        break;
      case "reaction":
        switch (result_direction) {
          case "x":
            actual_result = lc_results.reactions[element_id]["Fx"];
            break;
          case "y":
            actual_result = lc_results.reactions[element_id]["Fy"];
            break;
          case "z":
            actual_result = lc_results.reactions[element_id]["Fz"];
            break;
          default:
            break;
        }
        break;
      case "displacement":
        switch (result_direction) {
          case "x":
            actual_result = lc_results.member_displacements.displacement_x[element_id];
            break;
          case "y":
            actual_result = lc_results.member_displacements.displacement_y[element_id];
            break;
          case "z":
            actual_result = lc_results.member_displacements.displacement_z[element_id];
            break;
          default:
            break;
        }
        break;
      case "local-displacement":
        switch (result_direction) {
          case "x":
            actual_result = lc_results.member_displacements.displacement_local_x[element_id];
            break;
          case "y":
            actual_result = lc_results.member_displacements.displacement_local_y[element_id];
            break;
          case "z":
            actual_result = lc_results.member_displacements.displacement_local_z[element_id];
            break;
          default:
            break;
        }
        break;
      default:
        break;
    }
  } catch (error) {
    // If anything turns out to be undefined return false
    actual_result = false;
  }

  if (actual_result) {
    switch (operation_type) {
      case "mid-span":
        final_result = interpolateResult(actual_result, 50);
        break;
      case "start":
        final_result = interpolateResult(actual_result, 0);
        break;
      case "end":
        final_result = interpolateResult(actual_result, 100);
        break;
      case "full":
        final_result = { y: Object.values(actual_result), x: Object.keys(actual_result).map((a) => Number(a)) };
        break;
      case "node":
        final_result = actual_result;
        break;
      case "min":
      case "max":
      case "average":
        final_result = interpolateResult(actual_result, operation_type);
        break;
      default:
        break;
    }
  }
  return final_result;
}

// Quantity of each result the result boxes show, and the unit the solvers return it in (see resultsLayer.tagResults)
const RESULT_QUANTITIES = {
  moment: { quantity: "moment", unit_key: "moment_unit", fallback: `${units.SOLVER_UNITS.force}-${units.SOLVER_UNITS.length}` },
  shear: { quantity: "force", unit_key: "force_unit", fallback: units.SOLVER_UNITS.force },
  axial: { quantity: "force", unit_key: "force_unit", fallback: units.SOLVER_UNITS.force },
  reaction: { quantity: "force", unit_key: "force_unit", fallback: units.SOLVER_UNITS.force },
  displacement: { quantity: "translation", unit_key: "displacement_unit", fallback: units.SOLVER_UNITS.translation },
  "local-displacement": { quantity: "translation", unit_key: "displacement_unit", fallback: units.SOLVER_UNITS.translation },
};

/**
 * Factor from a result as the solver returned it to the units of the model, and how that unit is written
 * @param {object} results
 * @param {string} result_name
 * @param {string|number} lc_name
 * @param {object} model_units Settings units
 * @returns {{factor: number, label: string}}
 */
function getResultUnit(results, result_name, lc_name, model_units) {
  let definition = RESULT_QUANTITIES[result_name];
  if (!definition) return { factor: 1, label: "" };
  let result_unit = results?.[lc_name]?.[definition.unit_key] || definition.fallback;
  return {
    factor: units.getResultFactor(result_unit, definition.quantity, model_units),
    label: units.formatUnit(units.getQuantityUnit(definition.quantity), model_units),
  };
}

/**
 * A result of getResult multiplied by a factor (the stations of a full result are kept)
 * @param {any} result
 * @param {number} factor
 */
function scaleResult(result, factor) {
  if (typeof result === "number") return result * factor;
  if (result && Array.isArray(result.y)) return { ...result, y: result.y.map((value) => value * factor) };
  return result;
}

function interpolateResult(stations_results, desired_station) {
  if (isNaN(Number(desired_station))) {
    let result_values = Object.values(stations_results);
    switch (desired_station) {
      case "max":
        return Math.max(...result_values);
      case "min":
        return Math.min(...result_values);
      case "average":
        let sum = result_values.reduce((a, b) => b + a);
        return sum / result_values.length;
      default:
        break;
    }
  } else {
    let closest_distance = Number.MAX_VALUE;
    let station_1, station_2;
    let station_1_index = 0;
    Object.keys(stations_results).forEach((station, index) => {
      let distance = Math.abs(Number(station) - desired_station);
      if (distance <= closest_distance) {
        if (station_1 !== undefined) station_2 = station_1;
        closest_distance = distance;
        station_1 = station;
        station_1_index = index;
      }
    });
    if (station_2 === undefined && station_1_index === 0) station_2 = Object.keys(stations_results)[1];
    let value_1 = stations_results[station_1];
    let value_2 = stations_results[station_2];
    return value_1 + ((value_2 - value_1) * (desired_station - station_1)) / (station_2 - station_1);
  }
}

const structural_utils = {
  getResult,
  getResultUnit,
  scaleResult,
};
export default structural_utils;
