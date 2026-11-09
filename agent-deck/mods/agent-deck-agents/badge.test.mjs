// node --test badge.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelBadge, BADGE_COLORS } from "./badge.js";

test("first letter of task, then first letter of role, upper case", () => {
  assert.equal(labelBadge({ task: "herdr-deck", role: "lead" }).text, "HL");
});

test("a missing role leaves the second place empty", () => {
  assert.equal(labelBadge({ task: "review-release" }).text, "R");
  assert.equal(labelBadge({ task: "x", role: "" }).text, "X");
});

test("a missing task leaves the first place empty: the role letter alone", () => {
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

test("the color goes by the first letter: A is the first of 26, Z the last; same letter, same color", () => {
  assert.equal(BADGE_COLORS.length, 26);
  assert.equal(new Set(BADGE_COLORS).size, 26);
  assert.equal(labelBadge({ task: "alpha" }).color, BADGE_COLORS[0]);
  assert.equal(labelBadge({ task: "zulu" }).color, BADGE_COLORS[25]);
  assert.equal(labelBadge({ task: "Apple", role: "x" }).color, labelBadge({ task: "alpha" }).color);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 1; i < 26; i++) assert.notEqual(labelBadge({ task: letters[i] }).color, labelBadge({ task: letters[i - 1] }).color);
});

test("a digit or another script's letter still gets one of the 26", () => {
  for (const task of ["42-x", "ünder", "задача"]) assert.ok(BADGE_COLORS.includes(labelBadge({ task }).color), task);
});
