// node --test edit.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { customLabels, knownValues, remember, suggest, labelArgs } from "./edit.js";

// --- customLabels (the editor's starting rows) --------------------------------------

test("customLabels: the labels people and agents set, sorted, without Herdr's own or empty ones", () => {
  assert.deepEqual(customLabels({ task: "PROJ-1", role: "r", where: "s / t", "herdr.seen": "3", env: "" }), [["role", "r"], ["task", "PROJ-1"]]);
  assert.deepEqual(customLabels(undefined), []);
});

// --- knownValues / remember -------------------------------------------------------

const terms = [
  { labels: { task: "PROJ-1", role: "lead" } },
  { labels: { task: "PROJ-2" } },
  { labels: { task: "PROJ-1", role: "reviewer" } },
  { labels: { task: "" } },
  { labels: undefined },
  {},
];

test("known values: the cache first (most recent first), then live ones not in it, sorted, no repeats or blanks", () => {
  assert.deepEqual(knownValues(terms, "task", ["PROJ-9", "PROJ-2"]), ["PROJ-9", "PROJ-2", "PROJ-1"]);
  assert.deepEqual(knownValues(terms, "role", []), ["lead", "reviewer"]);
  assert.deepEqual(knownValues([], "role", undefined), []);
});

test("a broken cache (not an array, junk inside) is ignored, not thrown on", () => {
  assert.deepEqual(knownValues(terms, "role", "lead"), ["lead", "reviewer"]);
  assert.deepEqual(knownValues(terms, "role", [null, 3, "", "boss"]), ["boss", "lead", "reviewer"]);
});

test("remember moves a value to the front, keeps at most max, skips blanks", () => {
  assert.deepEqual(remember(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(remember(["a", "b"], "  z "), ["z", "a", "b"]);
  assert.deepEqual(remember(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
  assert.deepEqual(remember(["a"], ""), ["a"]);
  assert.deepEqual(remember(undefined, "a"), ["a"]);
  assert.deepEqual(remember("junk", "a"), ["a"]);
});

// --- suggest ----------------------------------------------------------------------

test("suggest: values containing what was typed, any case, prefix matches first, never the exact value", () => {
  const all = ["PROJ-100 login", "proj-2", "OTHER-proj", "other"];
  assert.deepEqual(suggest(all, "proj"), ["PROJ-100 login", "proj-2", "OTHER-proj"]);
  assert.deepEqual(suggest(all, "proj-2"), []);
  assert.deepEqual(suggest(all, "login"), ["PROJ-100 login"]);
});

test("suggest: nothing typed offers the first ones; limit applies", () => {
  assert.deepEqual(suggest(["a", "b", "c"], "", 2), ["a", "b"]);
  assert.deepEqual(suggest(["a", "b", "c"], "  "), ["a", "b", "c"]);
});

// --- labelArgs --------------------------------------------------------------------

test("labelArgs: sets new and changed labels, leaves unchanged ones alone", () => {
  const before = { role: "lead", task: "PROJ-1", where: "s / t" };
  assert.deepEqual(labelArgs(before, [["role", "lead"], ["task", "PROJ-2"]]), ["task=PROJ-2"]);
  assert.deepEqual(labelArgs({}, [["role", "lead"], ["task", ""]]), ["role=lead"]);
});

test("labelArgs: a cleared field or a removed row removes the label", () => {
  const before = { role: "lead", task: "PROJ-1", env: "prod" };
  assert.deepEqual(labelArgs(before, [["role", ""], ["task", "PROJ-1"]]), ["env=", "role="]);
});

test("labelArgs: Herdr's own labels are never touched, even if a row names them", () => {
  const before = { where: "s / t", "herdr.seen": "3", role: "a" };
  assert.deepEqual(labelArgs(before, [["role", "a"], ["where", "x"], ["herdr.pinned", "1"]]), []);
});

test("labelArgs: keys and values are trimmed; a row without a key is skipped; a renamed key moves the label", () => {
  assert.deepEqual(labelArgs({ env: "prod" }, [[" stage ", " prod "], ["", "orphan"]]), ["env=", "stage=prod"]);
});

test("labelArgs: a key typed twice keeps the last value", () => {
  assert.deepEqual(labelArgs({}, [["env", "a"], ["env", "b"]]), ["env=b"]);
});

test("labelArgs: keys with = or spaces inside are refused (hc would read them differently)", () => {
  assert.throws(() => labelArgs({}, [["a=b", "x"]]), /key/);
  assert.throws(() => labelArgs({}, [["my key", "x"]]), /key/);
});

test("labelArgs: a key starting with - is refused (hc would take `-x=1` for an option)", () => {
  assert.throws(() => labelArgs({}, [["-x", "1"]]), /key/);
  assert.throws(() => labelArgs({}, [["--json", "1"]]), /key/);
});

// --- a task's color (shared "agent-deck.task-colors") ---------------------------------------

import { withTaskColor } from "./edit.js";
import { COLOR_NAMES as LABEL_COLOR_NAMES, PALETTES as LABEL_PALETTES } from "./colors.js";
import { COLOR_NAMES as RAIL_COLOR_NAMES, PALETTES as RAIL_PALETTES } from "../agent-deck-agents/badge.js";

test("withTaskColor: sets, changes and (null) removes a task's color; the map isn't changed in place", () => {
  const map = { "cloud-scan": "teal" };
  assert.deepEqual(withTaskColor(map, "review-release", "red"), { "cloud-scan": "teal", "review-release": "red" });
  assert.deepEqual(withTaskColor(map, "cloud-scan", "blue"), { "cloud-scan": "blue" });
  assert.deepEqual(withTaskColor(map, "cloud-scan", null), {});
  assert.deepEqual(map, { "cloud-scan": "teal" });
});

test("withTaskColor: no task, an unknown color or a missing map", () => {
  assert.deepEqual(withTaskColor({ a: "red" }, "", "blue"), { a: "red" });
  assert.deepEqual(withTaskColor({ a: "red" }, "  ", "blue"), { a: "red" });
  assert.deepEqual(withTaskColor({ a: "red" }, "a", "magenta"), { a: "red" });
  assert.deepEqual(withTaskColor(undefined, "a", "red"), { a: "red" });
  assert.deepEqual(withTaskColor({ a: "red" }, " a ", "blue"), { a: "blue" });
});

test("the color row's palettes are the rail's (agent-deck-agents/badge.js)", () => {
  assert.deepEqual(LABEL_COLOR_NAMES, RAIL_COLOR_NAMES);
  assert.deepEqual(LABEL_PALETTES, RAIL_PALETTES);
});
