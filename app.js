(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // Accent-insensitive matching: "ruv" finds "RÚV", "visir" finds "Vísir".
  const fold = (s) => s.toLowerCase()
    .replace(/þ/g, "th").replace(/ð/g, "d").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

  const YES = new Set(["ja", "yes", "y", "✓"]);
  const NO = new Set(["nei", "no", "n", "✗"]);
  const kind = (v) => (YES.has(fold(v.trim())) ? "yes" : NO.has(fold(v.trim())) ? "no" : v.trim() ? "other" : "empty");

  let data;

  // ---------- Search ----------
  // Each word filters OS rows if it matches one; otherwise, if it matches an app, it
  // highlights that app's column. So "samsung hbo" → Tizen row, HBO Max column.
  function interpret(query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const rowWords = [], apps = new Set();
    let unmatched = false;
    for (const w of words) {
      if (data.rows.some((r) => r._key.includes(w))) rowWords.push(w);
      else {
        const hits = data.apps.map((a, i) => (a._key.includes(w) ? i : -1)).filter((i) => i >= 0);
        if (hits.length) hits.forEach((i) => apps.add(i));
        else unmatched = true;
      }
    }
    const rows = unmatched ? [] : data.rows.filter((r) => rowWords.every((w) => r._key.includes(w)));
    return { rows, apps, active: words.length > 0 };
  }

  // ---------- Render ----------
  function logo(app, size) {
    const box = el("span", "logo" + (size ? " " + size : ""));
    if (app.logo) {
      const img = el("img");
      img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      img.addEventListener("load", () => matchBackground(box, img), { once: true });
      img.src = app.logo;
      box.appendChild(img);
    } else {
      box.classList.add("placeholder");
      box.textContent = app.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2);
    }
    return box;
  }

  // A non-square logo is letterboxed inside the square slot. Fill the slot with the
  // image's corner colour so a wide logo on a dark background (e.g. Nova TV) doesn't
  // get white bars. Transparent corners keep the default white backing.
  const bgCache = new Map();
  function matchBackground(box, img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h || Math.abs(w / h - 1) < 0.05) return;
    let color = bgCache.get(img.src);
    if (color === undefined) {
      color = null;
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 1;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);   // top-left pixel
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        if (a > 200) color = `rgb(${r}, ${g}, ${b})`;
      } catch (_) { /* unreadable image: keep white */ }
      bgCache.set(img.src, color);
    }
    if (color) box.style.background = color;
  }

  function mark(value) {
    const k = kind(value);
    const m = el("span", "mark m-" + k);
    if (k === "yes") { m.append(el("span", "icon", "✓"), " ", value); m.title = "Virkar"; }
    else if (k === "no") { m.append(el("span", "icon", "✕"), " ", value); m.title = "Virkar ekki"; }
    else m.textContent = value || "–";
    return m;
  }

  function osLabel(row, tag) {
    const h = el(tag, "os");
    h.append(el("span", "os-name", row.name));
    if (row.detail) h.append(" ", el("span", "os-detail", row.detail));
    return h;
  }

  function score(row) {
    const yes = row.values.filter((v) => kind(v) === "yes").length;
    return el("span", "score", `${yes}/${row.values.length}`);
  }

  function renderTable(rows, hiApps) {
    const t = $("matrix");
    t.replaceChildren();
    const thead = el("thead"), htr = el("tr");
    const corner = el("th", "corner", data.cornerLabel);
    corner.scope = "col";
    htr.append(corner);
    data.apps.forEach((a, i) => {
      const th = el("th", "app" + (hiApps.has(i) ? " hi" : ""));
      th.scope = "col";
      th.append(logo(a), el("span", "app-name", a.name));
      htr.append(th);
    });
    thead.append(htr);

    const tbody = el("tbody");
    for (const r of rows) {
      const tr = el("tr");
      const th = el("th", "rowhead");
      th.scope = "row";
      th.append(osLabel(r, "div"), score(r));
      tr.append(th);
      r.values.forEach((v, i) => {
        const td = el("td", hiApps.has(i) ? "hi" : "");
        td.append(mark(v));
        tr.append(td);
      });
      tbody.append(tr);
    }
    t.append(thead, tbody);
  }

  function renderCards(rows, hiApps) {
    const wrap = $("cards");
    wrap.replaceChildren();
    for (const r of rows) {
      const card = el("article", "card");
      const head = el("header");
      head.append(osLabel(r, "h2"), score(r));
      const list = el("ul");
      // Highlighted apps first, so the answer is at the top of the card.
      const order = data.apps.map((_, i) => i).sort((a, b) => hiApps.has(b) - hiApps.has(a));
      for (const i of order) {
        const li = el("li", hiApps.has(i) ? "hi" : "");
        li.append(logo(data.apps[i], "sm"), el("span", "app-name", data.apps[i].name), mark(r.values[i]));
        list.append(li);
      }
      card.append(head, list);
      wrap.append(card);
    }
  }

  function renderAnswer(res) {
    const a = $("answer");
    a.replaceChildren();
    if (res.rows.length === 1 && res.apps.size === 1) {
      const i = [...res.apps][0], r = res.rows[0];
      a.append(el("strong", "", data.apps[i].name), " á ", el("strong", "", r.label), ": ", mark(r.values[i]));
      a.hidden = false;
    } else a.hidden = true;
  }

  function render() {
    const res = interpret($("q").value);
    renderTable(res.rows, res.apps);
    renderCards(res.rows, res.apps);
    renderAnswer(res);
    $("empty").hidden = res.rows.length > 0;
    $("table-wrap").hidden = $("cards").hidden = res.rows.length === 0;
    try {
      const u = new URL(location.href);
      $("q").value ? u.searchParams.set("q", $("q").value) : u.searchParams.delete("q");
      history.replaceState(null, "", u);
    } catch (_) {}
  }

  function renderSources(src) {
    if (!src || !src.items.length) return;
    $("sources-meta").textContent = `(${src.items.length})` + (src.updated ? ` · uppfært ${src.updated}` : "");
    const ol = $("sources-list");
    for (const item of src.items) {
      const li = el("li", item.dead ? "dead" : "");
      if (item.dead) li.title = "Hlekkur ekki lengur virkur";
      const text = item.label || item.url;
      // A dead source keeps its URL visible as text but isn't clickable.
      if (item.url && !item.dead && /^https?:\/\//i.test(item.url)) {
        const a = el("a", "", text);
        a.href = item.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        li.append(a);
      } else li.append(text);
      if (item.note) li.append(" " + item.note);
      ol.append(li);
    }
    $("sources").hidden = false;
  }

  async function init() {
    try {
      const res = await fetch("data/matrix.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (e) {
      $("status").textContent = "Ekki tókst að hlaða gögnum (" + e.message + ").";
      return;
    }
    for (const r of data.rows) { r.label = r.detail ? `${r.name} ${r.detail}` : r.name; r._key = fold(r.label); }
    for (const a of data.apps) a._key = fold(a.name);

    document.title = data.title;
    $("title").textContent = data.title;
    $("subtitle").textContent = data.subtitle;
    if (data.updated) $("updated").textContent = "Síðast uppfært " + data.updated;
    if (data.author) $("author").textContent = data.author;
    $("status").hidden = true;

    const q = new URLSearchParams(location.search).get("q");
    if (q) $("q").value = q;
    let t;
    $("q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 80); });
    render();
    renderSources(data.sources);

    // Print the sources expanded.
    const det = document.querySelector("#sources details");
    let was;
    addEventListener("beforeprint", () => { was = det.open; det.open = true; });
    addEventListener("afterprint", () => { det.open = was; });
  }

  init();
})();
