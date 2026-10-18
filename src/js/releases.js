// App version and release notes: changelog.json is compiled from changelog/*.md by scripts/build_changelog.mjs before start and build.
// Used by the version badge, Settings > About and the What's new panel; the full timeline is on the site (paramele.com/changelog).
import semver from "semver";
import changelog from "../data/changelog.json";
import lastSeenVersion from "./lastSeenVersion";
import Firebase from "./firebase";
import getState from "../getState";

const APP_VERSION = changelog.app_version;
const BUILD_DATE = changelog.build_date;
const SITE_URL = process.env.REACT_APP_SITE_URL || "https://paramele.com";
// Most items in the What's new panel
const WHATS_NEW_LIMIT = 5;

/** @type {import("./types").ParamEleRelease[]} Newest first */
const RELEASES = changelog.releases;

/**
 * Releases up to the running version, newest first. Betas only when the app itself is a beta
 * @returns {import("./types").ParamEleRelease[]}
 */
function getReleases() {
  let is_beta_app = semver.prerelease(APP_VERSION) !== null;
  return RELEASES.filter((release) => semver.lte(release.version, APP_VERSION) && (is_beta_app || release.channel === "stable"));
}

function getCurrentRelease() {
  return RELEASES.find((release) => release.version === APP_VERSION) ?? null;
}

/**
 * True when the running version is newer than the last one the user saw (or they never saw one)
 * @param {string|null} last_seen
 */
function isNewVersion(last_seen) {
  return !last_seen || !semver.valid(last_seen) || semver.gt(APP_VERSION, last_seen);
}

/**
 * The user has seen the notes of this version: saved in the browser and in their account
 */
function markCurrentVersionSeen() {
  lastSeenVersion.setLocal(APP_VERSION);
  Firebase.saveLastSeenVersion(APP_VERSION);
}

function isCritical(entry) {
  return entry.type === "fix" && entry.severity === "critical";
}

/**
 * What's new since a version: the critical fixes and highlights of the newer releases, critical fixes first, at most 5,
 * grouped by release (newest first). Without newer releases (or a version) it shows the current one
 * @param {string|null} since Last version the user saw
 * @returns {{groups: {release: import("./types").ParamEleRelease, entries: import("./types").ParamEleReleaseEntry[]}[], releases: import("./types").ParamEleRelease[]}}
 */
function getWhatsNew(since) {
  let releases = getReleases();
  let newer = since && semver.valid(since) ? releases.filter((release) => semver.gt(release.version, since)) : [];
  if (newer.length === 0) newer = releases.slice(0, 1);
  let candidates = newer.flatMap((release, release_index) =>
    release.entries.map((entry, entry_index) => ({ release, entry, release_index, entry_index }))
  );
  let picked = candidates.filter(({ entry }) => entry.highlight || isCritical(entry));
  // A release with no highlights still shows its first entries
  if (picked.length === 0) picked = candidates;
  picked.sort((a, b) => isCritical(b.entry) - isCritical(a.entry) || a.release_index - b.release_index || a.entry_index - b.entry_index);
  picked = picked.slice(0, WHATS_NEW_LIMIT);
  let groups = newer
    .map((release) => ({
      release,
      entries: picked
        .filter((item) => item.release === release)
        .sort((a, b) => isCritical(b.entry) - isCritical(a.entry) || a.entry_index - b.entry_index)
        .map(({ entry }) => entry),
    }))
    .filter((group) => group.entries.length > 0);
  return { groups, releases: newer };
}

/**
 * Counts of a release as parts of its one-line summary: "4 new · 6 improved · 3 fixed (1 critical)", zero counts omitted
 * @param {import("./types").ParamEleReleaseCounts} counts
 * @param {function(string, string): string} getCopy Copy of the "releases" group
 * @returns {{type: string, text: string}[]}
 */
function getCountParts(counts, getCopy) {
  let format = (key, count) => getCopy(count === 1 ? `${key}_one` : key).replace("{n}", count);
  let parts = [];
  if (counts.feature) parts.push({ type: "feature", text: format("count_feature", counts.feature) });
  if (counts.improvement) parts.push({ type: "improvement", text: format("count_improvement", counts.improvement) });
  if (counts.fix) {
    let text = format("count_fix", counts.fix);
    if (counts.critical) text += ` (${format("count_critical", counts.critical)})`;
    parts.push({ type: counts.critical ? "critical" : "fix", text });
  }
  return parts;
}

function getLanguage() {
  return getState("language") === "en" ? "en" : "es";
}

/**
 * Text of a release or entry in the language of the app
 * @param {{es: string, en: string}|undefined} text
 */
function localize(text) {
  return text ? text[getLanguage()] ?? text.en : "";
}

/**
 * Date of a release ("2026-10-17") or of the build, in the language of the app
 * @param {string} date
 */
function formatDate(date) {
  // Release dates are days, read them as local dates so they do not move a day back
  let value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
  return value.toLocaleDateString(getLanguage() === "en" ? "en-US" : "es-CO", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Link to the changelog timeline of the site. `v` (the running version) gets the "You are here" marker; `seen` (the last version
 * the user saw before this one) tints the newer releases as new for them and enables the "Since my version" filter
 * @param {{seen?: string|null, hash?: string}} [options]
 */
function getTimelineURL({ seen, hash } = {}) {
  let url = new URL(`${getLanguage() === "en" ? "/en" : ""}/changelog`, SITE_URL);
  url.searchParams.set("v", APP_VERSION);
  if (seen && seen !== APP_VERSION) url.searchParams.set("seen", seen);
  if (hash) url.hash = hash;
  return url.toString();
}

const releases = {
  APP_VERSION,
  BUILD_DATE,
  getReleases,
  getCurrentRelease,
  isNewVersion,
  markCurrentVersionSeen,
  isCritical,
  getWhatsNew,
  getCountParts,
  localize,
  formatDate,
  getTimelineURL,
};
export default releases;
