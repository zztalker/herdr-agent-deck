// node --test board.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, shellArgs, plain, columns, matches, CONFIG_PATH } from "./board.js";

// --- config ----------------------------------------------------------------------------

test("no file, bad JSON or no command: no board", () => {
  assert.equal(parseConfig(null), null);
  assert.equal(parseConfig(""), null);
  assert.equal(parseConfig("{nope"), null);
  assert.equal(parseConfig('{"every": 60}'), null);
  assert.equal(parseConfig('{"command": "  "}'), null);
});

test("command with defaults; every is clamped to at least 30 s", () => {
  assert.deepEqual(parseConfig('{"command": "python3 ~/h/hboard.py"}'), { command: "python3 ~/h/hboard.py", every: 120, on: null });
  assert.equal(parseConfig('{"command": "x", "every": 5}').every, 30);
  assert.equal(parseConfig('{"command": "x", "every": "soon"}').every, 120);
  assert.equal(parseConfig('{"command": "x", "on": "vm"}').on, "vm");
});

test("the config lives in the mod's data folder, not in layouts/ or mods/", () => {
  assert.equal(CONFIG_PATH, "data/harness-overview/config.json");
});

test("arguments reach the command as separate words, never re-parsed by the shell", () => {
  assert.deepEqual(shellArgs("python3 ~/h/hboard.py", ["answer", "On review|R3", "it's `ok`; $(rm -rf ~)"]),
    ["-c", 'python3 ~/h/hboard.py "$@"', "hboard", "answer", "On review|R3", "it's `ok`; $(rm -rf ~)"]);
});

// --- text ------------------------------------------------------------------------------

test("plain: markdown marks go, link text stays", () => {
  assert.equal(plain("**`vm/t2`** (security, [app!12](https://x/12)): it *asks* **this**"),
    "vm/t2 (security, app!12): it asks this");
  assert.equal(plain(null), "");
});

// --- columns ---------------------------------------------------------------------------

const item = (column, id, extra = {}) => ({ qkey: `${column}|${id}`, id, column, text: `**${id}** text`, tasks: [], sessions: [], links: [], draft: [], ...extra });
const DATA = {
  sections: [
    { column: "Urgent", items: [item("Urgent", "U1")] },
    { column: "Ready to merge", items: [item("Ready to merge", "M1")] },
    { column: "On review", items: [item("On review", "R1")] },
    { column: "Decide", items: [item("Decide", "D1"), item("Decide", "D2")] },
    { column: "FYI", items: [item("FYI", "F1")] },
    { column: "Resolved", items: [item("Resolved", "X1")] },
  ],
  tasks: [
    { task: "a", column: "Active", sessions: [] },
    { task: "b", column: "Waiting on you", sessions: [] },
    { task: "c", column: "Closed", sessions: [] },
  ],
  batches: [
    { sent: "s1", status: "accepted", entries: [] },
    { sent: "s2", status: "answered", entries: [] },
    { sent: "s3", status: "waiting", entries: [] },
    { sent: "s4", status: "ok-sent", entries: [] },
  ],
  blocked: [{ address: "vm/t2", task: "a" }],
  draft: [{ nid: "n1" }],
};

test("needs you: urgent first, then decisions; reviews: ready to merge, then on review", () => {
  const c = columns(DATA);
  assert.deepEqual(c.needs.map((i) => i.id), ["U1", "D1", "D2"]);
  assert.deepEqual(c.reviews.map((i) => i.id), ["M1", "R1"]);
  assert.deepEqual(c.fyi.map((i) => i.id), ["F1"]);
});

test("in progress: tasks waiting on you first, closed ones left out; blocked sessions kept", () => {
  const c = columns(DATA);
  assert.deepEqual(c.tasks.map((t) => t.task), ["b", "a"]);
  assert.deepEqual(c.blocked, [{ address: "vm/t2", task: "a" }]);
});

test("questions: answered ones (yours to OK) before the ones still waiting; accepted left out", () => {
  const c = columns(DATA);
  assert.deepEqual(c.answered.map((b) => b.sent), ["s2"]);
  assert.deepEqual(c.waiting.map((b) => b.sent), ["s3", "s4"]);
});

test("a filter keeps what matches and leaves the counts of the rest", () => {
  const c = columns(DATA, (x) => x.id === "D2" || x.task === "a");
  assert.deepEqual(c.needs.map((i) => i.id), ["D2"]);
  assert.deepEqual(c.tasks.map((t) => t.task), ["a"]);
});

test("missing parts read as empty", () => {
  const c = columns({});
  assert.deepEqual([c.needs, c.reviews, c.fyi, c.tasks, c.blocked, c.answered, c.waiting], [[], [], [], [], [], [], []]);
});

test("matches: every typed word appears in the card, its tasks or its sessions", () => {
  const i = item("Decide", "D1", { tasks: ["backend"], sessions: [{ address: "vm/t4" }], group: "Merges" });
  assert.equal(matches(["d1"], i), true);
  assert.equal(matches(["backend", "t4"], i), true);
  assert.equal(matches(["merges"], i), true);
  assert.equal(matches(["iaid"], i), false);
  assert.equal(matches([], i), true);
});
