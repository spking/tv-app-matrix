// Rules for data/matrix.json. Shared by the editor (admin.html, before saving) and the
// deploy check (scripts/check.mjs), so a save the editor allows is always deployable
// and anything else stops the deploy with the last good version left live.
//
// Shape:
// {
//   title, subtitle, cornerLabel, updated, author: string
//   apps:    [{ name, logo? }]                      logo = "logos/<file>"
//   rows:    [{ name, detail, values: ["Já"|"Nei", …one per app] }]
//   sources: { updated, items: [{ label, url, note, dead }] }
// }

export const VALUES = ["Já", "Nei"];
export const LOGO_PATH = /^logos\/[A-Za-z0-9._-]+\.(png|jpe?g|svg|webp)$/;
const URL_RE = /^https?:\/\/\S+$/i;

export function validate(d) {
  const errors = [];
  const err = (where, msg) => errors.push(where ? `${where}: ${msg}` : msg);
  const str = (v, where, { required = false, max = 300 } = {}) => {
    if (typeof v !== "string") return err(where, "verður að vera texti");
    if (required && !v.trim()) err(where, "má ekki vera tómt");
    if (v.length > max) err(where, `of langt (hámark ${max} stafir)`);
  };

  if (!d || typeof d !== "object" || Array.isArray(d)) return ["Gögnin eru ekki á réttu formi"];

  str(d.title, "Titill", { required: true, max: 120 });
  for (const [k, label] of [["subtitle", "Undirtitill"], ["cornerLabel", "Dálkaheiti"], ["updated", "Síðast uppfært"], ["author", "Höfundur"]]) {
    str(d[k] ?? "", label, { max: 200 });
  }

  if (!Array.isArray(d.apps) || d.apps.length === 0) err("", "Það þarf að vera a.m.k. eitt app");
  else {
    if (d.apps.length > 40) err("", "Of mörg öpp (hámark 40)");
    const seen = new Set();
    d.apps.forEach((a, i) => {
      const where = `App ${i + 1}${a?.name ? ` (${a.name})` : ""}`;
      if (!a || typeof a !== "object") return err(where, "ógilt");
      str(a.name, where + " heiti", { required: true, max: 60 });
      const key = (a.name || "").trim().toLowerCase();
      if (key && seen.has(key)) err(where, "sama heiti kemur tvisvar fyrir");
      seen.add(key);
      if (a.logo != null && !LOGO_PATH.test(a.logo)) err(where, "ógild slóð á merki");
    });
  }

  const n = Array.isArray(d.apps) ? d.apps.length : 0;
  if (!Array.isArray(d.rows) || d.rows.length === 0) err("", "Það þarf að vera a.m.k. eitt stýrikerfi");
  else {
    if (d.rows.length > 200) err("", "Of mörg stýrikerfi (hámark 200)");
    const seen = new Set();
    d.rows.forEach((r, i) => {
      const where = `Stýrikerfi ${i + 1}${r?.name ? ` (${r.name})` : ""}`;
      if (!r || typeof r !== "object") return err(where, "ógilt");
      str(r.name, where + " heiti", { required: true, max: 80 });
      str(r.detail ?? "", where + " nánar", { max: 120 });
      const key = `${r.name} ${r.detail ?? ""}`.trim().toLowerCase();
      if (seen.has(key)) err(where, "sama stýrikerfi kemur tvisvar fyrir");
      seen.add(key);
      if (!Array.isArray(r.values) || r.values.length !== n) err(where, `þarf ${n} gildi, eitt fyrir hvert app`);
      else r.values.forEach((v, j) => { if (!VALUES.includes(v)) err(where, `gildi fyrir ${d.apps[j]?.name ?? j + 1} verður að vera Já eða Nei`); });
    });
  }

  if (d.sources != null) {
    if (typeof d.sources !== "object" || !Array.isArray(d.sources.items)) err("Heimildir", "ógilt");
    else {
      str(d.sources.updated ?? "", "Heimildir uppfærðar", { max: 40 });
      d.sources.items.forEach((s, i) => {
        const where = `Heimild ${i + 1}`;
        if (!s || typeof s !== "object") return err(where, "ógild");
        str(s.label ?? "", where + " texti", { max: 300 });
        str(s.note ?? "", where + " athugasemd", { max: 300 });
        if (s.url && !URL_RE.test(s.url)) err(where, "vefslóð verður að byrja á http:// eða https://");
        if (!s.label?.trim() && !s.url?.trim()) err(where, "þarf texta eða vefslóð");
      });
    }
  }
  return errors;
}

// "Tizen" + "(Samsung)" -> "Tizen (Samsung)"
export const rowLabel = (r) => (r.detail ? `${r.name} ${r.detail}` : r.name);
