// Schema of the release notes in changelog/*.md (YAML frontmatter), shared by build_changelog.mjs and release.mjs.
// Texts shown to users are {es, en}; a plain string is used for both languages.
import { z } from "zod";
import semver from "semver";

export const LANGUAGES = ["es", "en"];
export const ENTRY_TYPES = ["feature", "improvement", "fix"];
export const SEVERITIES = ["critical", "normal"];
export const CHANNELS = ["stable", "beta"];

// Areas of the app an entry can touch, with the labels the filters show
export const AREAS = {
  modeling: { es: "Modelado", en: "Modeling" },
  analysis: { es: "Análisis", en: "Analysis" },
  results: { es: "Resultados", en: "Results" },
  files: { es: "Archivos", en: "Files" },
  collaboration: { es: "Colaboración", en: "Collaboration" },
  "import-export": { es: "Importar y exportar", en: "Import and export" },
  units: { es: "Unidades", en: "Units" },
  samples: { es: "Ejemplos", en: "Samples" },
  ui: { es: "Interfaz", en: "Interface" },
  performance: { es: "Rendimiento", en: "Performance" },
};

const TITLE_MAX = 80;

/**
 * A text in both languages, or one string for both
 * @param {number} [max] Maximum length of each language
 */
function localized(max) {
  const text = max ? z.string().trim().min(1).max(max) : z.string().trim().min(1);
  return z.union([text.transform((value) => ({ es: value, en: value })), z.strictObject({ es: text, en: text })]);
}

const isoDate = z.union([
  z.date().transform((date) => date.toISOString().slice(0, 10)),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
]);
const url = z.string().refine((value) => /^(https?:\/\/|\/)/.test(value), "must be an absolute URL or a path starting with /");

export const entrySchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be a kebab-case slug"),
    type: z.enum(ENTRY_TYPES),
    severity: z.enum(SEVERITIES).optional(),
    area: z.array(z.enum(Object.keys(AREAS))).min(1),
    // When the change first reached the app (estimated from the git history for releases that collect a long development),
    // and that first commit. They draw the development timeline of the release page
    added: isoDate.optional(),
    // In quotes: YAML reads hashes such as 005e072 as numbers
    commit: z
      .string({ error: 'must be a commit hash in quotes, e.g. "1c977cd"' })
      .regex(/^[0-9a-f]{7,40}$/, "must be a commit hash")
      .optional(),
    title: localized(TITLE_MAX),
    description: localized().optional(),
    media: url.optional(),
    highlight: z.boolean().default(false),
    links: z.array(url).default([]),
  })
  .superRefine((entry, context) => {
    if (entry.type === "fix" && !entry.severity)
      context.addIssue({ code: "custom", path: ["severity"], message: "fixes need a severity (critical or normal)" });
    if (entry.type !== "fix" && entry.severity) context.addIssue({ code: "custom", path: ["severity"], message: "only fixes have a severity" });
  });

const releaseFields = {
  title: localized(40).optional(),
  summary: localized(120),
  milestone: z.boolean().default(false),
  entries: z.array(entrySchema).min(1),
};

export const releaseSchema = z
  .strictObject({
    version: z.string().refine((value) => semver.valid(value) === value, "must be a SemVer version, e.g. 1.4.2"),
    date: isoDate,
    channel: z.enum(CHANNELS).default("stable"),
    ...releaseFields,
  })
  .superRefine((release, context) => {
    let is_prerelease = semver.prerelease(release.version) !== null;
    if (is_prerelease && release.channel !== "beta")
      context.addIssue({ code: "custom", path: ["channel"], message: "pre-release versions go in the beta channel" });
    if (!is_prerelease && release.channel === "beta")
      context.addIssue({ code: "custom", path: ["version"], message: "beta releases need a -beta.N version" });
  });

// changelog/unreleased.md: the next release, without version and date until release.mjs sets them. It may have no entries yet
export const unreleasedSchema = z.strictObject({
  ...releaseFields,
  summary: localized(120).optional(),
  entries: z.array(entrySchema).default([]),
  // A breaking change to models, files or workflows: the next release is a MAJOR one
  breaking: z.boolean().default(false),
});
