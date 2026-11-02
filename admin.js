// Editor for data/matrix.json. Saves by committing to the GitHub repo with the editor's
// own token; the deploy workflow re-validates and publishes. See README.md.
import { validate, rowLabel } from "./validate.js";
import { renderGuide } from "./render-guide.js";

// The page adds the brackets around the TV brands itself, so drop any typed in.
const cleanDetail = (d) => (d || "").trim().replace(/^\((.*)\)$/, "$1").trim();
const label = (r) => rowLabel({ name: (r.name || "").trim(), detail: cleanDetail(r.detail) });

const OWNER = "spking", REPO = "tv-app-matrix", BRANCH = "main";
const DATA_PATH = "data/matrix.json";
const WORKFLOW_NAME = "Update & deploy";
const TOKEN_KEY = "tvm-token";
const LOGO_MAX = 256;            // px, longest side
const SVG_MAX = 200 * 1024;      // bytes

const $ = (id) => document.getElementById(id);
function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== "string") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

// ---------- token ----------
const store = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(t, remember) {
    try { (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t); } catch {}
  },
  clear() { try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch {} },
};
let token = null;

// ---------- GitHub API ----------
class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function gh(path, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  return raw ? res.text() : res.status === 204 ? null : res.json();
}

// ---------- state ----------
// Every app/row/source gets a hidden _id at load so changes can be described by identity
// (a renamed app is "renamed", not "removed + added").
let nextId = 1;
let loadedHead = null;     // commit sha the edit is based on
let original = null;       // parsed data as loaded, with _ids
let originalText = "";     // exact file text as loaded
let state = null;          // what's being edited

const withIds = (d) => {
  for (const a of d.apps) a._id ??= nextId++;
  for (const r of d.rows) r._id ??= nextId++;
  d.sources ??= { updated: "", items: [] };
  d.guide ??= { title: "Leiðavísir", text: "" };
  for (const s of d.sources.items) s._id ??= nextId++;
  return d;
};
const clone = (d) => structuredClone(d);

// Output in a fixed key order so diffs stay readable in git.
function serialize(d) {
  const out = {
    title: d.title, subtitle: d.subtitle || "", cornerLabel: d.cornerLabel || "",
    apps: d.apps.map((a) => (a.logo ? { name: a.name.trim(), logo: a.logo } : { name: a.name.trim() })),
    rows: d.rows.map((r) => ({ name: r.name.trim(), detail: cleanDetail(r.detail), values: [...r.values] })),
    guide: { title: (d.guide?.title || "").trim() || "Leiðavísir", text: (d.guide?.text || "").replace(/\s+$/, "") },
    sources: {
      updated: d.sources.updated || "",
      items: d.sources.items.map((s) => ({ label: (s.label || "").trim(), url: (s.url || "").trim(), note: (s.note || "").trim(), dead: !!s.dead })),
    },
  };
  return JSON.stringify(out, null, 2) + "\n";
}
const pendingLogos = () => state.apps.filter((a) => a._pending);
const isDirty = () => state && (serialize(state) !== originalText || pendingLogos().length > 0);

function today() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ---------- describing changes ----------
function describeChanges(a, b) {
  const out = [];
  const byId = (list) => new Map(list.map((x) => [x._id, x]));
  const oa = byId(a.apps), na = byId(b.apps), or = byId(a.rows), nr = byId(b.rows);

  for (const [k, label] of [["title", "Titill"], ["subtitle", "Undirtitill"], ["cornerLabel", "Dálkaheiti"]]) {
    if ((a[k] || "") !== (b[k] || "")) out.push(`${label}: „${a[k] || ""}“ → „${b[k] || ""}“`);
  }
  for (const x of b.apps) {
    const o = oa.get(x._id);
    if (!o) out.push(`Nýtt app: ${x.name}`);
    else {
      if (o.name !== x.name) out.push(`App endurnefnt: ${o.name} → ${x.name}`);
      if (x._pending) out.push(`Nýtt merki: ${x.name}`);
      else if (o.logo && !x.logo) out.push(`Merki fjarlægt: ${x.name}`);
    }
  }
  for (const o of a.apps) if (!na.has(o._id)) out.push(`App fjarlægt: ${o.name}`);
  for (const x of b.rows) {
    const o = or.get(x._id);
    if (!o) { out.push(`Nýtt stýrikerfi: ${label(x)}`); continue; }
    if (label(o) !== label(x)) out.push(`Stýrikerfi endurnefnt: ${label(o)} → ${label(x)}`);
    b.apps.forEach((app, j) => {
      const i = a.apps.findIndex((p) => p._id === app._id);
      if (i >= 0 && o.values[i] !== x.values[j]) out.push(`${app.name} á ${label(x)}: ${o.values[i]} → ${x.values[j]}`);
    });
  }
  for (const o of a.rows) if (!nr.has(o._id)) out.push(`Stýrikerfi fjarlægt: ${label(o)}`);
  const common = (x, y) => x.map((i) => i._id).filter((id) => y.some((j) => j._id === id)).join(",");
  if (common(a.apps, b.apps) !== common(b.apps, a.apps)) out.push("Röð appa breytt");
  if (common(a.rows, b.rows) !== common(b.rows, a.rows)) out.push("Röð stýrikerfa breytt");
  const ga = JSON.parse(serialize(a)).guide, gb = JSON.parse(serialize(b)).guide;
  if (ga.title !== gb.title) out.push(`Fyrirsögn leiðavísis: „${ga.title}“ → „${gb.title}“`);
  if (ga.text !== gb.text) out.push(!ga.text ? "Leiðavísir: texta bætt við" : !gb.text ? "Leiðavísir: texti fjarlægður" : "Leiðavísi breytt");
  const srcA = JSON.stringify(serializeSources(a)), srcB = JSON.stringify(serializeSources(b));
  if (srcA !== srcB) {
    const n = b.sources.items.length - a.sources.items.length;
    out.push(n > 0 ? `Heimildir: ${n} bætt við` : n < 0 ? `Heimildir: ${-n} fjarlægð(ar)` : "Heimildum breytt");
  }
  return out;
}
const serializeSources = (d) => JSON.parse(serialize(d)).sources.items;

// ---------- rendering ----------
function render() {
  renderGrid();
  renderGeneral();
  renderGuideEditor();
  renderSources();
  updateDirty();
}

function updateDirty() {
  const dirty = isDirty();
  $("save").disabled = !dirty;
  $("discard").disabled = !dirty;
  if (!dirty) { $("dirty").textContent = "Engar breytingar"; return; }
  const n = describeChanges(original, state).length || 1;
  $("dirty").textContent = n === 1 ? "1 óvistuð breyting" : `${n} óvistaðar breytingar`;
}

function slug(s) {
  return s.toLowerCase().replace(/þ/g, "th").replace(/ð/g, "d").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
}

// Logos saved this session aren't on the live site until the deploy finishes; keep
// showing the local copy until then.
const savedPreviews = new Map();

function logoTile(app) {
  const src = app._pending?.preview || savedPreviews.get(app.logo) || app.logo;
  const tile = h("span", { class: "logo" + (src ? "" : " placeholder") },
    src ? h("img", { src, alt: "" }) : app.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2));
  return tile;
}

function iconButton(label, text, onclick, disabled = false) {
  return h("button", { type: "button", class: "icon", title: label, "aria-label": label, onclick, disabled }, text);
}

function move(list, i, d) {
  const j = i + d;
  if (j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  return true;
}

function renderGrid() {
  const t = $("grid");
  t.replaceChildren();
  const apps = state.apps;

  const head = h("tr", {}, h("th", { class: "corner" }, state.cornerLabel || "Stýrikerfi / App"));
  apps.forEach((app, j) => {
    const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", hidden: true,
      onchange: (e) => e.target.files[0] && pickLogo(app, e.target.files[0]) });
    const name = h("input", { class: "app-name-input", value: app.name, "aria-label": "Heiti apps", size: 10,
      oninput: (e) => { app.name = e.target.value; updateDirty(); } });
    head.append(h("th", { class: "app-col" },
      h("button", { type: "button", class: "logo-btn", title: "Hlaða upp merki", onclick: () => file.click() }, logoTile(app)),
      file,
      name,
      h("div", { class: "mini" },
        iconButton("Færa til vinstri", "◀", () => { move(apps, j, -1) && moveValues(j, j - 1); render(); }, j === 0),
        (app.logo || app._pending) ? iconButton("Fjarlægja merki", "⌫", () => { delete app._pending; delete app.logo; render(); }) : null,
        iconButton("Eyða appi", "✕", () => {
          if (!confirm(`Eyða appinu „${app.name}“ og öllum Já/Nei gildum þess?`)) return;
          apps.splice(j, 1); state.rows.forEach((r) => r.values.splice(j, 1)); render();
        }),
        iconButton("Færa til hægri", "▶", () => { move(apps, j, 1) && moveValues(j, j + 1); render(); }, j === apps.length - 1),
      )));
  });
  t.append(h("thead", {}, head));

  const body = h("tbody");
  state.rows.forEach((row, i) => {
    const tr = h("tr", {}, h("th", { class: "row-edit" },
      h("input", { class: "os-name-input", value: row.name, placeholder: "Heiti, t.d. Tizen eða TitanOS 2024+", "aria-label": "Heiti stýrikerfis",
        oninput: (e) => { row.name = e.target.value; updateDirty(); } }),
      h("input", { class: "os-detail-input", value: row.detail || "", placeholder: "Sjónvörp, t.d. Samsung, LG", "aria-label": "Sjónvörp (sýnt í ⓘ)", title: "Sýnt þegar smellt er á ⓘ",
        oninput: (e) => { row.detail = e.target.value; updateDirty(); } }),
      h("div", { class: "mini" },
        iconButton("Færa upp", "▲", () => { move(state.rows, i, -1); render(); }, i === 0),
        iconButton("Færa niður", "▼", () => { move(state.rows, i, 1); render(); }, i === state.rows.length - 1),
        iconButton("Eyða stýrikerfi", "✕", () => {
          if (!confirm(`Eyða „${label(row) || "nýju stýrikerfi"}“?`)) return;
          state.rows.splice(i, 1); render();
        }),
      )));
    row.values.forEach((v, j) => {
      const btn = h("button", { type: "button", class: "toggle" });
      const paint = () => {
        const yes = row.values[j] === "Já";
        btn.className = "toggle tick " + (yes ? "yes" : "no");
        btn.replaceChildren(tickIcon(yes));
        btn.title = yes ? "Já – smelltu til að breyta í Nei" : "Nei – smelltu til að breyta í Já";
        btn.setAttribute("aria-label", `${apps[j].name} á ${label(row)}: ${row.values[j]}`);
      };
      btn.addEventListener("click", () => { row.values[j] = row.values[j] === "Já" ? "Nei" : "Já"; paint(); updateDirty(); });
      paint();
      tr.append(h("td", {}, btn));
    });
    body.append(tr);
  });
  t.append(body);
}

const SVG_NS = "http://www.w3.org/2000/svg";
function tickIcon(yes) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", yes ? "M3.5 8.5l3 3 6-7" : "M4.5 4.5l7 7M11.5 4.5l-7 7");
  svg.append(path);
  return svg;
}

function moveValues(a, b) { for (const r of state.rows) [r.values[a], r.values[b]] = [r.values[b], r.values[a]]; }

function renderGeneral() {
  for (const input of document.querySelectorAll("[data-field]")) {
    const k = input.dataset.field;
    input.value = state[k] || "";
    input.oninput = () => { state[k] = input.value; if (k === "cornerLabel") document.querySelector("#grid .corner").textContent = input.value; updateDirty(); };
  }
}

function renderGuideEditor() {
  const title = $("guide-title-input"), text = $("guide-text");
  const preview = () => {
    $("guide-preview-title").textContent = title.value.trim() || "Leiðavísir";
    $("guide-empty").hidden = renderGuide($("guide-preview"), text.value);
  };
  title.value = state.guide.title || "";
  text.value = state.guide.text || "";
  title.oninput = () => { state.guide.title = title.value; preview(); updateDirty(); };
  text.oninput = () => { state.guide.text = text.value; preview(); updateDirty(); };
  preview();
}

function renderSources() {
  const ol = $("sources");
  ol.replaceChildren();
  const items = state.sources.items;
  items.forEach((s, i) => {
    const bind = (k) => (e) => { s[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; updateDirty(); };
    ol.append(h("li", { class: s.dead ? "dead-src" : "" },
      h("input", { value: s.label || "", placeholder: "Texti (t.d. heiti greinar eða nafn)", "aria-label": "Texti", oninput: bind("label") }),
      h("input", { value: s.url || "", placeholder: "https://…", type: "url", "aria-label": "Vefslóð", oninput: bind("url") }),
      h("input", { value: s.note || "", placeholder: "Athugasemd, t.d. (Mars 2026)", "aria-label": "Athugasemd", class: "note", oninput: bind("note") }),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!s.dead, onchange: (e) => { bind("dead")(e); e.target.closest("li").classList.toggle("dead-src", s.dead); } }), "Úrelt"),
      h("div", { class: "mini" },
        iconButton("Færa upp", "▲", () => { move(items, i, -1); renderSources(); updateDirty(); }, i === 0),
        iconButton("Færa niður", "▼", () => { move(items, i, 1); renderSources(); updateDirty(); }, i === items.length - 1),
        iconButton("Eyða heimild", "✕", () => { items.splice(i, 1); renderSources(); updateDirty(); }),
      )));
  });
}

// ---------- logos ----------
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function pickLogo(app, file) {
  try {
    let base64, ext, preview;
    if (file.type === "image/svg+xml") {
      if (file.size > SVG_MAX) throw new Error("SVG-skráin er of stór (hámark 200 KB).");
      base64 = toBase64(await file.arrayBuffer());
      ext = "svg";
      preview = URL.createObjectURL(file);
    } else {
      // Downscale so the site doesn't ship 2000-px images for a 36-px tile.
      const url = URL.createObjectURL(file);
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("Gat ekki lesið myndina.")); i.src = url; });
      const scale = Math.min(1, LOGO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const jpeg = file.type === "image/jpeg";
      ext = jpeg ? "jpg" : "png";
      const blob = await new Promise((ok) => c.toBlob(ok, jpeg ? "image/jpeg" : "image/png", 0.9));
      base64 = toBase64(await blob.arrayBuffer());
      preview = URL.createObjectURL(blob);
    }
    // Unique path per app; don't overwrite another app's file.
    let path = `logos/${slug(app.name)}.${ext}`, n = 2;
    while (state.apps.some((a) => a !== app && (a.logo === path || a._pending?.path === path))) path = `logos/${slug(app.name)}-${n++}.${ext}`;
    app._pending = { path, base64, preview };
    app.logo = path;
    render();
  } catch (e) {
    showNotice("error", e.message);
  }
}

// ---------- notices ----------
function showNotice(kind, ...content) {
  const n = $("notice");
  n.className = "notice " + kind;
  n.replaceChildren(...content);
  n.hidden = false;
}

// ---------- load / save ----------
async function load() {
  const ref = await gh(`/git/ref/heads/${BRANCH}`);
  loadedHead = ref.object.sha;
  originalText = await gh(`/contents/${DATA_PATH}?ref=${loadedHead}`, { raw: true });
  original = withIds(JSON.parse(originalText));
  state = clone(original);
  // Re-serialize so the "dirty" check compares like with like.
  originalText = serialize(original);
  render();
}

async function save() {
  // Work on a copy, so a failed save leaves the editor exactly as it was.
  const next = clone(state);
  for (const a of next.apps) delete a._pending;
  const changes = describeChanges(original, state);
  if (!changes.length && !pendingLogos().length) return;
  $("notice").hidden = true;   // clear any earlier error

  // The sources' "uppfært" date follows changes to the sources.
  if (JSON.stringify(serializeSources(original)) !== JSON.stringify(serializeSources(next))) next.sources.updated = today();

  const text = serialize(next);
  const errors = validate(JSON.parse(text));
  if (errors.length) {
    showNotice("error", h("strong", {}, "Ekki hægt að vista:"), h("ul", {}, errors.map((e) => h("li", {}, e))));
    return;
  }

  // Confirm, listing the changes in plain words.
  $("change-list").replaceChildren(...changes.map((c) => h("li", {}, c)));
  const dlg = $("confirm-save");
  dlg.returnValue = "";
  dlg.showModal();
  const answer = await new Promise((ok) => dlg.addEventListener("close", () => ok(dlg.returnValue), { once: true }));
  if (answer !== "ok") return;

  $("save").disabled = true;
  showNotice("info", "Vista…");
  try {
    const head = (await gh(`/git/ref/heads/${BRANCH}`)).object.sha;
    if (head !== loadedHead) throw new ApiError(409, "conflict");
    const baseTree = (await gh(`/git/commits/${head}`)).tree.sha;

    const tree = [{ path: DATA_PATH, mode: "100644", type: "blob", content: text }];
    for (const a of pendingLogos()) {
      const blob = await gh("/git/blobs", { method: "POST", body: { content: a._pending.base64, encoding: "base64" } });
      tree.push({ path: a._pending.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    // Remove logo files nothing refers to any more (replaced or removed logos).
    const keep = new Set(next.apps.map((a) => a.logo).filter(Boolean));
    for (const p of new Set(original.apps.map((a) => a.logo).filter(Boolean))) {
      if (!keep.has(p) && !tree.some((t) => t.path === p)) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
    }

    const newTree = await gh("/git/trees", { method: "POST", body: { base_tree: baseTree, tree } });
    const title = changes.length === 1 ? changes[0] : `${changes[0]} (+${changes.length - 1})`;
    const message = `Matrix: ${title}\n\n${changes.map((c) => "- " + c).join("\n")}\n\nVistað í ritlinum (admin.html).`;
    const commit = await gh("/git/commits", { method: "POST", body: { message, tree: newTree.sha, parents: [head] } });
    await gh(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: commit.sha, force: false } });

    for (const a of pendingLogos()) savedPreviews.set(a._pending.path, a._pending.preview);
    // Saved: this is now the baseline.
    loadedHead = commit.sha;
    original = withIds(clone(next));
    originalText = serialize(original);
    state = clone(original);
    render();
    followDeploy(commit.sha);
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      showNotice("error", "Einhver annar vistaði breytingar á meðan þú varst að breyta, svo ekkert var vistað. ",
        "Afritaðu breytingarnar þínar ef þarf, ",
        h("button", { type: "button", onclick: () => location.reload() }, "endurhladdu"), " og reyndu aftur.");
    } else if (e.status === 403) {
      showNotice("error", "Lykillinn hefur ekki leyfi til að vista. Hann þarf heimildina „Contents: Read and write“ fyrir ", h("code", {}, `${OWNER}/${REPO}`), ".");
    } else showNotice("error", "Vistun mistókst: " + e.message);
    updateDirty();
  }
}

// Poll the deploy run for the commit, so the editor can say when it's live.
async function followDeploy(sha) {
  const actionsUrl = `https://github.com/${OWNER}/${REPO}/actions`;
  const link = (text, href) => h("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);
  showNotice("info", "Vistað ✓ Verið að birta á síðunni…");
  const started = Date.now();
  while (Date.now() - started < 6 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    let run;
    try {
      const res = await gh(`/actions/runs?head_sha=${sha}&per_page=10`);
      run = res.workflow_runs.find((r) => r.name === WORKFLOW_NAME);
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        showNotice("ok", "Vistað ✓ Síðan uppfærist eftir um mínútu. ", link("Fylgjast með á GitHub", actionsUrl));
        return;
      }
      continue;
    }
    if (!run || run.status !== "completed") continue;
    if (run.conclusion === "success") {
      showNotice("ok", "Vistað og komið á síðuna ✓ ", link("Opna síðuna", "./"));
    } else {
      showNotice("error", "Vistað, en birting mistókst, svo síðan sýnir áfram fyrri útgáfu. ", link("Sjá villuna á GitHub", run.html_url));
    }
    return;
  }
  showNotice("info", "Vistað ✓ Birting tekur lengri tíma en venjulega. ", link("Fylgjast með á GitHub", actionsUrl));
}

// ---------- connect ----------
async function connect(t) {
  token = t;
  const repo = await gh("");
  if (!repo.permissions?.push) throw new ApiError(403, "Lykillinn hefur ekki skrifaðgang að geymslunni.");
}

function showConnect(error) {
  $("loading").hidden = true;
  $("editor").hidden = true;
  $("connect").hidden = false;
  $("repo-name").textContent = `${OWNER}/${REPO}`;
  $("connect-error").hidden = !error;
  if (error) $("connect-error").textContent = error;
}

async function start(t, remember) {
  $("loading").hidden = false;
  $("connect").hidden = true;
  try {
    await connect(t);
    if (remember != null) store.set(t, remember);
    await load();
    $("loading").hidden = true;
    $("editor").hidden = false;
  } catch (e) {
    store.clear();
    token = null;
    const msg = e.status === 401 ? "Lykillinn er ógildur eða útrunninn."
      : e.status === 404 ? `Lykillinn hefur ekki aðgang að ${OWNER}/${REPO}.`
      : e.message;
    showConnect(msg);
  }
}

function init() {
  $("connect-form").addEventListener("submit", (e) => {
    e.preventDefault();
    start($("token").value.trim(), $("remember").checked);
  });
  $("disconnect").addEventListener("click", () => {
    if (isDirty() && !confirm("Þú átt óvistaðar breytingar. Aftengjast samt?")) return;
    store.clear(); token = null; state = null; showConnect();
  });
  $("save").addEventListener("click", save);
  $("discard").addEventListener("click", () => {
    if (!confirm("Henda öllum óvistuðum breytingum?")) return;
    state = clone(original); $("notice").hidden = true; render();
  });
  $("add-app").addEventListener("click", () => {
    state.apps.push({ _id: nextId++, name: "" });
    state.rows.forEach((r) => r.values.push("Nei"));
    render();
    [...document.querySelectorAll(".app-name-input")].pop()?.focus();
  });
  $("add-row").addEventListener("click", () => {
    state.rows.push({ _id: nextId++, name: "", detail: "", values: state.apps.map(() => "Nei") });
    render();
    [...document.querySelectorAll(".os-name-input")].pop()?.focus();
  });
  $("add-source").addEventListener("click", () => {
    state.sources.items.push({ _id: nextId++, label: "", url: "", note: "", dead: false });
    renderSources(); updateDirty();
    [...document.querySelectorAll("#sources li")].pop()?.querySelector("input")?.focus();
  });
  addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

  const saved = store.get();
  if (saved) start(saved, null); else showConnect();
}

init();
