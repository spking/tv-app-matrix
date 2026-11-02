(() => {
  "use strict";

  const cfg = Object.assign(
    { title: "Matrix", subtitle: "", sheets: [], headerRows: 1, stickyColumns: 1, status: {} },
    window.MATRIX_CONFIG || {}
  );

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $("title"), subtitle: $("subtitle"), search: $("search"), count: $("count"),
    tabs: $("tabs"), status: $("status"), wrap: $("wrap"), table: $("matrix"), updated: $("updated"),
  };

  // value (lowercased) -> status class
  const statusLookup = new Map();
  for (const [cls, values] of Object.entries(cfg.status)) {
    for (const v of values) statusLookup.set(String(v).trim().toLowerCase(), cls);
  }

  const cache = new Map();          // file -> { rows, modified }
  let current = null;               // { header: [][], body: [][] }
  let sort = { col: -1, dir: 1 };

  // ---------- CSV (RFC 4180: quoted fields, escaped quotes, embedded newlines) ----------
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    const rows = [];
    let row = [], field = "", i = 0, inQuotes = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return trimGrid(rows);
  }

  // Sheets exports often carry trailing blank rows/columns; drop them and square the grid.
  function trimGrid(rows) {
    const isBlank = (r) => r.every((v) => v.trim() === "");
    while (rows.length && isBlank(rows[rows.length - 1])) rows.pop();
    let width = 0;
    for (const r of rows) {
      let w = r.length;
      while (w > 0 && r[w - 1].trim() === "") w--;
      width = Math.max(width, w);
    }
    return rows.map((r) => {
      const out = r.slice(0, width);
      while (out.length < width) out.push("");
      return out;
    });
  }

  // ---------- Rendering ----------
  const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;

  // Builds cell content with DOM nodes only (never innerHTML) so sheet content can't inject markup.
  function fillCell(cell, value, query) {
    const status = statusLookup.get(value.trim().toLowerCase());
    if (status) {
      const span = document.createElement("span");
      span.className = "badge s-" + status;
      appendHighlighted(span, value.trim(), query);
      cell.appendChild(span);
      return;
    }
    let last = 0;
    for (const m of value.matchAll(URL_RE)) {
      appendHighlighted(cell, value.slice(last, m.index), query);
      const a = document.createElement("a");
      a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer";
      appendHighlighted(a, m[0], query);
      cell.appendChild(a);
      last = m.index + m[0].length;
    }
    appendHighlighted(cell, value.slice(last), query);
  }

  function appendHighlighted(parent, text, query) {
    if (!text) return;
    if (!query) { parent.appendChild(document.createTextNode(text)); return; }
    const lower = text.toLowerCase();
    let pos = 0, idx;
    while ((idx = lower.indexOf(query, pos)) !== -1) {
      if (idx > pos) parent.appendChild(document.createTextNode(text.slice(pos, idx)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(idx, idx + query.length);
      parent.appendChild(mark);
      pos = idx + query.length;
    }
    if (pos < text.length) parent.appendChild(document.createTextNode(text.slice(pos)));
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function render() {
    const { header, body } = current;
    const query = els.search.value.trim().toLowerCase();
    const nSticky = Math.min(cfg.stickyColumns, (header[0] || body[0] || []).length);

    let rows = query ? body.filter((r) => r.some((v) => v.toLowerCase().includes(query))) : body.slice();
    if (sort.col >= 0) {
      rows.sort((a, b) => sort.dir * collator.compare(a[sort.col], b[sort.col]));
    }

    const table = els.table;
    table.replaceChildren();

    const thead = document.createElement("thead");
    header.forEach((hrow, hi) => {
      const tr = document.createElement("tr");
      hrow.forEach((v, ci) => {
        const th = document.createElement("th");
        th.scope = "col";
        fillCell(th, v, "");
        if (hi === header.length - 1) {
          th.title = "Click to sort";
          th.addEventListener("click", () => toggleSort(ci));
          if (sort.col === ci) th.setAttribute("aria-sort", sort.dir > 0 ? "ascending" : "descending");
        }
        markSticky(th, ci, nSticky);
        tr.appendChild(th);
      });
      thead.appendChild(tr);
    });
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement("tr");
      r.forEach((v, ci) => {
        const td = document.createElement(ci < nSticky ? "th" : "td");
        if (ci < nSticky) td.scope = "row";
        fillCell(td, v, query);
        markSticky(td, ci, nSticky);
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
    table.appendChild(tbody);

    els.count.textContent = query ? `${rows.length} of ${body.length} rows` : `${body.length} rows`;
    requestAnimationFrame(positionSticky);
  }

  function markSticky(cell, ci, nSticky) {
    if (ci >= nSticky) return;
    cell.classList.add("sticky");
    cell.dataset.col = ci;
    if (ci === nSticky - 1) cell.classList.add("sticky-last");
  }

  // Sticky columns need cumulative left offsets, and multi-row headers need top offsets.
  function positionSticky() {
    const table = els.table;
    const firstRow = table.tBodies[0]?.rows[0] || table.tHead?.rows[table.tHead.rows.length - 1];
    if (!firstRow) return;
    const lefts = [];
    let acc = 0;
    for (const cell of firstRow.cells) {
      if (!cell.classList.contains("sticky")) break;
      lefts.push(acc);
      acc += cell.getBoundingClientRect().width;
    }
    table.querySelectorAll(".sticky").forEach((c) => { c.style.left = lefts[+c.dataset.col] + "px"; });
    const h1 = table.tHead?.rows[0]?.getBoundingClientRect().height;
    if (h1) table.style.setProperty("--h1", h1 + "px");
  }

  function toggleSort(col) {
    if (sort.col !== col) sort = { col, dir: 1 };
    else if (sort.dir === 1) sort.dir = -1;
    else sort = { col: -1, dir: 1 };   // third click restores sheet order
    render();
  }

  // ---------- Loading ----------
  async function load(sheet) {
    if (!cache.has(sheet.file)) {
      // no-cache: revalidate with the server so a fresh deploy shows up immediately
      const res = await fetch(sheet.file, { cache: "no-cache" });
      if (!res.ok) throw new Error(`${sheet.file}: HTTP ${res.status}`);
      cache.set(sheet.file, { rows: parseCSV(await res.text()), modified: res.headers.get("Last-Modified") });
    }
    return cache.get(sheet.file);
  }

  async function show(index) {
    const sheet = cfg.sheets[index];
    if (!sheet) return;
    [...els.tabs.children].forEach((b, i) => b.setAttribute("aria-selected", String(i === index)));
    try {
      const { rows, modified } = await load(sheet);
      const h = Math.max(0, Math.min(cfg.headerRows, rows.length));
      current = { header: rows.slice(0, h), body: rows.slice(h) };
      sort = { col: -1, dir: 1 };
      els.status.hidden = true;
      els.wrap.hidden = false;
      render();
      els.updated.textContent = modified
        ? "Data updated " + new Date(modified).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
        : "";
      try { history.replaceState(null, "", "#" + encodeURIComponent(sheet.name)); } catch (_) {}
    } catch (err) {
      els.wrap.hidden = true;
      els.status.hidden = false;
      els.status.textContent = "Couldn't load the matrix (" + err.message + ").";
      console.error(err);
    }
  }

  function init() {
    document.title = cfg.title;
    els.title.textContent = cfg.title;
    if (cfg.subtitle) { els.subtitle.textContent = cfg.subtitle; els.subtitle.hidden = false; }

    if (cfg.sheets.length > 1) {
      cfg.sheets.forEach((s, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.role = "tab"; b.textContent = s.name;
        b.addEventListener("click", () => show(i));
        els.tabs.appendChild(b);
      });
      els.tabs.hidden = false;
    }

    let t;
    els.search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => current && render(), 120); });
    window.addEventListener("resize", () => current && positionSticky());

    const fromHash = decodeURIComponent(location.hash.slice(1));
    const start = Math.max(0, cfg.sheets.findIndex((s) => s.name === fromHash));
    if (!cfg.sheets.length) { els.status.textContent = "No sheets configured in config.js."; return; }
    show(start);
  }

  init();
})();
