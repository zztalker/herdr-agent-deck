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
  const text = [x.id, x.group, x.text, x.task, x.title, x.state, x.last, x.goal, x.sent, x.address, x.question,
    ...Object.values(x.harness ?? {}),
    ...(x.tasks ?? []), ...(x.sessions ?? []).map((s) => s.address),
    ...(x.entries ?? []).flatMap((e) => [e.name, e.quote, ...(e.questions ?? []), ...(e.answers ?? []).map((a) => a.body)])]
    .filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
}

// --- links in card text ------------------------------------------------------------------

const MD_LINK = /\[[^\]]*\]\([^)]*\)|<https?:\/\/[^>\s]+>/g;
const TOKEN = /(https?:\/\/[^\s<>()\[\]]+)|((?<![\w/.-])[\w.-]+\/t\d+[a-z]?(?![\w-]))|((?<![\w/.-])t\d+[a-z]?(?![\w-]))/g;

// Markdown for TextView: bare URLs become links named by shortTitle (app!183, app job N…); the session addresses the card lists become
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
      const link = url.slice(0, url.length - tail.length);
      return `[${shortTitle(link)}](${link})${tail}`;
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

// --- readable titles ---------------------------------------------------------------------------

// A link as people name it: app!183 (merge request), tool#12 (PR / issue), app job N, ABC-123
// (tracker key); else host/…/last part. Anything that isn't a URL stays as it is.
export function shortTitle(name) {
  const s = name ?? "";
  let u;
  try { u = new URL(s); } catch { return s; }
  if (!/^https?:$/.test(u.protocol)) return s;
  const parts = u.pathname.split("/").filter(Boolean);
  const at = (word) => parts.indexOf(word);
  const project = (i) => parts[(parts[i - 1] === "-" ? i - 2 : i - 1)] ?? u.host;
  for (const [word, mark] of [["merge_requests", "!"], ["pull", "#"], ["issues", "#"]]) {
    const i = at(word);
    if (i > 0 && /^\d+$/.test(parts[i + 1] ?? "")) return `${project(i)}${mark}${parts[i + 1]}`;
  }
  for (const word of ["jobs", "pipelines"]) {
    const i = at(word);
    if (i > 0 && /^\d+$/.test(parts[i + 1] ?? "")) return `${project(i)} ${word.slice(0, -1)} ${parts[i + 1]}`;
  }
  const key = u.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/);
  if (key) return key[1];
  return parts.length ? `${u.host}/…/${parts[parts.length - 1]}` : u.host;
}

// Every session the board names, once: so text outside cards (question quotes) can link them too.
export function knownSessions(data) {
  const seen = new Map();
  const add = (s) => { if (s?.address && !seen.has(s.address)) seen.set(s.address, s); };
  for (const s of data?.sections ?? []) for (const i of s.items ?? []) (i.sessions ?? []).forEach(add);
  for (const t of data?.tasks ?? []) (t.sessions ?? []).forEach(add);
  for (const b of data?.blocked ?? []) add({ address: b.address, status: "blocked" });
  add(data?.manager);
  return [...seen.values()];
}

// --- Ask on tasks and blocked sessions -------------------------------------------------------

// The KEY the Ask button passes for a task card (its own `key` if the script gives one) and for a
// blocked session; the script turns it into a question with that task's / session's context.
export const taskKey = (x) => x.key ?? `task|${x.task}`;
export const sessionKey = (b) => `session|${b.address}`;
export const notesFor = (draft, key) => (draft ?? []).filter((n) => n.qkey === key);

// --- the whole thread of a question, for the reader ------------------------------------------------

// Every entry about `name` across the batches, oldest batch first, each with its batch's sent / status.
export function threadOf(batches, name) {
  return (batches ?? []).flatMap((b) => b.entries.filter((e) => e.name === name).map((e) => ({ ...e, sent: b.sent, status: b.status })))
    .sort((a, b) => a.sent.localeCompare(b.sent));
}

// The thread as markdown: where it was asked from and what about (the first real quote), then per
// batch its questions and answers. `format` shapes each text (formatText in the page).
export function threadMarkdown(name, entries, format = (x) => x) {
  const out = [];
  const where = entries.find((e) => e.where)?.where;
  const quote = entries.map((e) => e.quote).find((q) => q && !/^follow-up to batch/i.test(q));
  if (where) out.push(`**Asked from ${where}**`, "");
  if (quote) out.push(format(quote).split("\n").map((l) => `> ${l}`).join("\n"), "");
  for (const e of entries) {
    out.push(`### Batch ${e.sent} · ${e.status}`, "");
    for (const q of e.questions ?? []) {
      const m = q.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
      out.push(m ? `**❓ [${m[1]}]** ${format(m[2])}` : `**❓** ${format(q)}`, "");
    }
    for (const a of e.answers ?? []) out.push(`**${a.head}**`, "", format(a.body), "");
  }
  while (out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

// --- render cost --------------------------------------------------------------------------------

// f with its results kept by its (string) arguments, the `size` newest. Render runs on every change
// (each key typed in the filter), so a card's text is linked and cut once, not on every frame.
export function memo(f, size = 2000) {
  const cache = new Map();
  return (...args) => {
    const key = args.join("\u0000");
    if (cache.has(key)) return cache.get(key);
    const v = f(...args);
    cache.set(key, v);
    if (cache.size > size) cache.delete(cache.keys().next().value);
    return v;
  };
}
