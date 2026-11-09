// node --test badge.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelBadge, COLOR_NAMES, PALETTES, homeColor, assignColors, badgeStyle } from "./badge.js";

// --- the letters ------------------------------------------------------------------------

test("first letter of task, then first letter of role, upper case", () => {
  assert.equal(labelBadge({ task: "herdr-deck", role: "lead" }).text, "HL");
});

test("a missing role leaves the second place empty; a missing task the first", () => {
  assert.equal(labelBadge({ task: "review-release" }).text, "R");
  assert.equal(labelBadge({ task: "x", role: "" }).text, "X");
  assert.equal(labelBadge({ role: "reviewer" }).text, "R");
});

test("no task or role: no badge (the icon shows)", () => {
  for (const l of [undefined, null, {}, { task: "", role: "" }, { where: "s / t", "herdr.tab": "tb1", other: "x" }]) {
    assert.equal(labelBadge(l), null, JSON.stringify(l));
  }
});

test("leading punctuation and spaces are skipped; digits count", () => {
  assert.equal(labelBadge({ task: "  #fix", role: "-qa" }).text, "FQ");
  assert.equal(labelBadge({ task: "42-x" }).text, "4");
  assert.equal(labelBadge({ task: "---" }), null);
});

test("the color goes by the task; a session with only a role goes by that role", () => {
  assert.equal(labelBadge({ task: "cloud-scan", role: "dev" }).key, "cloud-scan");
  assert.equal(labelBadge({ task: "cloud-scan", role: "lead" }).key, "cloud-scan");
  assert.equal(labelBadge({ role: "reviewer" }).key, "role:reviewer");
});

// --- the 10 colors ----------------------------------------------------------------------

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Herdr's sidebar background in each appearance, roughly: a badge must stand out from it.
const RAIL = { dark: "#15171b", light: "#f3f4f6" };

test("10 named colors, in both appearances", () => {
  assert.deepEqual(COLOR_NAMES, ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "grey"]);
  for (const app of ["dark", "light"]) assert.deepEqual(Object.keys(PALETTES[app]), COLOR_NAMES, app);
});

for (const app of ["dark", "light"]) {
  test(`${app}: distinct, letters at 4.5:1, each stands out from the rail`, () => {
    const cs = Object.values(PALETTES[app]);
    assert.equal(new Set(cs.map((c) => c.bg)).size, 10);
    for (const c of cs) {
      assert.ok(contrast(c.bg, c.fg) >= 4.5, `${app} ${c.fg} on ${c.bg}`);
      assert.ok(contrast(c.bg, RAIL[app]) >= 1.5, `${app} ${c.bg} on ${RAIL[app]}`);
    }
  });
}

test("badgeStyle follows the appearance; an unknown name falls back to grey", () => {
  assert.deepEqual(badgeStyle("red"), PALETTES.dark.red);
  assert.deepEqual(badgeStyle("red", true), PALETTES.dark.red);
  assert.deepEqual(badgeStyle("red", false), PALETTES.light.red);
  assert.deepEqual(badgeStyle("magenta", false), PALETTES.light.grey);
});

// --- who gets which color -----------------------------------------------------------------

test("a task's home color comes from its name: the same every time", () => {
  for (const t of ["cloud-scan", "herdr-deck", "x", "DEF-58801"]) {
    assert.ok(COLOR_NAMES.includes(homeColor(t)), t);
    assert.equal(homeColor(t), homeColor(t));
  }
});

test("tasks get their home colors when those are free", () => {
  const m = assignColors(["cloud-scan", "herdr-deck"]);
  assert.equal(m["cloud-scan"], homeColor("cloud-scan"));
  if (homeColor("herdr-deck") !== homeColor("cloud-scan")) assert.equal(m["herdr-deck"], homeColor("herdr-deck"));
});

test("two tasks on screen never share a color while there are 10 or fewer", () => {
  const tasks = Array.from({ length: 10 }, (_, i) => `task-${i}`);
  const m = assignColors(tasks);
  assert.equal(new Set(Object.values(m)).size, 10);
});

test("a task whose home color is taken by a task above it takes the next free one", () => {
  // Find two names with the same home color.
  const names = Array.from({ length: 200 }, (_, i) => `t${i}`);
  const a = names[0], b = names.find((n) => n !== a && homeColor(n) === homeColor(a));
  const m = assignColors([a, b]);
  assert.equal(m[a], homeColor(a));
  const next = COLOR_NAMES[(COLOR_NAMES.indexOf(homeColor(a)) + 1) % 10];
  assert.equal(m[b], next);
});

test("a chosen color wins, and automatic tasks avoid it", () => {
  const a = "herdr-deck";
  const m = assignColors(["review-release", a], { "review-release": homeColor(a) });
  assert.equal(m["review-release"], homeColor(a));
  assert.notEqual(m[a], homeColor(a));
});

test("chosen colors only count for tasks on the rail; unknown names are ignored", () => {
  const m = assignColors(["cloud-scan"], { gone: homeColor("cloud-scan"), "cloud-scan": "magenta" });
  assert.equal(m["cloud-scan"], homeColor("cloud-scan"));
  assert.deepEqual(Object.keys(m), ["cloud-scan"]);
});

test("a task keeps the color it had while it stays on the rail", () => {
  const a = "t0", b = Array.from({ length: 200 }, (_, i) => `t${i}`).find((n) => n !== a && homeColor(n) === homeColor(a));
  // b came first and got a's home color; a then took the next one.
  const first = assignColors([b, a]);
  // a moves above b: neither changes color.
  const again = assignColors([a, b], {}, first);
  assert.deepEqual(again, first);
});

test("a kept color gives way to a newly chosen one", () => {
  const kept = assignColors(["cloud-scan"]);
  const m = assignColors(["cloud-scan", "review-release"], { "review-release": kept["cloud-scan"] }, kept);
  assert.equal(m["review-release"], kept["cloud-scan"]);
  assert.notEqual(m["cloud-scan"], kept["cloud-scan"]);
});

test("more than 10 tasks: every one still gets a color, the extras share", () => {
  const tasks = Array.from({ length: 12 }, (_, i) => `task-${i}`);
  const m = assignColors(tasks);
  assert.equal(Object.keys(m).length, 12);
  for (const t of tasks) assert.ok(COLOR_NAMES.includes(m[t]));
  assert.equal(new Set(Object.values(m)).size, 10);
});

test("repeated tasks count once", () => {
  assert.deepEqual(Object.keys(assignColors(["a", "b", "a"])), ["a", "b"]);
});

// Herdr's script runtime has no TextEncoder (node does): the color rule must not need it.
test("works without TextEncoder, as in Herdr's script runtime", () => {
  const saved = globalThis.TextEncoder;
  try {
    delete globalThis.TextEncoder;
    assert.ok(COLOR_NAMES.includes(homeColor("cloud-scan")));
    assert.equal(Object.keys(assignColors(["a", "b"])).length, 2);
  } finally { globalThis.TextEncoder = saved; }
});
