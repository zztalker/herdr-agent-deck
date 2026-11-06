// node --test edit.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { customLabels, knownValues, remember, suggest, labelArgs } from "./edit.js";

// --- customLabels (the editor's starting rows) --------------------------------------

test("customLabels: the labels people and agents set, sorted, without Herdr's own or empty ones", () => {
  assert.deepEqual(customLabels({ task: "DEF-1", role: "r", where: "s / t", "herdr.seen": "3", env: "" }), [["role", "r"], ["task", "DEF-1"]]);
  assert.deepEqual(customLabels(undefined), []);
});

// --- knownValues / remember -------------------------------------------------------

const terms = [
  { labels: { task: "DEF-1", role: "lead" } },
  { labels: { task: "DEF-2" } },
  { labels: { task: "DEF-1", role: "reviewer" } },
  { labels: { task: "" } },
  { labels: undefined },
  {},
];

test("known values: the cache first (most recent first), then live ones not in it, sorted, no repeats or blanks", () => {
  assert.deepEqual(knownValues(terms, "task", ["DEF-9", "DEF-2"]), ["DEF-9", "DEF-2", "DEF-1"]);
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
  const all = ["DEF-100 login", "def-2", "PRIME-def", "other"];
  assert.deepEqual(suggest(all, "def"), ["DEF-100 login", "def-2", "PRIME-def"]);
  assert.deepEqual(suggest(all, "def-2"), []);
  assert.deepEqual(suggest(all, "login"), ["DEF-100 login"]);
});

test("suggest: nothing typed offers the first ones; limit applies", () => {
  assert.deepEqual(suggest(["a", "b", "c"], "", 2), ["a", "b"]);
  assert.deepEqual(suggest(["a", "b", "c"], "  "), ["a", "b", "c"]);
});

// --- labelArgs --------------------------------------------------------------------

test("labelArgs: sets new and changed labels, leaves unchanged ones alone", () => {
  const before = { role: "lead", task: "DEF-1", where: "s / t" };
  assert.deepEqual(labelArgs(before, [["role", "lead"], ["task", "DEF-2"]]), ["task=DEF-2"]);
  assert.deepEqual(labelArgs({}, [["role", "lead"], ["task", ""]]), ["role=lead"]);
});

test("labelArgs: a cleared field or a removed row removes the label", () => {
  const before = { role: "lead", task: "DEF-1", env: "prod" };
  assert.deepEqual(labelArgs(before, [["role", ""], ["task", "DEF-1"]]), ["env=", "role="]);
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
