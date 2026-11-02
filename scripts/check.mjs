// Deploy gate: refuses to publish data/matrix.json unless it passes the same rules the
// editor uses (validate.js) and every referenced logo file exists.
//   node scripts/check.mjs
import { readFileSync, existsSync, statSync } from "node:fs";
import { validate } from "../validate.js";

const fail = (msgs) => {
  for (const m of msgs) console.log((process.env.GITHUB_ACTIONS ? "::error::" : "ERROR: ") + m);
  console.log("\nNot deployed — the site keeps its last good version.");
  process.exit(1);
};

let data;
try { data = JSON.parse(readFileSync("data/matrix.json", "utf8")); }
catch (e) { fail([`data/matrix.json is not valid JSON: ${e.message}`]); }

const errors = validate(data);
for (const a of data.apps || []) {
  if (!a.logo) continue;
  if (!existsSync(a.logo)) errors.push(`${a.name}: logo file ${a.logo} is missing`);
  else if (statSync(a.logo).size > 1024 * 1024) errors.push(`${a.name}: ${a.logo} is over 1 MB`);
}
if (errors.length) fail(errors);
console.log(`OK: ${data.rows.length} OS × ${data.apps.length} apps, ${data.sources?.items.length ?? 0} sources, updated ${data.updated}`);
