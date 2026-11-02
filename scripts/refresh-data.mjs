// Downloads each tab listed in config.js from Google Sheets as CSV.
// Usage: SHEET_ID=<id> node scripts/refresh-data.mjs
// The sheet must be shared as "Anyone with the link can view".
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import vm from "node:vm";

const sheetId = process.env.SHEET_ID;
if (!sheetId) { console.error("SHEET_ID is not set"); process.exit(1); }

const ctx = { window: {} };
vm.runInNewContext(await readFile("config.js", "utf8"), ctx);
const sheets = ctx.window.MATRIX_CONFIG?.sheets ?? [];
if (!sheets.length) { console.error("No sheets in config.js"); process.exit(1); }

for (const s of sheets) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(s.gid ?? "0")}`;
  const res = await fetch(url, { redirect: "follow" });
  const type = res.headers.get("content-type") || "";
  const body = await res.text();
  // A private sheet returns an HTML sign-in page with 200 — don't commit that over good data.
  if (!res.ok || !type.includes("text/csv")) {
    console.error(`${s.name}: expected CSV, got HTTP ${res.status} (${type}). Is the sheet link-shared and the gid right?`);
    process.exit(1);
  }
  await mkdir(dirname(s.file), { recursive: true });
  await writeFile(s.file, body);
  console.log(`${s.name}: ${body.split("\n").length} lines -> ${s.file}`);
}
