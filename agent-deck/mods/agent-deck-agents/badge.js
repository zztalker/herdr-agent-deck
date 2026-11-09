// agent-deck: a session's rail cell from its labels (`hc label t7 task=… role=…`): the first
// letter of `task`, then the first letter of `role` (either place left empty when that label
// is missing). No task or role: null, and the program's icon shows.
// Its color is its task's: one of 10 colors that can't be confused, chosen by the person (the
// label editor saves `agent-deck.task-colors` in shared state) or else worked out from the
// task's name, so that two tasks on the rail never share one while there are 10 or fewer.
// No imports, so node can test it (badge.test.mjs).

export const COLOR_NAMES = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "grey"];

// One palette per appearance (`settings().dark`). Every color keeps its letters at 4.5:1 or
// better and stands out from that appearance's sidebar. agent-deck-labels/colors.js has a copy
// for its color row (a mod can't import another mod's files): change both; its test compares them.
const W = "#ffffff", D = "#1b1e24";
export const PALETTES = {
  dark: {
    red: { bg: "#bb0916", fg: W },
    orange: { bg: "#fa8a0b", fg: D },
    yellow: { bg: "#f7d710", fg: D },
    green: { bg: "#06791f", fg: W },
    teal: { bg: "#2dd8d3", fg: D },
    blue: { bg: "#085dc7", fg: W },
    purple: { bg: "#7f36bc", fg: W },
    pink: { bg: "#ff96d3", fg: D },
    brown: { bg: "#71462e", fg: W },
    grey: { bg: "#b2b8bf", fg: D },
  },
  light: {
    red: { bg: "#bb0916", fg: W },
    orange: { bg: "#f1840b", fg: D },
    yellow: { bg: "#e1c41a", fg: D },
    green: { bg: "#06791f", fg: W },
    teal: { bg: "#05cbc6", fg: D },
    blue: { bg: "#085dc7", fg: W },
    purple: { bg: "#7f36bc", fg: W },
    pink: { bg: "#fb80ca", fg: D },
    brown: { bg: "#71462e", fg: W },
    grey: { bg: "#9a9fa6", fg: D },
  },
};

export const badgeStyle = (name, dark = true) => {
  const p = dark ? PALETTES.dark : PALETTES.light;
  return p[name] ?? p.grey;
};

const first = (s) => (typeof s === "string" ? s.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "" : "");

// The letters, and the key its color goes by: the task, else (only a role) that role.
export function labelBadge(labels) {
  const text = first(labels?.task) + first(labels?.role);
  if (!text) return null;
  const key = first(labels?.task) ? labels.task : `role:${labels.role}`;
  return { text, key };
}

// FNV-1a over the name's UTF-16 code units: a task's home color, the same everywhere.
// (Herdr's script runtime has no TextEncoder.)
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
export const homeColor = (task) => COLOR_NAMES[hash(task) % COLOR_NAMES.length];

// Colors for the tasks on the rail, top to bottom (repeats count once): `chosen` (task ->
// color name, the person's picks) first; then each other task keeps the color it had in `kept`
// (the last assignment) if that's still free, else takes its home color, else the next free
// one after it. Past 10 tasks there's nothing free: the extras get their home colors.
export function assignColors(tasks, chosen = {}, kept = {}) {
  const order = [...new Set(tasks)];
  const out = {};
  const used = new Set();
  const take = (t, c) => { out[t] = c; used.add(c); };
  for (const t of order) if (COLOR_NAMES.includes(chosen?.[t])) take(t, chosen[t]);
  for (const t of order) {
    if (t in out) continue;
    if (COLOR_NAMES.includes(kept?.[t]) && !used.has(kept[t])) { take(t, kept[t]); continue; }
    const home = COLOR_NAMES.indexOf(homeColor(t));
    let c = COLOR_NAMES[home];
    for (let k = 0; k < COLOR_NAMES.length; k++) {
      const x = COLOR_NAMES[(home + k) % COLOR_NAMES.length];
      if (!used.has(x)) { c = x; break; }
    }
    take(t, c);
  }
  return Object.fromEntries(order.map((t) => [t, out[t]]));
}
