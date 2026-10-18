import releases from "./releases";

jest.mock("./firebase", () => ({ saveLastSeenVersion: jest.fn() }));
jest.mock("../getState", () => () => "en");

const entry = (id, fields = {}) => ({ id, type: "feature", area: ["ui"], title: { es: id, en: id }, highlight: false, links: [], ...fields });
const release = (version, entries, fields = {}) => ({
  version,
  date: "2026-10-17",
  summary: { es: version, en: version },
  milestone: false,
  channel: "stable",
  kind: "minor",
  counts: { feature: 0, improvement: 0, fix: 0, critical: 0 },
  entries,
  ...fields,
});

jest.mock("../data/changelog.json", () => ({
  app_version: "1.2.0",
  build_date: "2026-10-17T00:00:00.000Z",
  releases: [
    release("1.3.0-beta.1", [entry("beta-feature", { highlight: true })], { channel: "beta" }),
    release("1.2.0", [entry("a", { highlight: true }), entry("b", { highlight: true }), entry("c"), entry("d", { highlight: true })]),
    release("1.1.1", [entry("e", { type: "fix", severity: "critical" }), entry("f", { type: "fix", severity: "normal" })]),
    release("1.1.0", [entry("g", { highlight: true }), entry("h", { highlight: true }), entry("i", { highlight: true })]),
    release("1.0.0", [entry("j", { highlight: true })]),
  ],
}));

const ids = ({ groups }) => groups.map(({ release, entries }) => `${release.version}:${entries.map(({ id }) => id).join(",")}`);

test("only versions after the last one seen, up to the running one and without betas", () => {
  expect(releases.getWhatsNew("1.1.1").releases.map(({ version }) => version)).toEqual(["1.2.0"]);
});

test("critical fixes first, then highlights, at most 5, grouped by release", () => {
  // The critical fix of 1.1.1 is kept although it is not highlighted; the oldest highlight (i) is left out
  expect(ids(releases.getWhatsNew("1.0.0"))).toEqual(["1.2.0:a,b,d", "1.1.1:e", "1.1.0:g"]);
});

test("without a version seen, or when it is the running one, it shows the running release", () => {
  expect(ids(releases.getWhatsNew(null))).toEqual(["1.2.0:a,b,d"]);
  expect(ids(releases.getWhatsNew("1.2.0"))).toEqual(["1.2.0:a,b,d"]);
});

test("critical fixes show although they are not highlighted", () => {
  expect(ids(releases.getWhatsNew("1.1.0"))).toEqual(["1.2.0:a,b,d", "1.1.1:e"]);
});

test("newer versions are new for the user", () => {
  expect(releases.isNewVersion(null)).toBe(true);
  expect(releases.isNewVersion("1.1.1")).toBe(true);
  expect(releases.isNewVersion("1.2.0")).toBe(false);
});

test("count summaries omit zeros and add the critical fixes", () => {
  let copy = (key) => ({ count_feature: "{n} new", count_fix: "{n} fixed", count_fix_one: "{n} fixed", count_critical_one: "{n} critical" }[key]);
  expect(releases.getCountParts({ feature: 4, improvement: 0, fix: 1, critical: 1 }, copy).map(({ text }) => text)).toEqual([
    "4 new",
    "1 fixed (1 critical)",
  ]);
});

test("timeline links carry the running version and the last one seen", () => {
  expect(releases.getTimelineURL({ seen: "1.1.0" })).toBe("https://paramele.com/en/changelog?v=1.2.0&seen=1.1.0");
  expect(releases.getTimelineURL({ seen: "1.2.0" })).toBe("https://paramele.com/en/changelog?v=1.2.0");
});
