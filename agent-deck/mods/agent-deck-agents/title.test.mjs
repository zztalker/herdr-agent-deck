// node --test title.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveTitle } from "./title.js";

const claude = { name: "Claude Code", key: "claude" };

test("the agent's own title, without Claude's status glyphs", () => {
  assert.equal(liveTitle("review release", claude), "review release");
  assert.equal(liveTitle("✳ review release", claude), "review release");
  assert.equal(liveTitle("⠂ Fix login", claude), "Fix login");
});

test("a path title doesn't count, even after the glyph strip would eat its ~ or /", () => {
  for (const t of ["~/src", "~", "/root/ai-workspace", "C:\\x"]) assert.equal(liveTitle(t, claude), null, t);
});

test("the program's own name, user@host and empty titles don't count", () => {
  for (const t of ["Claude Code", "claude", "root@vm: ~", "", "✳ ", undefined, null]) assert.equal(liveTitle(t, claude), null, String(t));
  assert.equal(liveTitle("anything", undefined), "anything");
});
