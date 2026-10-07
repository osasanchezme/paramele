import settings_template from "../settings_template.json";

// Settings with "scope": "user" in settings_template.json (the SkyCiv username and key) belong to the user, not to the model.
// They are stored in users/{uid}.solver (see firebase.js) and never in the model settings, so they are not saved or shared with files
const USER_SCOPED_SETTINGS = Object.entries(settings_template.global)
  .filter(([, setting]) => setting.scope === "user")
  .map(([setting_name]) => setting_name);

/** @type {import("./types").ParamEleSolverCredentials} */
let credentials = getEmptyCredentials();
const listeners = new Set();

/**
 * @returns {import("./types").ParamEleSolverCredentials}
 */
function getEmptyCredentials() {
  return Object.fromEntries(USER_SCOPED_SETTINGS.map((setting_name) => [setting_name, ""]));
}

/**
 * @returns {import("./types").ParamEleSolverCredentials}
 */
function getCredentials() {
  return { ...credentials };
}

/**
 * Replaces the credentials in memory (they are persisted by firebase.js) and notifies the listeners
 * @param {Partial<import("./types").ParamEleSolverCredentials>} [new_credentials] Nothing clears them (e.g. on sign out)
 */
function setCredentials(new_credentials) {
  credentials = getEmptyCredentials();
  USER_SCOPED_SETTINGS.forEach((setting_name) => {
    if (typeof new_credentials?.[setting_name] === "string") credentials[setting_name] = new_credentials[setting_name];
  });
  listeners.forEach((listener) => listener(getCredentials()));
}

/**
 * @param {function(import("./types").ParamEleSolverCredentials)} listener
 * @returns {function()} Unsubscribes the listener
 */
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Removes the user scoped settings from the global settings of a model (older files and templates have them)
 * @param {object} global_settings
 */
function removeFromSettings(global_settings) {
  if (!global_settings) return;
  USER_SCOPED_SETTINGS.forEach((setting_name) => delete global_settings[setting_name]);
}

/**
 * @param {string} setting_name
 * @returns {boolean}
 */
function isUserScoped(setting_name) {
  return USER_SCOPED_SETTINGS.includes(setting_name);
}

const solverCredentials = { getCredentials, setCredentials, subscribe, removeFromSettings, isUserScoped };
export default solverCredentials;
