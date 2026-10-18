// Validates the release notes in changelog/*.md and compiles them into changelog.json, read by the app (src/data/changelog.json,
// bundled: version badge and What's new) and by the site (public/changelog.json, served at app.paramele.com/changelog.json: the timeline).
// It also stamps the app version (package.json) and the build date. Runs before start, build and test; `--check` only validates.
// `--source <dir>` and `--out <file>` read and write other places (e.g. a folder of test releases).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parse as parseYAML } from "yaml";
import { marked } from "marked";
import semver from "semver";
import { AREAS, releaseSchema, unreleasedSchema } from "./changelog/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_VERSION = 1;

function getArg(name) {
  let index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Frontmatter of a release file (the body below it is for maintainers and is not published)
 * @param {string} path
 */
export function readFrontmatter(path) {
  let text = readFileSync(path, "utf8");
  let match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/);
  if (!match) throw new Error("missing the YAML frontmatter between --- lines");
  return parseYAML(match[1]) ?? {};
}

function formatIssues(error) {
  return error.issues.map((issue) => `  - ${issue.path.join(".") || "(file)"}: ${issue.message}`).join("\n");
}

/**
 * Reads and validates every release of a changelog folder
 * @param {string} source_dir
 * @returns {{releases: object[], unreleased: object|null, errors: string[]}}
 */
export function loadChangelog(source_dir) {
  let errors = [];
  let releases = [];
  let unreleased = null;
  let files = readdirSync(source_dir).filter((name) => name.endsWith(".md") && name !== "README.md");
  for (let name of files) {
    let path = join(source_dir, name);
    let data;
    try {
      data = readFrontmatter(path);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
      continue;
    }
    let is_unreleased = name === "unreleased.md";
    let result = (is_unreleased ? unreleasedSchema : releaseSchema).safeParse(data);
    if (!result.success) {
      errors.push(`${name}:\n${formatIssues(result.error)}`);
      continue;
    }
    if (is_unreleased) {
      unreleased = result.data;
      continue;
    }
    if (basename(name, ".md") !== result.data.version) errors.push(`${name}: the file must be named after its version (${result.data.version}.md)`);
    releases.push(result.data);
  }
  releases.sort((a, b) => semver.rcompare(a.version, b.version));
  // Entry ids are used in deep links, so they are unique across all releases
  let entry_files = {};
  for (let release of [...releases, ...(unreleased ? [{ version: "unreleased", entries: unreleased.entries }] : [])]) {
    for (let entry of release.entries) {
      if (entry_files[entry.id]) errors.push(`${release.version}: entry id "${entry.id}" is already used in ${entry_files[entry.id]}`);
      else entry_files[entry.id] = release.version;
    }
  }
  // Newer stable versions cannot be older in time (the app has one deployed version; betas of the next MAJOR can come out earlier)
  let stable = releases.filter((release) => release.channel === "stable");
  for (let index = 0; index < stable.length - 1; index++) {
    let [newer, older] = [stable[index], stable[index + 1]];
    if (newer.date < older.date) errors.push(`${newer.version}: its date (${newer.date}) is before the one of ${older.version} (${older.date})`);
  }
  errors.push(...checkCommits(releases));
  return { releases, unreleased, errors };
}

/**
 * The commits of the entries exist in this repo. Skipped without git or in a shallow clone, which lacks the old commits
 * @param {object[]} releases
 */
function checkCommits(releases) {
  let git = (...args) => execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    if (git("rev-parse", "--is-shallow-repository") === "true") return [];
  } catch (error) {
    return [];
  }
  let errors = [];
  for (let release of releases) {
    for (let entry of release.entries) {
      if (!entry.commit) continue;
      try {
        git("cat-file", "-e", `${entry.commit}^{commit}`);
      } catch (error) {
        errors.push(`${release.version}: entry "${entry.id}" points to commit ${entry.commit}, which is not in this repo`);
      }
    }
  }
  return errors;
}

/**
 * MAJOR, MINOR or PATCH, from the version itself (a pre-release takes the kind of the version it leads to)
 * @param {string} version
 */
function getKind(version) {
  let { major, minor, patch } = semver.parse(version);
  if (minor === 0 && patch === 0 && major > 0) return "major";
  if (patch === 0) return "minor";
  return "patch";
}

function countEntries(entries) {
  let counts = { feature: 0, improvement: 0, fix: 0, critical: 0 };
  for (let entry of entries) {
    counts[entry.type]++;
    if (entry.severity === "critical") counts.critical++;
  }
  return counts;
}

function renderMarkdown(text) {
  return { es: marked.parse(text.es).trim(), en: marked.parse(text.en).trim() };
}

/**
 * The changelog.json the app and the site read
 */
export function compileChangelog(releases, app_version, build_date) {
  let latest = releases.find((release) => release.channel === "stable");
  return {
    schema: SCHEMA_VERSION,
    app_version,
    build_date,
    latest: latest ? latest.version : null,
    areas: AREAS,
    releases: releases.map((release) => ({
      version: release.version,
      date: release.date,
      ...(release.title && { title: release.title }),
      summary: release.summary,
      milestone: release.milestone,
      channel: release.channel,
      kind: getKind(release.version),
      counts: countEntries(release.entries),
      entries: release.entries.map(({ description, ...entry }) => ({
        ...entry,
        ...(description && { description: renderMarkdown(description) }),
      })),
    })),
  };
}

function main() {
  let source_dir = resolve(getArg("--source") ?? join(ROOT, "changelog"));
  let out_files = getArg("--out")
    ? [resolve(getArg("--out"))]
    : [join(ROOT, "src", "data", "changelog.json"), join(ROOT, "public", "changelog.json")];
  let is_check = process.argv.includes("--check");
  let { releases, errors } = loadChangelog(source_dir);
  let app_version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  // Every version that can be deployed has its release notes (the fixtures of --source are not checked against it)
  if (!getArg("--source") && !releases.some((release) => release.version === app_version)) {
    errors.push(`package.json is at ${app_version}, which has no changelog/${app_version}.md (release with \`npm run release\`)`);
  }
  if (errors.length > 0) {
    console.error(`The changelog is not valid:\n${errors.join("\n")}`);
    process.exit(1);
  }
  if (is_check) {
    console.log(`Changelog OK: ${releases.length} releases`);
    return;
  }
  let changelog = compileChangelog(releases, app_version, new Date().toISOString());
  let json = JSON.stringify(changelog, null, 2) + "\n";
  for (let out_file of out_files) {
    if (!existsSync(dirname(out_file))) mkdirSync(dirname(out_file), { recursive: true });
    writeFileSync(out_file, json);
  }
  console.log(`Changelog: ${releases.length} releases, app ${app_version} -> ${out_files.map((file) => file.replace(ROOT + "/", "")).join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
