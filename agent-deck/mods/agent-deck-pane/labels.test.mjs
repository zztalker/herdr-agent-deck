// node --test labels.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { headerLabels } from "./labels.js";

test("keeps labels people and agents set, as [name, value] sorted by name", () => {
  assert.deepEqual(headerLabels({ task: "PROJ-1", role: "reviewer" }), [["role", "reviewer"], ["task", "PROJ-1"]]);
});

test("drops Herdr's own labels: where and every herdr.*", () => {
  const app = { where: "space / tab", "herdr.space": "sp1", "herdr.tab": "tb1", "herdr.seen": "8" };
  assert.deepEqual(headerLabels(app), []);
  assert.deepEqual(headerLabels({ ...app, role: "lead" }), [["role", "lead"]]);
});

test("a key that only starts like herdr is still shown", () => {
  assert.deepEqual(headerLabels({ "herdr-x": "y" }), [["herdr-x", "y"]]);
});

test("empty values, no labels and a missing terminal show nothing", () => {
  assert.deepEqual(headerLabels({ role: "" }), []);
  assert.deepEqual(headerLabels({}), []);
  assert.deepEqual(headerLabels(undefined), []);
  assert.deepEqual(headerLabels(null), []);
});
