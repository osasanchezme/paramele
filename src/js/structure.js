import notification, { notify } from "../components/notification";
import getState from "../getState";
import state from "../state";
import utils from "../utils";
import { Link, Icon } from "@chakra-ui/react";
import { MdOpenInNew } from "react-icons/md";
import logic_runner from "./globalLogicRunner";

import file from "./file";
import { parsers } from "../submodulesAPI";
import generateParametricModel from "./generateParametricModel";
import { getProcessResponseObject } from "./processResponse";
import importer from "./importer";
import repair from "./repair";
import pyniteWasm from "./pyniteWasm";
import solverCredentials from "./solverCredentials";
import mesher from "./mesher";

const PYNITE_SERVER_URL = "http://127.0.0.1:5013";

/**
 * Whether the local PyNite server is running. It only exposes POST /solve, so any HTTP response means it is up.
 * @returns {Promise<boolean>}
 */
const isPyniteServerRunning = () =>
  fetch(PYNITE_SERVER_URL, { signal: AbortSignal.timeout(3000) })
    .then(() => true)
    .catch(() => false);

/**
 * Turns meshing on or off and runs the logic, which meshes the plates when it is on
 * @param {boolean} enabled
 */
const setMeshing = (enabled) => {
  let settings = getState("settings");
  settings.global.mesh_plates = enabled;
  state.setState(settings, "settings");
  logic_runner.run();
};

const isMeshing = () => Boolean(getState("settings")["global"]["mesh_plates"]);

/**
 * Meshes the plates (Structure > Mesh plates). Meshing stays on, so the mesh follows the changes of the model.
 */
const meshPlates = () => {
  setMeshing(true);
  /** @type {import("./types").ParamEleStructureMesh} */
  const structure_mesh = state.getGlobalVariable("structure_mesh");
  if (structure_mesh.plate_count === 0 && structure_mesh.skipped.length === 0) {
    notify("warning", "no_plates_to_mesh", undefined, true);
    return;
  }
  if (structure_mesh.plate_count > 0) {
    notification.notify(
      "success",
      utils.getDisplayCopy("notifications", "plates_meshed_title"),
      utils
        .getDisplayCopy("notifications", "plates_meshed_desc")
        .replace("{plates}", structure_mesh.plate_count)
        .replace("{elements}", structure_mesh.element_count)
        .replace("{size}", structure_mesh.mesh_size),
      false,
      6000
    );
  }
  notifySkippedPlates(structure_mesh);
};

/**
 * @param {import("./types").ParamEleStructureMesh} structure_mesh
 */
const notifySkippedPlates = (structure_mesh) => {
  if (structure_mesh.skipped.length === 0) return;
  const plates = structure_mesh.skipped.map(({ plate_id, reason }) => `${plate_id} (${utils.getDisplayCopy("renderer", `mesh_reason_${reason}`)})`);
  notification.notify(
    "warning",
    utils.getDisplayCopy("notifications", "plates_not_meshed_title"),
    `${utils.getDisplayCopy("notifications", "plates_not_meshed_desc")} ${plates.join(", ")}`,
    false,
    10000
  );
};

const removeMesh = () => {
  setMeshing(false);
  notify("info", "mesh_removed", undefined, true);
};

const solveStructure = () => {
  let global_settings = getState("settings")["global"];
  const { solver_engine } = global_settings;
  // PyNite only takes meshed plates
  if (solver_engine !== "skyciv" && !isMeshing() && Object.keys(getState("structure").plates).length > 0) {
    setMeshing(true);
    const structure_mesh = state.getGlobalVariable("structure_mesh");
    notification.notify(
      "info",
      utils.getDisplayCopy("notifications", "meshing_for_solve_title"),
      utils.getDisplayCopy("notifications", "meshing_for_solve_desc").replace("{size}", structure_mesh.mesh_size),
      false,
      6000
    );
    notifySkippedPlates(structure_mesh);
  }
  let structure = repair.repairStructuralModel(getState("structure"), solver_engine);
  if (solver_engine !== "pynite_wasm") notification.notify("info", "requested_solve", "", true, 90000);
  function setResults(results) {
    state.setState(results, "results");
    // The plate results are by meshed plate, the renderer only shows them while the mesh is the one solved
    state.setGlobalVariable("results_meshed_plates", structure.meshed_plates || {});
    notification.notify("info", "results_saved", null, true);
    // Run the logic to get the results plot
    logic_runner.run();
  }
  if (solver_engine === "skyciv") {
    const { solver_username, solver_key } = solverCredentials.getCredentials();
    let file_name = "my_model_" + Date.now();
    let api_object = {
      auth: {
        username: solver_username,
        key: solver_key,
      },
      functions: [
        {
          function: "S3D.session.start",
          arguments: {
            keep_open: false,
          },
        },
        {
          function: "S3D.model.set",
          arguments: {
            s3d_model: structure,
          },
        },
        // The plates meshed in ParamEle keep their mesh, otherwise SkyCiv meshes them
        ...(Object.keys(structure.meshed_plates || {}).length > 0
          ? []
          : [
              {
                function: "S3D.model.mesh",
                arguments: {
                  method: "delaunay",
                  granularity: 3,
                },
              },
            ]),
        {
          function: "S3D.file.save",
          arguments: {
            name: file_name,
            path: "api/paramele/",
            public_share: false,
          },
        },
        {
          function: "S3D.model.solve",
          arguments: {
            analysis_type: "linear",
            repair_model: true,
          },
        },
        {
          function: "S3D.file.save",
          arguments: {
            name: file_name,
            path: "api/paramele/",
            public_share: false,
          },
        },
      ],
    };
    fetch("https://api.skyciv.com/v3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(api_object),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Success");
        console.log(data);
        let already_open = false;
        notification.closeAllNotifications();
        if (data.functions) {
          data.functions.forEach((func) => {
            switch (func.function) {
              case "S3D.model.solve":
                if (func.status == 0) {
                  setResults(func.data);
                } else {
                  notification.notify(
                    "error",
                    utils.getDisplayCopy("notifications", "solve_failed_title"),
                    `${utils.getDisplayCopy("notifications", "solve_failed_desc")} ${data.response.msg}`
                  );
                }
                break;
              case "S3D.file.save":
                if (!already_open) {
                  already_open = true;
                  notification.notify(
                    "info",
                    utils.getDisplayCopy("notifications", "saved_model"),
                    <Link href={func.data} isExternal>
                      {utils.getDisplayCopy("notifications", "open_model")} <Icon as={MdOpenInNew} mx="2px" />
                    </Link>
                  );
                }
                break;
              default:
                break;
            }
          });
        }
        if (!already_open) notification.notify("info", utils.getDisplayCopy("notifications", "response_back"), data.response.msg);
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  } else if (solver_engine === "pynite") {
    fetch(`${PYNITE_SERVER_URL}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ solver: solver_engine, model: structure }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Success");
        console.log(data);
        setResults(data);
        notification.closeAllNotifications();
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  } else if (solver_engine === "pynite_wasm") {
    notification.notify("info", pyniteWasm.isReady() ? "requested_solve_wasm" : "loading_solver_wasm", "", true, 90000);
    pyniteWasm
      .solve(structure)
      .then(({ results, timings }) => {
        console.log("PyNite (WASM) timings", timings);
        notification.closeAllNotifications();
        setResults(results);
      })
      .catch((error) => {
        console.error("Error:", error);
        notification.closeAllNotifications();
        notification.notify(
          "error",
          utils.getDisplayCopy("notifications", "solve_failed_title"),
          `${utils.getDisplayCopy("notifications", "solve_failed_desc")} ${error.message.split("\n").filter(Boolean).pop()}`
        );
      });
  }
  //   let file_name = Date.now();
};

/**
 *
 * @param {"SAP2000"} format
 */
const downloadInputTextFile = (format) => {
  let file_str = "";
  // SAP2000 meshes the areas itself, the mesh nodes would be loose joints
  let structure = repair.repairStructuralModel(mesher.removeMesh(getState("structure")).structure, "csi");
  try {
    switch (format) {
      case "SAP2000":
        file_str = parsers.csi.getSAP2000Model(structure, "25.1.0");
        break;
      default:
        alert("Unsupported file format: " + format);
        break;
    }
    notify("success", "converted_model_downloading", undefined, true);
    file.downloadAnyFile("modelo_sap.$2k", "text", file_str, true);
  } catch {
    notify("error", "export_model_failed", undefined, true);
  }
};

/**
 *
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
const importStructureModel = (callback) => {
  file.newFile();
  let a = document.createElement("input");
  a.type = "file";
  a.addEventListener("cancel", () => {
    callback();
  });
  a.onchange = () => {
    if (a.files.length > 0) {
      if (typeof window.FileReader !== "function") {
        alert("The file API isn't supported on this browser yet.");
        return;
      }
      let user_file = a.files[0];
      let fr = new FileReader();
      fr.onload = function (e) {
        try {
          let detection = importer.detectFileType(user_file.name, e.target.result);
          if (!detection.success) return callback(detection);
          let { type, parsed } = detection.data;
          // This menu only parametrizes structural models, ParamEle files are opened from File > Import
          if (type === "paramele") return callback(getProcessResponseObject("error", "parametricGenerator/not_supported_format"));
          generateParametricModel(importer.getS3DModel(type, parsed).s3d_model, callback);
        } catch (error) {
          callback(getProcessResponseObject("error", "parametricGenerator/generic_fail"));
        }
      };
      fr.readAsText(user_file);
    }
  };
  a.click();
};

const structure = { solveStructure, meshPlates, removeMesh, isMeshing, downloadInputTextFile, importStructureModel, isPyniteServerRunning };
export default structure;
