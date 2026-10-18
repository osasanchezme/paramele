# Changelog

The release notes of ParamEle, written once here and shown in the app (version badge, What's new panel) and on the site (the timeline at paramele.com/changelog).

- One file per release, `<version>.md`, with the notes in its YAML frontmatter (anything below the frontmatter is for maintainers and is not published).
- `unreleased.md` collects the notes of the next release. **Every pull request that changes what users see or do adds or updates an entry there.**
- `npm run changelog` validates the files and compiles them into `src/data/changelog.json` (bundled in the app) and `public/changelog.json` (served at app.paramele.com/changelog.json, read by the site when it builds). It runs before `npm start`, `npm run build` and `npm test`, so an invalid file or a version without notes stops the build. `npm run changelog:check` only validates.
- The app version is the `version` of `package.json`, shown as "ParamEle 1.4.2". The schema is in `scripts/changelog/schema.mjs`.

## Releasing

1. `npm run release` renames `unreleased.md` to `<version>.md` with today's date, bumps `package.json` and empties `unreleased.md`. The version follows [SemVer](https://semver.org) from the entries: `breaking: true` in `unreleased.md` → MAJOR (a breaking change to models, files or workflows), any `feature` → MINOR, only improvements and fixes → PATCH. `--major`, `--minor` or `--patch` force the bump, `--beta` makes a `-beta.N` pre-release, `--date YYYY-MM-DD` sets the date and `--dry-run` only prints the version.
2. Review the new file, commit, and deploy the app (`npm run deploy`).
3. Tag the release commit once it is on `main`: `git tag -a v1.4.2 -m "ParamEle 1.4.2" && git push origin v1.4.2`. The tags mark what each version contains, and `npm run changelog:history` starts from the last one.
4. Deploy the site afterwards, so its timeline reads the new `changelog.json`.

`npm run changelog:history` lists the commits since the last tag (or `--since <ref>`), oldest first: the raw material for the notes of the next release and for the `added` and `commit` of its entries.

## Format

```yaml
---
version: 1.4.2            # SemVer, the file name
date: 2026-10-20          # release day
title: { es: Manada, en: Herd }   # optional name, for milestones
summary:                  # one line for the timeline card
  en: Faster exports and a fix for lost parameters
  es: Exportaciones más rápidas y una corrección para parámetros perdidos
milestone: false          # shown larger on the timeline
channel: stable           # or beta (needs a -beta.N version), hidden unless the Beta filter is on
entries:
  - id: param-loss-fix    # stable kebab-case slug, unique across all releases (deep link /changelog#param-loss-fix)
    type: fix             # feature | improvement | fix
    severity: critical    # fixes only: critical | normal
    area: [modeling]      # modeling, analysis, results, files, collaboration, import-export, units, samples, ui, performance
    added: 2026-10-14     # optional: when it first reached the app (estimated from the git history)
    commit: "1c977cd"     # optional: that first commit, in quotes (YAML reads some hashes as numbers)
    title:                # under 80 characters, starts with the benefit
      en: Parameters no longer reset after undo
      es: Los parámetros ya no se reinician al deshacer
    description:          # optional, Markdown
      en: Re-open affected files to recover their parameters.
      es: Vuelve a abrir los archivos afectados para recuperar sus parámetros.
    media: /changelog-media/param-loss-fix.webp   # optional screenshot or GIF (public/changelog-media), one per entry
    highlight: true       # shown in the app's What's new panel
    links: [https://paramele.com/blog/...]        # optional docs or help articles
---
```

Texts are `{es, en}`; a plain string is used for both languages.

`added` and `commit` are for releases that gather a long development, like 1.0.0: the site's page of the release (`/changelog/<version>/`) draws a development timeline from them, with each change in the month it first landed and a link to its commit. The build checks that the commits exist in the repo.

## Writing

- Write for the user: what they can now do, or what stopped breaking, in one plain sentence. "You can now export to PDF", not "Refactored export module".
- Critical fixes say what was wrong, who was affected and whether they need to do anything.
- Titles under 80 characters, no internal ticket IDs or code names, at most one screenshot or GIF per entry.
