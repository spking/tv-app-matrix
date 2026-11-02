// Converts a Google Sheets "Web page (.html, zipped)" export into data/matrix.json
// plus logo images in data/img/.
//
//   node scripts/build-data.mjs <folder with the unzipped export>
//
// The sheet layout is found by structure, not fixed row numbers, so adding OS rows
// or app columns in the sheet needs no change here:
//   row 1          title (A1) and subtitle (first other non-empty cell)
//   header row     first row after the title where every app column has a name
//   logo row       the row after it, if it holds images (optional)
//   OS rows        every row after that until the first blank row
//   "Síðast uppfært:" / "Uppfært:"   label cell, date in the next cell
//
// Logos: a file in logos/<slug>.(png|jpg|svg|webp) wins over the image in the sheet,
// so you can drop in sharper versions. Slugs are printed when the script runs.

import { readFile, writeFile, mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { parse } from "node-html-parser";

const MATRIX_TAB = process.env.MATRIX_TAB || "S.A.M";
const SOURCES_TAB = process.env.SOURCES_TAB || "Heimildir";
const OUT_JSON = "data/matrix.json";
const OUT_IMG = "data/img";
const UPDATED_LABEL = /^(síðast\s+)?uppfært:?$/i;

const dir = process.argv[2];
if (!dir) fail("Usage: node scripts/build-data.mjs <export folder>");

function fail(msg) { console.error("ERROR: " + msg); process.exit(1); }
const clean = (s) => s.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();

export function slug(s) {
  return s.toLowerCase()
    .replace(/þ/g, "th").replace(/ð/g, "d").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------- Sheet HTML -> grid of cells (honours colspan/rowspan) ----------
// Each cell: { text, runs: [{ t, href?, strike?, bold? }], img? }
function readGrid(html) {
  const root = parse(html);
  const table = root.querySelector("table.waffle") || root.querySelector("table");
  if (!table) throw new Error("no <table> found");
  const grid = [];
  const trs = table.querySelectorAll("tbody > tr");
  trs.forEach((tr, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const td of tr.childNodes.filter((n) => n.tagName === "TD")) {
      while (grid[r][c]) c++;
      const cell = readCell(td);
      const cs = +td.getAttribute("colspan") || 1, rs = +td.getAttribute("rowspan") || 1;
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
        grid[r + dr] ??= [];
        // Only the top-left slot carries the value; the rest of a merge reads as blank.
        grid[r + dr][c + dc] = dr === 0 && dc === 0 ? cell : { text: "", runs: [], merged: true };
      }
      c += cs;
    }
  });
  const width = Math.max(0, ...grid.map((r) => r.length));
  return grid.map((r) => Array.from({ length: width }, (_, i) => r[i] || { text: "", runs: [] }));
}

function readCell(td) {
  const runs = [];
  const walk = (node, ctx) => {
    if (node.nodeType === 3) {
      const t = node.text.replace(/ /g, " ");
      if (t) runs.push({ t, ...ctx });
      return;
    }
    if (node.tagName === "BR") { runs.push({ t: "\n", ...ctx }); return; }
    const next = { ...ctx };
    const style = (node.getAttribute?.("style") || "").toLowerCase();
    if (/line-through/.test(style)) next.strike = true;
    if (/font-weight:\s*(bold|[6-9]00)/.test(style)) next.bold = true;
    if (/font-weight:\s*(normal|[1-4]00)/.test(style)) delete next.bold;
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) next.href = stripTracking(href);
    }
    for (const ch of node.childNodes) walk(ch, next);
  };
  walk(td, {});
  // merge adjacent runs with identical formatting
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.href === r.href && !!last.strike === !!r.strike && !!last.bold === !!r.bold) last.t += r.t;
    else merged.push({ ...r });
  }
  for (const r of merged) for (const k of ["strike", "bold"]) if (!r[k]) delete r[k];
  const img = td.querySelector("img")?.getAttribute("src");
  return { text: clean(merged.map((r) => r.t).join("")), runs: merged, ...(img ? { img } : {}) };
}

// Google wraps some links as google.com/url?q=<real url>; unwrap them.
function stripTracking(href) {
  try {
    const u = new URL(href);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url" && u.searchParams.get("q")) return u.searchParams.get("q");
  } catch {}
  return href;
}

const isBlankRow = (row) => row.every((c) => !c.text && !c.img);

function findDate(grid) {
  for (const row of grid) for (let i = 0; i < row.length - 1; i++) {
    if (UPDATED_LABEL.test(row[i].text)) {
      const next = row.slice(i + 1).find((c) => c.text);
      if (next) return next.text;
    }
  }
  return null;
}

// ---------- Matrix tab ----------
function buildMatrix(grid) {
  const title = grid[0]?.[0]?.text || "Matrix";
  const subtitle = grid[0]?.slice(1).find((c) => c.text)?.text || "";

  // Header row: first row (after the title) whose first cell is a label and which has
  // a run of ≥2 consecutive non-empty cells starting in column B.
  let h = -1, nApps = 0;
  for (let r = 1; r < grid.length && h < 0; r++) {
    let n = 0;
    while (1 + n < grid[r].length && grid[r][1 + n].text && !UPDATED_LABEL.test(grid[r][1 + n].text)) n++;
    if (grid[r][0].text && n >= 2) { h = r; nApps = n; }
  }
  if (h < 0) throw new Error("could not find the header row (OS label in column A, app names from column B)");

  const cornerLabel = grid[h][0].text;
  let r = h + 1;
  const logoRow = grid[r] && grid[r].slice(1, 1 + nApps).some((c) => c.img) ? grid[r++] : null;
  while (r < grid.length && isBlankRow(grid[r])) r++;

  const apps = grid[h].slice(1, 1 + nApps).map((c, i) => ({
    name: c.text, slug: slug(c.text), sheetImg: logoRow?.[1 + i]?.img || null,
  }));

  const rows = [];
  for (; r < grid.length && !isBlankRow(grid[r]); r++) {
    const label = grid[r][0].text;
    if (!label) continue;
    // "TitanOS (Philips) 2024+" -> name "TitanOS", detail "(Philips) 2024+"
    const m = label.match(/^(.+?)\s+(\(.*)$/);
    rows.push({
      label,
      name: m ? m[1] : label,
      detail: m ? m[2] : "",
      values: grid[r].slice(1, 1 + nApps).map((c) => c.text),
    });
  }
  if (!rows.length) throw new Error("found the header row but no OS rows under it");

  // Signature: a lone text cell on the "Síðast uppfært" row, away from the label/date.
  let author = "";
  for (const row of grid) {
    const i = row.findIndex((c) => UPDATED_LABEL.test(c.text));
    if (i >= 0) author = row.slice(i + 2).map((c) => c.text).filter(Boolean).pop() || "";
  }

  return { title, subtitle, cornerLabel, updated: findDate(grid), author, apps, rows };
}

// ---------- Sources tab ----------
function buildSources(grid) {
  const items = [];
  for (const row of grid) {
    const cell = row.find((c) => c.text);
    if (!cell || UPDATED_LABEL.test(cell.text)) continue;
    const runs = cell.runs.map((x) => ({ ...x, t: x.t.replace(/\s+/g, " ") })).filter((x) => x.t);
    if (runs.length) { runs[0].t = runs[0].t.trimStart(); runs[runs.length - 1].t = runs[runs.length - 1].t.trimEnd(); }
    items.push({ runs, dead: runs.length > 0 && runs.every((x) => x.strike || !x.t.trim()) });
  }
  return { updated: findDate(grid), items };
}

// ---------- Logos ----------
async function resolveLogos(apps) {
  await rm(OUT_IMG, { recursive: true, force: true });
  await mkdir(OUT_IMG, { recursive: true });
  const overrides = existsSync("logos") ? await readdir("logos") : [];
  for (const app of apps) {
    const own = overrides.find((f) => basename(f, extname(f)) === app.slug && /\.(png|jpe?g|svg|webp)$/i.test(f));
    let src = null, how = "none — name only";
    if (own) { src = join("logos", own); how = "logos/" + own; }
    else if (app.sheetImg && existsSync(join(dir, app.sheetImg))) { src = join(dir, app.sheetImg); how = "from sheet"; }
    if (src) {
      const out = join(OUT_IMG, app.slug + extname(src).toLowerCase());
      await copyFile(src, out);
      app.logo = out;
    }
    console.log(`  ${app.name.padEnd(18)} slug=${app.slug.padEnd(16)} logo: ${how}`);
    delete app.sheetImg;
  }
}

// ---------- main ----------
const files = await readdir(dir);
const pick = (tab) => files.find((f) => f.toLowerCase() === (tab + ".html").toLowerCase());
const matrixFile = pick(MATRIX_TAB);
if (!matrixFile) fail(`"${MATRIX_TAB}.html" not found in ${dir} (found: ${files.join(", ")}). Set MATRIX_TAB if the tab was renamed.`);

let data;
try { data = buildMatrix(readGrid(await readFile(join(dir, matrixFile), "utf8"))); }
catch (e) { fail(`${matrixFile}: ${e.message}`); }

const sourcesFile = pick(SOURCES_TAB);
data.sources = sourcesFile ? buildSources(readGrid(await readFile(join(dir, sourcesFile), "utf8"))) : null;
if (!sourcesFile) console.warn(`  (no "${SOURCES_TAB}.html" tab — sources section will be hidden)`);

const widths = new Set(data.rows.map((r) => r.values.length));
if (widths.size !== 1) fail("rows have differing numbers of values");

console.log(`${data.title}: ${data.rows.length} OS rows × ${data.apps.length} apps, updated ${data.updated ?? "?"}`);
await resolveLogos(data.apps);
await mkdir("data", { recursive: true });
await writeFile(OUT_JSON, JSON.stringify(data, null, 2) + "\n");
console.log(`wrote ${OUT_JSON}` + (data.sources ? ` (+ ${data.sources.items.length} sources)` : ""));
