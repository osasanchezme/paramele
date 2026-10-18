// Last app version whose release notes the user has seen (opened or dismissed What's new), so the app only tells them about newer ones.
// Signed-in users keep it in users/{uid}.last_seen_version (loaded and saved by firebase.js), with this browser's copy in
// localStorage as the fallback when logged out or before the account has a value.

const STORAGE_KEY = "paramele_last_seen_version";

let account_version = null;
// The account is read once auth resolves, until then nothing is decided
let is_ready = false;
let listeners = new Set();
let snapshot = { version: null, is_ready: false };

function readLocal() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

function writeLocal(version) {
  try {
    window.localStorage.setItem(STORAGE_KEY, version);
  } catch (error) {
    // Storage blocked (private mode): the value lives until the page is closed
  }
}

function emit() {
  snapshot = { version: account_version ?? readLocal(), is_ready };
  listeners.forEach((listener) => listener());
}

/**
 * Value stored in the account, null when logged out or not set. Called by firebase.js once auth resolves
 * @param {string|null|undefined} version
 */
function setFromAccount(version) {
  account_version = typeof version === "string" ? version : null;
  is_ready = true;
  emit();
}

/**
 * Saves the version in this browser (firebase.js saves it in the account)
 * @param {string} version
 */
function setLocal(version) {
  writeLocal(version);
  if (account_version !== null) account_version = version;
  emit();
}

/**
 * @returns {{version: string|null, is_ready: boolean}} Same object until the value changes (useSyncExternalStore)
 */
function getSnapshot() {
  return snapshot;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

snapshot = { version: readLocal(), is_ready };

const lastSeenVersion = { setFromAccount, setLocal, getSnapshot, subscribe };
export default lastSeenVersion;
