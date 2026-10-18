// Tests of the changelog schema, the build and the version bumps: node --test scripts/changelog (npm run test:changelog)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { entrySchema, releaseSchema } from "./schema.mjs";
import { loadChangelog, compileChangelog } from "../build_changelog.mjs";
import { getNextVersion } from "../release.mjs";

const entry = (fields = {}) => ({ id: "an-entry", type: "feature", area: ["modeling"], title: "You can now do something", ...fields });
const release = (fields = {}) => ({ version: "1.0.0", date: "2026-10-17", summary: "First release", entries: [entry()], ...fields });

function writeChangelog(releases) {
  let dir = mkdtempSync(join(tmpdir(), "changelog-"));
  for (let [name, data] of Object.entries(releases)) writeFileSync(join(dir, name), `---\n${stringify(data)}---\n`);
  return dir;
}

describe("schema", () => {
  test("a plain string is used for both languages", () => {
    assert.deepEqual(entrySchema.parse(entry()).title, { es: "You can now do something", en: "You can now do something" });
  });
  test("fixes need a severity", () => {
    assert.equal(entrySchema.safeParse(entry({ type: "fix" })).success, false);
    assert.equal(entrySchema.safeParse(entry({ type: "fix", severity: "critical" })).success, true);
  });
  test("only fixes have a severity", () => {
    assert.equal(entrySchema.safeParse(entry({ severity: "normal" })).success, false);
  });
  test("titles are under 80 characters", () => {
    assert.equal(entrySchema.safeParse(entry({ title: { es: "a", en: "x".repeat(81) } })).success, false);
  });
  test("unknown areas and fields are rejected", () => {
    assert.equal(entrySchema.safeParse(entry({ area: ["cooking"] })).success, false);
    assert.equal(entrySchema.safeParse(entry({ ticket: "PE-12" })).success, false);
  });
  test("pre-releases go in the beta channel and betas need a pre-release version", () => {
    assert.equal(releaseSchema.safeParse(release({ version: "1.1.0-beta.1" })).success, false);
    assert.equal(releaseSchema.safeParse(release({ version: "1.1.0-beta.1", channel: "beta" })).success, true);
    assert.equal(releaseSchema.safeParse(release({ channel: "beta" })).success, false);
  });
  test("entries can carry the date and commit they first landed in", () => {
    let parsed = entrySchema.parse(entry({ added: "2023-02-11", commit: "005e072" }));
    assert.equal(parsed.added, "2023-02-11");
    // Unquoted in YAML, a hash like 005e072 is a number
    assert.equal(entrySchema.safeParse(entry({ commit: 5e72 })).success, false);
    assert.equal(entrySchema.safeParse(entry({ commit: "not-a-hash" })).success, false);
  });
  test("versions must be SemVer", () => {
    assert.equal(releaseSchema.safeParse(release({ version: "v1.0" })).success, false);
  });
});

describe("build", () => {
  test("releases are sorted newest first, with counts and kinds", () => {
    let dir = writeChangelog({
      "1.0.0.md": release(),
      "1.1.0.md": release({
        version: "1.1.0",
        date: "2026-11-01",
        entries: [entry({ id: "b" }), entry({ id: "c", type: "fix", severity: "critical" }), entry({ id: "d", type: "fix", severity: "normal" })],
      }),
      "1.1.1.md": release({ version: "1.1.1", date: "2026-11-05", entries: [entry({ id: "e", type: "improvement", description: "**Faster**" })] }),
    });
    let { releases, errors } = loadChangelog(dir);
    assert.deepEqual(errors, []);
    let changelog = compileChangelog(releases, "1.1.1", "2026-11-05T00:00:00.000Z");
    assert.deepEqual(
      changelog.releases.map(({ version, kind }) => `${version}:${kind}`),
      ["1.1.1:patch", "1.1.0:minor", "1.0.0:major"]
    );
    assert.deepEqual(changelog.releases[1].counts, { feature: 1, improvement: 0, fix: 2, critical: 1 });
    assert.equal(changelog.releases[0].entries[0].description.en, "<p><strong>Faster</strong></p>");
    assert.equal(changelog.latest, "1.1.1");
  });
  test("the latest version is the newest stable one", () => {
    let dir = writeChangelog({
      "1.0.0.md": release(),
      "1.1.0-beta.1.md": release({ version: "1.1.0-beta.1", channel: "beta", date: "2026-11-01", entries: [entry({ id: "b" })] }),
    });
    let { releases } = loadChangelog(dir);
    assert.equal(compileChangelog(releases, "1.1.0-beta.1", "").latest, "1.0.0");
  });
  test("duplicate entry ids, misnamed files and dates out of order are errors", () => {
    let dir = writeChangelog({
      "1.0.0.md": release(),
      "1.1.0.md": release({ version: "1.1.0", date: "2026-10-01" }),
      "2.0.0.md": release({ version: "2.1.0", date: "2026-12-01", entries: [entry({ id: "other" })] }),
    });
    let { errors } = loadChangelog(dir);
    assert.equal(errors.length, 3);
    assert.match(errors.join("\n"), /already used/);
    assert.match(errors.join("\n"), /named after its version/);
    assert.match(errors.join("\n"), /before the one of 1.0.0/);
  });
  test("commits must exist in the repo", () => {
    let dir = writeChangelog({ "1.0.0.md": release({ entries: [entry({ commit: "0000000" })] }) });
    assert.match(loadChangelog(dir).errors.join("\n"), /not in this repo/);
  });
  test("unreleased.md is validated but not released", () => {
    let dir = writeChangelog({ "1.0.0.md": release(), "unreleased.md": { entries: [entry()] } });
    let { releases, unreleased, errors } = loadChangelog(dir);
    assert.equal(releases.length, 1);
    assert.equal(unreleased.entries.length, 1);
    assert.match(errors.join("\n"), /already used/);
  });
});

describe("version bumps", () => {
  test("from a stable version", () => {
    assert.equal(getNextVersion("1.4.1", "patch", false), "1.4.2");
    assert.equal(getNextVersion("1.4.1", "minor", false), "1.5.0");
    assert.equal(getNextVersion("1.4.1", "major", false), "2.0.0");
    assert.equal(getNextVersion("0.1.0", "major", false), "1.0.0");
  });
  test("betas", () => {
    assert.equal(getNextVersion("1.4.1", "minor", true), "1.5.0-beta.1");
    assert.equal(getNextVersion("1.5.0-beta.1", "minor", true), "1.5.0-beta.2");
    assert.equal(getNextVersion("1.5.0-beta.2", "patch", false), "1.5.0");
    assert.equal(getNextVersion("1.5.0-beta.2", "minor", false), "1.5.0");
    assert.equal(getNextVersion("2.0.0-beta.1", "major", false), "2.0.0");
  });
});
