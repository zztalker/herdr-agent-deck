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
