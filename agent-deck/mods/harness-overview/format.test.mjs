// node --test format.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatText } from "./format.js";

test("a paragraph whose lines are already broken is left as it is", () => {
  const md = "**Head:**\n- one\n- two";
  assert.equal(formatText(md), md);
  assert.equal(formatText(""), "");
  assert.equal(formatText(null), "");
});

test("each one-line paragraph of a longer text is shaped on its own", () => {
  const long = "Rebased on main, pipeline 813882 green, approval gate passed (13:09), mergeable, 0 threads. ".repeat(6).trim();
  const md = `**2026-01-24 14:23 UTC · review**\n\nMerged by you. Was: draft. Then more.\n\n---\n\n**2026-01-24 13:33 UTC · review**\n\n${long}\n\n**Head:**\n- one\n- two`;
  const out = formatText(md).split("\n\n");
  assert.equal(out[0], "**2026-01-24 14:23 UTC · review**");
  assert.deepEqual(out.slice(1, 3), ["Merged by you.", "Was: draft. Then more."]);  // rule 6 inside the paragraph
  assert.equal(out[3], "---");
  assert.equal(out[4], "**2026-01-24 13:33 UTC · review**");
  assert.ok(out.slice(5, -1).length >= 2, "the long paragraph is split at sentence ends");
  assert.equal(out.at(-1), "**Head:**\n- one\n- two");
});

test("a leading bold header up to its first ': ' gets its own line", () => {
  assert.equal(formatText("**[brief](https://x.io/b)** · **from `vm/t5`** (tab \"a: b\"): app, merge it."),
    "**[brief](https://x.io/b)** · **from `vm/t5`** (tab \"a: b\"):\n\napp, merge it.");
  assert.equal(formatText("**SX1 (yours since 2026-01-02 11:44)**: the lib isn't released."),
    "**SX1 (yours since 2026-01-02 11:44)**:\n\nthe lib isn't released.");
});

test("a dated update after ' — ' starts a paragraph", () => {
  assert.equal(formatText("Rebased, pipeline running — **2026-01-20 23:05:** thread resolved — **2026-01-21 00:30: ON HOLD.** wait"),
    "Rebased, pipeline running\n\n**2026-01-20 23:05:** thread resolved\n\n**2026-01-21 00:30: ON HOLD.** wait");
});

test("inline 1) 2) 3) steps become a numbered list; arrows between them go", () => {
  assert.equal(formatText("Merge in this order: 1) [app!1](https://x.io/1) (scope) → 2) lib!2 (require it) → 3) core!3 (cleanup)"),
    "Merge in this order:\n\n1. [app!1](https://x.io/1) (scope)\n2. lib!2 (require it)\n3. core!3 (cleanup)");
  assert.equal(formatText("only 1) here"), "only 1) here"); // one step is not a list
});

test("labels after a sentence start a paragraph: Word: and **Bold label:**", () => {
  assert.equal(formatText("Green and mergeable. Was: rebased to 84e. Report: results/r.md. **P1 dev order:** G6, G7."),
    "Green and mergeable.\n\nWas: rebased to 84e.\n\nReport: results/r.md.\n\n**P1 dev order:** G6, G7.");
});

test("dialog options at the end become a bullet list", () => {
  assert.equal(formatText("How should I handle the gate? (Proceed on evidence (Recommended) · Re-trigger once more)"),
    "How should I handle the gate?\n\n- Proceed on evidence (Recommended)\n- Re-trigger once more");
});

test("a leading time is made bold", () => {
  assert.equal(formatText("2026-01-21 00:28 t2 (triage): done."), "**2026-01-21 00:28** t2 (triage): done.");
});

test("long text is split into paragraphs at sentence ends, never inside links or code, not after e.g.", () => {
  const s = (n) => `Sentence ${n} has words, e.g. a [link. With dot](https://x.io/a.b) and \`code. here\` in it.`;
  const long = [1, 2, 3, 4, 5, 6, 7].map(s).join(" ");
  const out = formatText(long);
  const paras = out.split("\n\n");
  assert.ok(paras.length >= 2, out);
  assert.ok(paras.every((p) => p.length <= 400), out);
  assert.equal(paras.join(" "), long); // nothing lost or changed but the breaks
  for (const p of paras) assert.match(p, /^Sentence \d/);
});

test("short text without any pattern is unchanged", () => {
  assert.equal(formatText("All green. Merge when ready."), "All green. Merge when ready.");
});
