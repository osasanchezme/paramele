import getState from "../getState";
import file from "./file";
import utils from "../utils";
import { notify } from "../components/notification";
import { getProcessResponseObject } from "./processResponse";

// The samples are served by the hosting (public/samples, built by scripts/build_samples.mjs) and downloaded on demand
const SAMPLES_URL = `${process.env.PUBLIC_URL}/samples`;

/** @type {Promise<import("./types").ParamEleSampleCatalog>|null} */
let catalog_request = null;

/**
 * Downloads the list of samples once, later calls reuse it. A failed download is retried on the next call
 * @returns {Promise<import("./types").ParamEleSampleCatalog>}
 */
const getCatalog = () => {
  if (!catalog_request) {
    catalog_request = fetchJSON(`${SAMPLES_URL}/catalog.json`).catch((error) => {
      catalog_request = null;
      throw error;
    });
  }
  return catalog_request;
};

const fetchJSON = (url) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  });

/**
 * URL of the thumbnail of a sample
 * @param {import("./types").ParamEleSample} sample
 * @returns {string}
 */
const getThumbnailURL = (sample) => `${SAMPLES_URL}/${sample.thumbnail}`;

/**
 * Copy of a sample in the current language: samples carry {es, en} values
 * @param {{es: any, en: any}} localized
 */
const getLocalized = (localized) => localized[getState("language")] ?? localized.es;

/**
 * Downloads a sample in the current language and opens it as a new unsaved file, keeping its id in the URL
 * @param {string} sample_id
 * @param {import("./types").ParamEleSetFileDataCallback} setFileData
 * @param {function(boolean)} setModelLock
 * @returns {Promise<import("./types").ParamEleProcessResponse>}
 */
const openSample = (sample_id, setFileData, setModelLock) => {
  utils.showLoadingDimmer("loading_sample");
  return getCatalog()
    .then((catalog) => {
      if (!catalog.samples.some(({ id }) => id === sample_id)) return getProcessResponseObject("error", "sample_not_found");
      return fetchJSON(`${SAMPLES_URL}/${sample_id}.${getState("language")}.json`).then((sample_file) => {
        setFileData(file.getEmptyFileData());
        setModelLock(false);
        file.openModelFromParsedBlob(sample_file);
        file.setSampleURLParam(sample_id);
        return getProcessResponseObject("success", "sample_opened", sample_id);
      });
    })
    .catch((error) => getProcessResponseObject("error", "sample_load_failed", String(error)))
    .then((process_response) => {
      utils.hideLoadingDimmer();
      if (!process_response.success) notify("error", process_response.msg, undefined, true);
      return process_response;
    });
};

const samples = { getCatalog, getThumbnailURL, getLocalized, openSample };
export default samples;
