// Picks each app's logo and writes it to data/img/<slug>.<ext>, updating data/matrix.json.
//
//   node scripts/apply-logos.mjs
//
// Order of preference per app:
//   1. a file in logos/ whose name matches the app's slug, ignoring dashes and case
//      (Nova TV → "nova-tv": nova-tv.png, novatv.png and NovaTV.png all match)
//   2. the image from the sheet's logo row (data/img/sheet/<slug>.*, written by build-data)
//   3. none: the site shows a two-letter placeholder
//
// Runs on every deploy, so adding, replacing or deleting a file in logos/ takes effect
// on push without touching the sheet. Files in logos/ that match no app are reported.

import { readFile, writeFile, readdir, copyFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { pathToFileURL } from "node:url";

const IMG = /\.(png|jpe?g|svg|webp)$/i;
const loose = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function applyLogos({ json = "data/matrix.json", logosDir = "logos", imgDir = "data/img" } = {}) {
  const data = JSON.parse(await readFile(json, "utf8"));
  const own = existsSync(logosDir) ? (await readdir(logosDir)).filter((f) => IMG.test(f)) : [];
  const sheetDir = join(imgDir, "sheet");
  const fromSheet = existsSync(sheetDir) ? await readdir(sheetDir) : [];

  // Clear previous picks (but not the sheet's originals).
  await mkdir(imgDir, { recursive: true });
  for (const f of await readdir(imgDir)) if (IMG.test(f)) await rm(join(imgDir, f));

  const used = new Set();
  const report = [];
  for (const app of data.apps) {
    const key = loose(app.slug);
    const match = own.filter((f) => loose(basename(f, extname(f))) === key);
    if (match.length > 1) warn(`${app.name}: several files in ${logosDir}/ match (${match.join(", ")}); using ${match[0]}`);
    const sheet = fromSheet.find((f) => basename(f, extname(f)) === app.slug);
    let src = null, how;
    if (match.length) { src = join(logosDir, match[0]); how = `${logosDir}/${match[0]}`; used.add(match[0]); }
    else if (sheet) { src = join(sheetDir, sheet); how = "from sheet"; }
    else how = "none (placeholder)";
    if (src) {
      const out = join(imgDir, app.slug + extname(src).toLowerCase());
      await copyFile(src, out);
      app.logo = out.split("\\").join("/");
    } else delete app.logo;
    report.push(`  ${app.name.padEnd(18)} ${("[" + app.slug + "]").padEnd(18)} ${how}`);
  }

  for (const f of own) {
    if (!used.has(f)) {
      warn(`${logosDir}/${f} matches no app. Rename it to one of: ${data.apps.map((a) => a.slug + extname(f)).join(", ")}`);
    }
  }

  await writeFile(json, JSON.stringify(data, null, 2) + "\n");
  console.log("Logos:\n" + report.join("\n"));
}

// In GitHub Actions this shows as a yellow warning on the run; locally it's a plain line.
function warn(msg) {
  console.log((process.env.GITHUB_ACTIONS ? "::warning::" : "WARNING: ") + msg);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await applyLogos();
