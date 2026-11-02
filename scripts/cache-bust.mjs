// Gives every local script/stylesheet URL in the deployed site a ?v=<commit> suffix.
//   node scripts/cache-bust.mjs _site
// GitHub Pages lets browsers reuse files for 10 minutes. Without this, a browser can
// pair freshly deployed data with an old cached app.js. With it, a new deploy means
// new URLs, so browsers fetch the matching code straight away. Runs on the deployed
// copy only; the repo files stay unchanged.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const dir = process.argv[2];
if (!dir) { console.error("usage: cache-bust.mjs <site dir>"); process.exit(1); }
const v = execFileSync("git", ["rev-parse", "--short=10", "HEAD"], { encoding: "utf8" }).trim();

// Local, relative .js/.css only (no scheme, no leading slash), not already versioned.
const LOCAL = String.raw`(?![a-z]+:|\/)[\w./-]+\.(?:js|css)`;
const html = new RegExp(String.raw`(\s(?:src|href)=")(${LOCAL})(")`, "g");
const imports = new RegExp(String.raw`(\bfrom\s+["']|\bimport\s*\(\s*["'])(\.{1,2}\/[\w./-]+\.js)(["'])`, "g");

let n = 0;
for (const f of readdirSync(dir)) {
  const isHtml = f.endsWith(".html"), isJs = f.endsWith(".js");
  if (!isHtml && !isJs) continue;          // folders and other files untouched
  const p = join(dir, f);
  const before = readFileSync(p, "utf8");
  const after = isHtml
    ? before.replace(html, (_, a, url, b) => (n++, `${a}${url}?v=${v}${b}`))
    : before.replace(imports, (_, a, url, b) => (n++, `${a}${url}?v=${v}${b}`));
  if (after !== before) writeFileSync(p, after);
}
// Logos keep their file name when replaced in the editor, so tag those too.
const dataPath = join(dir, "data", "matrix.json");
const data = JSON.parse(readFileSync(dataPath, "utf8"));
for (const a of data.apps) if (a.logo && !a.logo.includes("?")) { a.logo += `?v=${v}`; n++; }
writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");

console.log(`cache-bust: ${n} URLs tagged ?v=${v}`);
