// Lists the commits since the last release tag (v<version>), oldest first, to write the notes of the next release and to fill the
// `added` and `commit` of its entries: the date and hash of the first commit of each change. `--since <ref>` starts elsewhere.
// npm run changelog:history [-- --since v1.0.0]
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

function getStart() {
  let index = process.argv.indexOf("--since");
  if (index >= 0) return process.argv[index + 1];
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  } catch (error) {
    return null;
  }
}

let start = getStart();
let range = start ? [`${start}..HEAD`] : [];
let log = git("log", "--reverse", "--no-merges", "--date=short", "--format=%ad %h %s", ...range);
console.log(start ? `Commits since ${start}:` : "No release tag yet, all commits:");
console.log(log || "(none)");
