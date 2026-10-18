// Turns changelog/unreleased.md into changelog/<version>.md, bumps the version of package.json and rebuilds changelog.json.
// The version comes from the highest entry type: a breaking change (`breaking: true`) -> MAJOR, any feature -> MINOR, otherwise PATCH.
// Options: --major / --minor / --patch force the bump, --beta makes a -beta.N pre-release, --date YYYY-MM-DD (default today),
// --dry-run prints the version without writing anything.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import semver from "semver";
import { loadChangelog, readFrontmatter } from "./build_changelog.mjs";
import { unreleasedSchema } from "./changelog/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG_DIR = join(ROOT, "changelog");
const UNRELEASED = join(CHANGELOG_DIR, "unreleased.md");

const UNRELEASED_TEMPLATE = `---
# Release notes of the next version. Add an entry in every pull request that changes what users see or do,
# then run \`npm run release\` (see changelog/README.md).
# summary: { en: One line for the timeline card, es: Una línea para la tarjeta de la línea de tiempo }
entries: []
---
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getArg(name) {
  let index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * The bump the entries ask for: breaking -> major, a feature -> minor, else patch
 */
function getBump(unreleased) {
  for (let bump of ["major", "minor", "patch"]) if (process.argv.includes(`--${bump}`)) return bump;
  if (unreleased.breaking) return "major";
  return unreleased.entries.some((entry) => entry.type === "feature") ? "minor" : "patch";
}

/**
 * Next version from the current one. A beta continues the current pre-release when it leads to the same version
 */
export function getNextVersion(current, bump, is_beta) {
  let target = semver.inc(current, bump);
  let current_pre = semver.prerelease(current);
  // From 1.5.0-beta.2 a MINOR or PATCH release is 1.5.0 itself, a MAJOR from 2.0.0-beta.1 is 2.0.0
  if (current_pre) {
    let base = `${semver.major(current)}.${semver.minor(current)}.${semver.patch(current)}`;
    let leads_to_base =
      (bump === "major" && semver.minor(current) === 0 && semver.patch(current) === 0) ||
      (bump === "minor" && semver.patch(current) === 0) ||
      bump === "patch";
    if (leads_to_base) target = base;
  }
  if (!is_beta) return target;
  if (current_pre && semver.eq(semver.coerce(current), target)) return semver.inc(current, "prerelease", "beta");
  return `${target}-beta.1`;
}

function main() {
  if (!existsSync(UNRELEASED)) fail("There is no changelog/unreleased.md");
  let result = unreleasedSchema.safeParse(readFrontmatter(UNRELEASED));
  if (!result.success)
    fail(`changelog/unreleased.md is not valid:\n${result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n")}`);
  let unreleased = result.data;
  if (unreleased.entries.length === 0) fail("changelog/unreleased.md has no entries, there is nothing to release");
  if (!unreleased.summary) fail("changelog/unreleased.md needs a summary (one line for the timeline card)");

  let package_json = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  let is_beta = process.argv.includes("--beta");
  let version = getNextVersion(package_json.version, getBump(unreleased), is_beta);
  // Today in local time (toISOString is in UTC)
  let now = new Date();
  let date = getArg("--date") ?? new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let { releases } = loadChangelog(CHANGELOG_DIR);
  if (releases.some((release) => release.version === version)) fail(`changelog/${version}.md already exists`);
  if (process.argv.includes("--dry-run")) {
    console.log(`${package_json.version} -> ${version} (${date})`);
    return;
  }

  // The notes keep the text of unreleased.md, without its comments and the breaking flag, below the version and the date
  let notes = readFileSync(UNRELEASED, "utf8")
    .replace(/^---\r?\n/, "")
    .split(/\r?\n/)
    .filter((line) => !/^#/.test(line) && !/^breaking:/.test(line))
    .join("\n");
  let header = [`version: ${version}`, `date: ${date}`, ...(is_beta ? ["channel: beta"] : [])].join("\n");
  writeFileSync(join(CHANGELOG_DIR, `${version}.md`), `---\n${header}\n${notes}`);
  writeFileSync(UNRELEASED, UNRELEASED_TEMPLATE);
  // Updates package.json and package-lock.json
  execFileSync("npm", ["version", version, "--no-git-tag-version", "--allow-same-version"], { cwd: ROOT, stdio: "ignore" });
  execFileSync("node", [join(ROOT, "scripts", "build_changelog.mjs")], { cwd: ROOT, stdio: "inherit" });
  console.log(`Released ${version} (${date}). Review changelog/${version}.md, then commit and deploy.`);
  console.log(`Once the release commit is on main, tag it: git tag -a v${version} -m "ParamEle ${version}" && git push origin v${version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
