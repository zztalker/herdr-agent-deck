// harness-overview: the pure parts (config, shell arguments, text, columns). Tested in board.test.mjs.

// Relative to the app folder (appHome()). Kept out of layouts/ and mods/ so it is never pushed with them.
export const CONFIG_PATH = "data/harness-overview/config.json";
const EVERY = 120;

// {command, every, on} from the config file's text; null (no board) without a command.
export function parseConfig(text) {
  let c;
  try { c = JSON.parse(text ?? ""); } catch { return null; }
  const command = typeof c?.command === "string" ? c.command.trim() : "";
  if (!command) return null;
  const every = Number.isFinite(c.every) ? Math.max(30, c.every) : EVERY;
  return { command, every, on: typeof c.on === "string" && c.on ? c.on : null };
}

// `sh` arguments: the command as written (so `~` and PATH work), every argument as its own word.
export const shellArgs = (command, args) => ["-c", `${command} "$@"`, "hboard", ...args];

// Markdown to one plain line's worth of text: bold, italics and code marks go, a link keeps its text.
export function plain(md) {
  return (md ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, "$1$2")
    .trim();
}

const NEEDS = ["Urgent", "Decide"];
const REVIEWS = ["Ready to merge", "On review"];
const TASK_ORDER = { "Waiting on you": 0, Active: 1 };

// What each column of the view shows; keep(x) filters cards (items, tasks, batches).
export function columns(data, keep = () => true) {
  const sections = data?.sections ?? [];
  const items = (cols) => cols.flatMap((c) => sections.filter((s) => s.column === c).flatMap((s) => s.items)).filter(keep);
  const tasks = (data?.tasks ?? []).filter((t) => t.column in TASK_ORDER).filter(keep)
    .sort((a, b) => TASK_ORDER[a.column] - TASK_ORDER[b.column]);
  const batches = (data?.batches ?? []).filter(keep);
  return {
    needs: items(NEEDS),
    reviews: items(REVIEWS),
    fyi: items(["FYI"]),
    tasks,
    blocked: data?.blocked ?? [],
    answered: batches.filter((b) => b.status === "answered"),
    waiting: batches.filter((b) => b.status === "waiting" || b.status === "ok-sent"),
  };
}

// Every typed word appears somewhere in the card.
export function matches(words, x) {
  if (!words.length) return true;
  const text = [x.id, x.group, x.text, x.task, x.title, x.state, x.last, x.goal, x.sent,
    ...(x.tasks ?? []), ...(x.sessions ?? []).map((s) => s.address),
    ...(x.entries ?? []).flatMap((e) => [e.name, e.quote, ...(e.questions ?? []), ...(e.answers ?? []).map((a) => a.body)])]
    .filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}

// --- links in card text ------------------------------------------------------------------

const MD_LINK = /\[[^\]]*\]\([^)]*\)|<https?:\/\/[^>\s]+>/g;
const TOKEN = /(https?:\/\/[^\s<>()\[\]]+)|((?<![\w/.-])[\w.-]+\/t\d+[a-z]?(?![\w-]))|((?<![\w/.-])t\d+[a-z]?(?![\w-]))/g;

// Markdown for TextView: bare URLs become <autolinks>; the session addresses the card lists become
// `session:<address>` links (in code spans too), and a bare `tN` when exactly one of them ends in /tN.
export function linkify(md, sessions) {
  const full = new Set((sessions ?? []).map((s) => s.address));
  const short = new Map();
  for (const a of full) {
    const t = a.slice(a.lastIndexOf("/") + 1);
    short.set(t, short.has(t) ? null : a);
  }
  // An address the card doesn't list (the same machine under another name) goes by its tN.
  const target = (word) => (full.has(word) ? word : short.get(word.slice(word.lastIndexOf("/") + 1)) ?? null);
  const plainPart = (text) => text.replace(TOKEN, (m, url, addr, bare) => {
    if (url) {
      const tail = url.match(/[.,;:!?]+$/)?.[0] ?? "";
      return `<${url.slice(0, url.length - tail.length)}>${tail}`;
    }
    const to = target(addr ?? bare);
    return to ? `[${m}](session:${to})` : m;
  });
  const textPart = (text) => text.split(/(`[^`]*`)/).map((p, i) => {
    if (i % 2 === 0) return plainPart(p);
    const to = target(p.slice(1, -1));
    return to ? `[${p.slice(1, -1)}](session:${to})` : p;
  }).join("");
  let out = "", last = 0;
  for (const m of (md ?? "").matchAll(MD_LINK)) {
    out += textPart(md.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + textPart((md ?? "").slice(last));
}

// The first `n` visible characters of markdown, never cutting inside a link, an autolink or code;
// an odd `**` is closed. {text, cut}.
export function cutMarkdown(md, n) {
  const tok = /\[([^\]]*)\]\([^)]*\)|<(https?:\/\/[^>\s]+)>|`([^`]*)`|\*+|[\s\S]/g;
  let seen = 0;
  for (const m of md.matchAll(tok)) {
    seen += m[0].startsWith("*") ? 0 : (m[1] ?? m[2] ?? m[3] ?? m[0]).length;
    const end = m.index + m[0].length;
    if (seen >= n && end < md.length) {
      let text = md.slice(0, end).trimEnd();
      if ((text.match(/\*\*/g) ?? []).length % 2) text += "**";
      return { text: text + "…", cut: true };
    }
  }
  return { text: md, cut: false };
}

// --- task filter ---------------------------------------------------------------------------

export const NO_TASK = "\u0000none";
const tagsOf = (x) => x.tasks ?? (x.task ? [x.task] : []);

// {tasks: [[name, cards]], none}: every card (items, tasks, question batches, blocked sessions).
export function taskOptions(data) {
  const cards = [...(data?.sections ?? []).flatMap((s) => s.items), ...(data?.tasks ?? []), ...(data?.batches ?? []), ...(data?.blocked ?? [])];
  const n = new Map();
  let none = 0;
  for (const c of cards) {
    const tags = [...new Set(tagsOf(c))];
    if (!tags.length) none++;
    for (const t of tags) n.set(t, (n.get(t) ?? 0) + 1);
  }
  return { tasks: [...n].sort((a, b) => a[0].localeCompare(b[0])), none };
}

// null: every card; NO_TASK: cards with no task; else cards of that task.
export function keepTask(filter, x) {
  if (filter === null) return true;
  const tags = tagsOf(x);
  return filter === NO_TASK ? tags.length === 0 : tags.includes(filter);
}

// --- the drafts dialog -----------------------------------------------------------------------

// Draft notes grouped by the card they are about, in the order first seen.
export function draftGroups(draft) {
  const groups = new Map();
  for (const n of draft ?? []) {
    if (!groups.has(n.qkey)) {
      const col = n.column ?? n.where ?? "";
      groups.set(n.qkey, { qkey: n.qkey, title: n.id ?? n.name ?? n.key ?? n.qkey,
        where: n.group ? `${col} · ${n.group}` : col, excerpt: n.excerpt ?? "", notes: [] });
    }
    groups.get(n.qkey).notes.push(n);
  }
  return [...groups.values()];
}
