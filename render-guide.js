// Turns the Leiðavísir text into page content. Shared by the public page and the
// editor's preview, so both always look the same.
//
//   blank line          → new paragraph
//   line starting "- "  → bullet point (consecutive lines form one list)
//   http(s)://…         → link
//
// Built with DOM nodes only (never innerHTML), so nothing typed here can inject markup.

const URL_RE = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g;

function inline(parent, text) {
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const a = document.createElement("a");
    a.href = m[0]; a.textContent = m[0];
    a.target = "_blank"; a.rel = "noopener noreferrer";
    parent.append(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

export function renderGuide(target, text) {
  target.replaceChildren();
  const blocks = (text || "").replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let list = null, para = null;
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      const bullet = line.match(/^[-*•]\s+(.*)$/);
      if (bullet) {
        para = null;
        if (!list) { list = document.createElement("ul"); target.append(list); }
        const li = document.createElement("li");
        inline(li, bullet[1]);
        list.append(li);
      } else if (line) {
        list = null;
        if (para) para.append(document.createElement("br"));
        else { para = document.createElement("p"); target.append(para); }
        inline(para, line);
      }
    }
  }
  return target.childNodes.length > 0;
}
