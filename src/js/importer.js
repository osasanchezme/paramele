import file from "./file";
import state from "../state";
import { parsers } from "../submodulesAPI";
import generateParametricModel from "./generateParametricModel";
import { getProcessResponseObject } from "./processResponse";
import mesher from "./mesher";

/**
 * Supported import formats. `steps` are the process steps shown to the user while the file is imported
 * @type {Object.<import("./types").ParamEleImportFileType, {extensions: string[], steps: import("./types").ParamEleImportStep[]}>}
 */
const IMPORT_FILE_TYPES = {
  paramele: { extensions: ["json"], steps: ["reading", "detecting", "loading_model"] },
  skyciv: { extensions: ["json"], steps: ["reading", "detecting", "generating_parametric_model"] },
  dxf: { extensions: ["dxf"], steps: ["reading", "detecting", "converting", "generating_parametric_model"] },
  csi: { extensions: ["$2k", "s2k"], steps: ["reading", "detecting", "converting", "generating_parametric_model"] },
};

/** S3D element groups counted in the import summary */
const S3D_SUMMARY_KEYS = ["nodes", "members", "plates", "supports", "point_loads", "distributed_loads", "moments", "sections", "materials"];

/**
 * @param {string} file_name
 * @returns {string|null} Lowercase extension without the dot
 */
const getFileExtension = (file_name) => {
  let file_extension_match = file_name.match(/.*\.([0-9A-Za-z$]+)$/);
  return file_extension_match ? file_extension_match[1].toLowerCase() : null;
};

/**
 * Whether the file name has an extension that some importer accepts
 * @param {string} file_name
 * @returns {boolean}
 */
const isSupportedFileName = (file_name) => {
  let file_extension = getFileExtension(file_name);
  return Object.values(IMPORT_FILE_TYPES).some(({ extensions }) => extensions.includes(file_extension));
};

/**
 * @param {any} data
 * @returns {boolean} Whether the data is a ParamEle file (boxes and links)
 */
const isParamEleModel = (data) => data != null && data.model != null && Array.isArray(data.model.nodes) && Array.isArray(data.model.edges);

/**
 * @param {any} data
 * @returns {boolean} Whether the data is a SkyCiv S3D model
 */
const isS3DModel = (data) => data != null && typeof data.nodes === "object" && !Array.isArray(data.nodes) && typeof data.members === "object";

/**
 * Detects the format of a file from its name and contents and parses it
 * @param {string} file_name
 * @param {string} file_text
 * @returns {import("./types").ParamEleProcessResponse} `data` is `{type, parsed}`, `parsed` is the JSON object for JSON files and the raw text otherwise
 */
const detectFileType = (file_name, file_text) => {
  let file_extension = getFileExtension(file_name);
  if (!file_extension) return getProcessResponseObject("error", "parametricGenerator/no_extension_on_file");
  if (file_extension === "json") {
    let parsed;
    try {
      parsed = JSON.parse(file_text);
    } catch {
      return getProcessResponseObject("error", "import/invalid_json");
    }
    if (isParamEleModel(parsed)) return getProcessResponseObject("success", "", { type: "paramele", parsed });
    // SkyCiv API payloads keep the model under s3d_model
    if (parsed && isS3DModel(parsed.s3d_model)) return getProcessResponseObject("success", "", { type: "skyciv", parsed: parsed.s3d_model });
    if (isS3DModel(parsed)) return getProcessResponseObject("success", "", { type: "skyciv", parsed });
    return getProcessResponseObject("error", "import/unknown_json");
  }
  let type = Object.keys(IMPORT_FILE_TYPES).find((type_key) => IMPORT_FILE_TYPES[type_key].extensions.includes(file_extension));
  if (!type) return getProcessResponseObject("error", "parametricGenerator/not_supported_format");
  return getProcessResponseObject("success", "", { type, parsed: file_text });
};

/**
 * Converts the parsed file contents into a S3D model
 * @param {import("./types").ParamEleImportFileType} type
 * @param {any} parsed
 * @returns {{s3d_model: import("../submodules/paramele-parsers/types").s3d_model, skipped: import("./types").ParamEleImportSkipped[]}}
 * `skipped` lists the entities of the file that were left out of the model
 */
const getS3DModel = (type, parsed) => {
  switch (type) {
    case "skyciv": {
      // ParamEle meshes the plates itself, the mesh nodes of the file would become node boxes
      let { structure, element_count, node_count } = mesher.removeMesh(parsed);
      let skipped = [];
      if (element_count > 0) skipped.push({ type: "meshed_plates", reason: "mesh", count: element_count });
      if (node_count > 0) skipped.push({ type: "nodes", reason: "mesh", count: node_count });
      return { s3d_model: structure, skipped };
    }
    case "dxf":
      return parsers.dxf.parse(parsed);
    case "csi":
      return { s3d_model: parsers.csi.getS3DModel(parsed), skipped: [] };
    default:
      throw new Error(`No structural importer for ${type}`);
  }
};

/**
 * Counts the elements of each group in a S3D model
 * @param {import("../submodules/paramele-parsers/types").s3d_model} s3d_model
 * @returns {Object.<string, number>} Only the groups with elements
 */
const getS3DSummary = (s3d_model) => {
  let summary = {};
  S3D_SUMMARY_KEYS.forEach((key) => {
    let count = s3d_model[key] ? Object.keys(s3d_model[key]).length : 0;
    if (count > 0) summary[key] = count;
  });
  return summary;
};

/**
 * Lets the browser paint the status before running a step that blocks the main thread
 * @returns {Promise<void>}
 */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

/**
 * Waits until the editor shows the blank model. The editor nodes are React state, so a new file is applied on a later render
 * and the parametric generator, which numbers its boxes from 1, would collide with the boxes of the previous model
 * @param {number} [timeout] ms
 * @returns {Promise<void>}
 */
const waitForEmptyEditor = async (timeout = 2000) => {
  let start = Date.now();
  while (state.getRfInstance().getNodes().length > 0) {
    if (Date.now() - start > timeout) throw new Error("The editor was not cleared");
    await nextFrame();
  }
};

/**
 * Imports any supported file into the editor, routing it to its importer
 * - ParamEle JSON files are opened as they are
 * - SkyCiv JSON, DXF and CSI ($2k) files are converted to a S3D model and parametrized
 * @param {File} user_file
 * @param {function(import("./types").ParamEleImportStatus): void} onStatus Called every time the process changes
 * @param {function(): void} [onReplaceModel] Called right before the current model is replaced, it is not called when the file is rejected
 * @returns {Promise<import("./types").ParamEleProcessResponse>} `data` is `{summary, skipped}` on success, an empty model also has `skipped`
 */
const importFile = async (user_file, onStatus, onReplaceModel = () => {}) => {
  /** @type {import("./types").ParamEleImportStatus} */
  let status = { file_name: user_file.name, type: null, steps: ["reading", "detecting"], step: "reading", summary: null, skipped: [] };
  const update = (changes) => {
    status = { ...status, ...changes };
    onStatus(status);
  };
  update({});
  let file_text;
  try {
    file_text = await user_file.text();
  } catch {
    return getProcessResponseObject("error", "import/read_failed");
  }
  update({ step: "detecting" });
  let detection = detectFileType(user_file.name, file_text);
  if (!detection.success) return detection;
  let { type, parsed } = detection.data;
  update({ type, steps: IMPORT_FILE_TYPES[type].steps });
  await nextFrame();

  if (type === "paramele") {
    update({ step: "loading_model" });
    await nextFrame();
    try {
      onReplaceModel();
      file.openModelFromParsedBlob(parsed);
    } catch {
      return getProcessResponseObject("error", "import/load_failed");
    }
    return getProcessResponseObject("success", "", { summary: { boxes: parsed.model.nodes.length }, skipped: [] });
  }

  let s3d_model, skipped;
  try {
    if (type !== "skyciv") {
      update({ step: "converting" });
      await nextFrame();
    }
    ({ s3d_model, skipped } = getS3DModel(type, parsed));
  } catch {
    return getProcessResponseObject("error", "import/convert_failed");
  }
  let summary = getS3DSummary(s3d_model);
  if (!summary.nodes) return getProcessResponseObject("error", "import/empty_model", { skipped });
  update({ step: "generating_parametric_model", summary, skipped });
  await nextFrame();
  try {
    onReplaceModel();
    file.newFile();
    await waitForEmptyEditor();
    let process_response = await new Promise((resolve) => generateParametricModel(s3d_model, resolve));
    return process_response.success ? getProcessResponseObject("success", "", { summary, skipped }) : process_response;
  } catch {
    return getProcessResponseObject("error", "parametricGenerator/generic_fail");
  }
};

const importer = { IMPORT_FILE_TYPES, importFile, isSupportedFileName, detectFileType, getS3DModel };
export default importer;
