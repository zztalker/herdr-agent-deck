// harness-overview: "guess formatting" for the reader. Dense one-line texts (queue items, task log
// lines, a session's notes, dialog questions) get paragraphs and lists by fixed rules, so the same
// text always comes out the same. A text of several paragraphs (blank lines between them) is shaped
// one paragraph at a time; a paragraph that already has line breaks is left alone. No imports, so
// node can test it (format.test.mjs).
//
// Rules, in order:
//  1. a leading time "2026-01-21 00:28 …" is made bold;
//  2. a leading bold header, up to its first ": " outside quotes and brackets, gets its own line;
//     so does a leading label in capitals, "DECISION (OK to post): …", made bold;
//  3. " — **2026-…" (a dated update) starts a paragraph; so does a closing " · from …";
//  4. a long quote right after ": " ("Thread 1 …: "You're right, …"") becomes a blockquote, its
//     lead-in (from its sentence start) a line of its own;
//  then in each paragraph (not a blockquote):
//  5. options at the end, "(A (Recommended) · B)", become a bullet list;
//     inline steps "1) … → 2) …" or "1) …; 2) …" (from 1, in order) become a numbered list, which
//     ends with its last item's first sentence; an item's closing ";" goes;
//  6. a label after a sentence ("Was: …", "**P1 order:** …", "Options:") starts a paragraph;
//  7. what is still longer than LONG is split at sentence ends into paragraphs of about PARA.
// Links, autolinks and code spans are never split or changed.

const LONG = 400;
const PARA = 300;
const ABBREV = new Set(["e.g", "i.e", "etc", "vs", "cf", "no", "approx"]);
const QUOTE = 60; // characters a quote after ": " needs to be a blockquote

// Links, autolinks and code spans become \uE000n\uE001 while the rules run.
function protect(md) {
  const held = [];
  const text = md.replace(/\[[^\]\n]*\]\([^)\s]*\)|<https?:\/\/[^>\s]+>|`[^`\n]*`/g, (m) => `\uE000${held.push(m) - 1}\uE001`);
  return { text, restore: (s) => s.replace(/\uE000(\d+)\uE001/g, (_, i) => held[+i]) };
}

// The first ": " outside quotes and brackets in the first `limit` characters, or -1.
function headerEnd(s, limit = 300) {
  let depth = 0, quoted = false;
  for (let i = 0; i < Math.min(s.length - 1, limit); i++) {
    const c = s[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === "(") depth++;
    else if (!quoted && c === ")") depth = Math.max(0, depth - 1);
    else if (!quoted && depth === 0 && c === ":" && s[i + 1] === " ") return i;
  }
  return -1;
}

function options(p) {
  const m = p.match(/^([\s\S]*?\S)\s*\(((?:[^()]|\([^()]*\))*·(?:[^()]|\([^()]*\))*)\)\s*$/);
  if (!m) return p;
  const items = m[2].split(/\s+·\s+/).map((x) => x.trim()).filter(Boolean);
  return items.length < 2 ? p : `${m[1]}\n\n${items.map((x) => `- ${x}`).join("\n")}`;
}

function steps(p) {
  const marks = [...p.matchAll(/(?:\s*→)?(?:^|\s+)(\d)\)\s+/g)];
  const run = [];
  for (const m of marks) if (+m[1] === run.length + 1) run.push(m);
  if (run.length < 2) return p;
  const head = p.slice(0, run[0].index).trimEnd();
  const items = run.map((m, k) => p.slice(m.index + m[0].length, k + 1 < run.length ? run[k + 1].index : p.length).trim());
  // The list ends with its last item's first sentence; what follows is a paragraph again.
  const [last, ...after] = sentences(items[items.length - 1]);
  items[items.length - 1] = last;
  const tail = after.join(" ").trim();
  const list = items.map((x, k) => `${k + 1}. ${x.replace(/\s*;\s*$/, "").replace(/(?<!\.\.)\.$/, "")}`).join("\n");
  return `${head ? `${head}\n\n` : ""}${list}${tail ? `\n\n${steps(tail)}` : ""}`;
}

const LABEL = /(?<=[.!?])\s+(?=\*\*[^*\n]{2,40}:\*\*|[A-Z][A-Za-z-]*(?: [A-Za-z-]+){0,2}:(?:\s|$))/g;

// Rule 4: a long "…" right after ": " is a blockquote; its lead-in, from the sentence it starts in,
// is a line of its own. Text between quotes stays as it is.
function quotes(s) {
  const out = [];
  let last = 0;
  for (const m of s.matchAll(new RegExp(`:\\s+"([^"\\n]{${QUOTE},})"(?=[\\s.,;)]|$)`, "g"))) {
    const before = s.slice(last, m.index);
    let cut = 0;
    for (const b of before.matchAll(/[.!?]["')]?\s+(?=[A-Z\uE000*\[(`"])/g)) {
      const word = before.slice(0, b.index).split(/\s+/).pop().toLowerCase().replace(/^\W+/, "");
      if (!ABBREV.has(word)) cut = b.index + b[0].length;
    }
    if (before.slice(0, cut).trim()) out.push(before.slice(0, cut).trim());
    out.push(`${before.slice(cut).trim()}:`, `> ${m[1].trim()}`);
    last = m.index + m[0].length;
  }
  if (!out.length) return s;
  if (s.slice(last).trim()) out.push(s.slice(last).trim());
  return out.join("\n\n");
}

// Sentence ends: [.!?] then space then a capital, a held token, a bracket or bold; not after e.g.
function sentences(p) {
  const out = [];
  let start = 0;
  for (const m of p.matchAll(/[.!?]\s+(?=[A-Z\uE000*\[(`"])/g)) {
    const word = p.slice(start, m.index).split(/\s+/).pop().toLowerCase().replace(/^\W+/, "");
    if (ABBREV.has(word)) continue;
    out.push(p.slice(start, m.index + 1));
    start = m.index + m[0].length;
  }
  out.push(p.slice(start));
  return out;
}

function split(p, size) {
  if (size(p) <= LONG || /^(- |\d\. )/.test(p)) return [p];
  const paras = [];
  let cur = "";
  for (const s of sentences(p)) {
    if (cur && size(cur) + 1 + size(s) > PARA) { paras.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) paras.push(cur);
  return paras;
}

export function formatText(md) {
  const src = md ?? "";
  if (src.includes("\n")) return src.split(/\n{2,}/).map((p) => (p.includes("\n") ? p : formatParagraph(p))).join("\n\n");
  return formatParagraph(src);
}

function formatParagraph(src) {
  if (!src) return src;
  const { text, restore } = protect(src);
  const size = (s) => restore(s).length;
  const bold = text.startsWith("**"); // rule 2 is for texts that open with a bold header, not a bolded time
  let s = text.replace(/^(\d{4}-\d\d-\d\d \d\d:\d\d)\s+/, "**$1** ");
  if (bold) {
    const end = headerEnd(s);
    if (end > 0) s = `${s.slice(0, end + 1)}\n\n${s.slice(end + 2)}`;
  } else s = s.replace(/^([A-Z]{3,}(?: [A-Z]{2,})*(?: \([^()\n]{1,40}\))?):\s+/, "**$1:**\n\n");
  s = s.replace(/\s+—\s+(?=\*\*\d{4}-\d\d-\d\d)/g, "\n\n").replace(/\s+·\s+(from\s[^·\n]{1,80})$/, "\n\n· $1");
  s = s.split("\n\n").map(quotes).join("\n\n");
  const paras = s.split("\n\n").flatMap((p) => {
    if (p.startsWith("> ")) return [p];
    const shaped = steps(options(p));
    return shaped.split("\n\n").flatMap((q) => (/^(- |\d\. )/.test(q) ? [q] : q.split(LABEL).flatMap((r) => split(r, size))));
  });
  return restore(paras.join("\n\n"));
}
