// Swap the sample import to change the model the app starts with
// import sample_data from "../data/template-4-two-beams.json";
// import sample_data from "../data/template-5-frame.json";
// import sample_data from "../data/template-quad-wrapper.json";
// import sample_data from "../data/template-math-quadratic.json";
// import sample_data from "../data/template-simple-beam-wrapper.json";
// import sample_data from "../data/template-simple-beam-wrapper-with-slider.json";
import sample_data from "../data/template-results-gather.json";
// import sample_data from "../data/template-wrapper-frame-with-sliders.json";
import blank_data from "../data/template-0.json";

/**
 * Gets the params that point to a saved model or to a sample from the current URL
 * @returns {{path: string|null, name: string|null, sample: string|null}}
 */
const getURLParams = () => {
  const queryParams = new URLSearchParams(window.location.search);
  let important_params = ["path", "name", "sample"];
  let params_object = {};
  important_params.forEach((param_key) => {
    params_object[param_key] = queryParams.get(param_key);
  });
  return params_object;
};

/**
 * Whether the current URL points to a saved model to open
 * @returns {boolean}
 */
const hasModelInURL = () => {
  let { path, name } = getURLParams();
  return path !== null && name !== null;
};

/**
 * Whether the current URL points to a sample to open (and not to a saved model, which comes first)
 * @returns {boolean}
 */
const hasSampleInURL = () => !hasModelInURL() && getURLParams().sample !== null;

/**
 * Sample model shown when there is no saved model to open
 * @returns {{model: object, settings: object}}
 */
const getSampleData = () => JSON.parse(JSON.stringify(sample_data));

/**
 * Model and settings the app starts with. When a saved model or a sample is going to be opened from the URL the model starts empty,
 * so the startup sample is not evaluated and rendered just to be replaced. Its settings are kept so the layout is the same
 * @returns {{model: object, settings: object}}
 */
const getStartupData = () => {
  let startup_data = getSampleData();
  if (hasModelInURL() || hasSampleInURL()) startup_data.model = JSON.parse(JSON.stringify(blank_data.model));
  return startup_data;
};

export { getURLParams, hasModelInURL, hasSampleInURL, getStartupData, getSampleData };
