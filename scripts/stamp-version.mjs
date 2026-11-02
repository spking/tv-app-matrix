// Stamps the version into the deployed copy of the data (never into the repo).
//   node scripts/stamp-version.mjs _site/data/matrix.json
// minor = commit count − base, so it is the same for the same commit (a redeploy of
// unchanged content keeps its number) and rises by one per commit pushed.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const target = process.argv[2];
if (!target) { console.error("usage: stamp-version.mjs <deployed matrix.json>"); process.exit(1); }

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("rev-parse", "--is-shallow-repository") === "true") {
  console.error("Shallow clone: commit count would be wrong. Check out with fetch-depth: 0.");
  process.exit(1);
}
const { major, base } = JSON.parse(readFileSync("version.json", "utf8"));
const count = Number(git("rev-list", "--count", "HEAD"));
const minor = Math.max(0, count - base);

const data = JSON.parse(readFileSync(target, "utf8"));
data.version = `${major}.${minor}`;
data.versionDate = git("log", "-1", "--format=%cs");   // yyyy-mm-dd of the commit
writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
console.log(`version ${data.version} (commit ${count}, ${data.versionDate})`);
