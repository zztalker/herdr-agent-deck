// node --test labels.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { customLabels, taskOf, taskMatches, taskCounts, NO_TASK } from "./labels.js";

// --- customLabels (chips) ------------------------------------------------------------

test("keeps labels people and agents set, sorted by key", () => {
  assert.deepEqual(customLabels({ task: "DEF-1", role: "reviewer" }), [["role", "reviewer"], ["task", "DEF-1"]]);
});

test("drops Herdr's own labels: where and every herdr.*", () => {
  const app = { where: "space / tab", "herdr.space": "sp1", "herdr.tab": "tb1", "herdr.seen": "8", "herdr.pinned": "1", "herdr.right-click": "program" };
  assert.deepEqual(customLabels(app), []);
  assert.deepEqual(customLabels({ ...app, role: "lead" }), [["role", "lead"]]);
});

test("a key that only starts like herdr is still custom", () => {
  assert.deepEqual(customLabels({ herdrish: "x", "herdr-x": "y" }), [["herdr-x", "y"], ["herdrish", "x"]]);
});

test("empty values are not shown (an empty value means removed)", () => {
  assert.deepEqual(customLabels({ role: "", task: "x" }), [["task", "x"]]);
});

test("no labels at all", () => {
  assert.deepEqual(customLabels(undefined), []);
  assert.deepEqual(customLabels(null), []);
  assert.deepEqual(customLabels({}), []);
});

// --- task filter ------------------------------------------------------------------

const terms = [
  { labels: { task: "DEF-1", role: "lead" } },
  { labels: { task: "DEF-2" } },
  { labels: { task: "DEF-1", role: "reviewer" } },
  { labels: { task: "" } },
  { labels: undefined },
  {},
];

test("taskOf: the task label, or null when unset or empty", () => {
  assert.equal(taskOf({ task: "DEF-1" }), "DEF-1");
  assert.equal(taskOf({ task: "" }), null);
  assert.equal(taskOf(undefined), null);
});

test("taskMatches: null shows all, NO_TASK only untasked, a value only that task", () => {
  assert.equal(taskMatches({ task: "DEF-1" }, null), true);
  assert.equal(taskMatches(undefined, null), true);
  assert.equal(taskMatches({ task: "DEF-1" }, "DEF-1"), true);
  assert.equal(taskMatches({ task: "DEF-2" }, "DEF-1"), false);
  assert.equal(taskMatches(undefined, "DEF-1"), false);
  assert.equal(taskMatches({}, NO_TASK), true);
  assert.equal(taskMatches({ task: "DEF-1" }, NO_TASK), false);
});

test("taskCounts: each task with how many terminals carry it, most first then by name; untasked counted apart", () => {
  assert.deepEqual(taskCounts(terms), { tasks: [["DEF-1", 2], ["DEF-2", 1]], none: 3 });
  assert.deepEqual(taskCounts([]), { tasks: [], none: 0 });
});
