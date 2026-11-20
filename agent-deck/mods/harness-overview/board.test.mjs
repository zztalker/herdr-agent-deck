// node --test board.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, shellArgs, plain, columns, matches, CONFIG_PATH, linkify, cutMarkdown, taskOptions, keepTask, NO_TASK, draftGroups, shortTitle, knownSessions } from "./board.js";

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

// --- links in card text ------------------------------------------------------------------

const S = [{ address: "vm/t2", status: "blocked" }, { address: "box/t7", status: null }];

test("linkify: bare URLs become links named as people name them; markdown links and autolinks stay", () => {
  assert.equal(linkify("see https://x.io/a/1, then [brief](https://c.ai/b) or <https://y.io>", []),
    "see [x.io/…/1](https://x.io/a/1), then [brief](https://c.ai/b) or <https://y.io>");
  assert.equal(linkify("(https://x.io/a)", []), "([x.io/…/a](https://x.io/a))");
  assert.equal(linkify("job fixed https://git.example.com/g/app/-/jobs/4506831", []),
    "job fixed [app job 4506831](https://git.example.com/g/app/-/jobs/4506831)");
});

test("linkify: session addresses the card names become session: links, in code or not", () => {
  assert.equal(linkify("**`vm/t2`** asks; box/t7 is gone", S),
    "**[vm/t2](session:vm/t2)** asks; [box/t7](session:box/t7) is gone");
});

test("linkify: a bare tN only when exactly one listed session ends with it", () => {
  assert.equal(linkify("answer in t2", S), "answer in [t2](session:vm/t2)");
  assert.equal(linkify("answer in t2", [...S, { address: "other/t2" }]), "answer in t2");
  assert.equal(linkify("t22 and xt2 and t2b", S), "t22 and xt2 and t2b");
});

test("linkify: another name for a listed session's machine (host alias) links when its tN is unique", () => {
  assert.equal(linkify("`host-alias/t2` asks", S), "[host-alias/t2](session:vm/t2) asks");
  assert.equal(linkify("other/t9 too", S), "other/t9 too");
});

test("linkify: never inside a link's text or URL", () => {
  assert.equal(linkify("[vm/t2 log](https://x.io/vm/t2)", S), "[vm/t2 log](https://x.io/vm/t2)");
});

test("cutMarkdown: short text whole; long text cut on visible length, never inside a link or code", () => {
  assert.deepEqual(cutMarkdown("short", 10), { text: "short", cut: false });
  const long = "aaaa [the brief](https://very.long/url/that/does/not/count) bbbb `code here` cccc";
  assert.deepEqual(cutMarkdown(long, 8), { text: "aaaa [the brief](https://very.long/url/that/does/not/count)…", cut: true });
  assert.deepEqual(cutMarkdown(long, 22), { text: "aaaa [the brief](https://very.long/url/that/does/not/count) bbbb `code here`…", cut: true });
  assert.equal(cutMarkdown(long, 999).cut, false);
});

// --- task filter ---------------------------------------------------------------------------

const TD = {
  sections: [{ column: "Decide", items: [item("Decide", "D1", { tasks: ["b", "a"] }), item("Decide", "D2")] }],
  tasks: [{ task: "a", column: "Active", sessions: [] }, { task: "c", column: "Closed", sessions: [] }],
  batches: [{ sent: "s", status: "waiting", entries: [], tasks: ["a"] }],
  blocked: [{ address: "vm/t1", task: "b" }],
};

test("taskOptions: every task once, sorted, with how many cards carry it; then how many carry none", () => {
  assert.deepEqual(taskOptions(TD), { tasks: [["a", 3], ["b", 2], ["c", 1]], none: 1 });
  assert.deepEqual(taskOptions({}), { tasks: [], none: 0 });
});

test("keepTask: null keeps all, NO_TASK keeps cards without a task, a name keeps its cards", () => {
  const d1 = TD.sections[0].items[0], d2 = TD.sections[0].items[1];
  assert.equal(keepTask(null, d2), true);
  assert.equal(keepTask("a", d1), true);
  assert.equal(keepTask("c", d1), false);
  assert.equal(keepTask(NO_TASK, d2), true);
  assert.equal(keepTask(NO_TASK, d1), false);
  assert.equal(keepTask("a", TD.tasks[0]), true);      // a task card is its own task
  assert.equal(keepTask("a", TD.batches[0]), true);    // a batch by its tasks
  assert.equal(keepTask("b", TD.blocked[0]), true);    // a blocked session by its task
});

// --- the drafts dialog -----------------------------------------------------------------------

test("draftGroups: notes grouped by card in first-seen order, titled by id or name or key", () => {
  const draft = [
    { nid: "1", qkey: "Decide|D1", id: "D1", column: "Decide", group: "Perf", excerpt: "Cache: A or B", text: "B", at: "10:00" },
    { nid: "2", qkey: "followup|s1|R1", name: "R1", where: "On review", text: "and?", at: "10:01" },
    { nid: "3", qkey: "Decide|D1", id: "D1", column: "Decide", text: "soon", at: "10:02" },
    { nid: "4", qkey: "FYI|https://x.io/1", id: null, key: "https://x.io/1", column: "FYI", text: "ok", at: "10:03" },
  ];
  assert.deepEqual(draftGroups(draft).map((g) => [g.qkey, g.title, g.where, g.excerpt, g.notes.map((n) => n.nid)]), [
    ["Decide|D1", "D1", "Decide · Perf", "Cache: A or B", ["1", "3"]],
    ["followup|s1|R1", "R1", "On review", "", ["2"]],
    ["FYI|https://x.io/1", "https://x.io/1", "FYI", "", ["4"]],
  ]);
  assert.deepEqual(draftGroups(undefined), []);
});

// --- readable titles ---------------------------------------------------------------------------

test("shortTitle: MRs, PRs, issues, jobs, pipelines and Jira keys by their usual short names", () => {
  assert.equal(shortTitle("https://git.example.com/group/sub/app/-/merge_requests/183"), "app!183");
  assert.equal(shortTitle("https://git.example.com/group/app/-/merge_requests/183/diffs"), "app!183");
  assert.equal(shortTitle("https://github.com/someone/tool/pull/12"), "tool#12");
  assert.equal(shortTitle("https://github.com/someone/tool/issues/7"), "tool#7");
  assert.equal(shortTitle("https://git.example.com/group/app/-/issues/9"), "app#9");
  assert.equal(shortTitle("https://git.example.com/group/app/-/jobs/4506831"), "app job 4506831");
  assert.equal(shortTitle("https://git.example.com/group/app/-/pipelines/77"), "app pipeline 77");
  assert.equal(shortTitle("https://tracker.example.net/browse/ABC-123"), "ABC-123");
});

test("shortTitle: other links become host + last part; plain names stay", () => {
  assert.equal(shortTitle("https://claude.ai/artifact/2DjtR8aSpVN2uY8DLuZVvV"), "claude.ai/…/2DjtR8aSpVN2uY8DLuZVvV");
  assert.equal(shortTitle("https://example.com/"), "example.com");
  assert.equal(shortTitle("R3"), "R3");
  assert.equal(shortTitle(null), "");
});

test("knownSessions: every session the board names, once (cards, tasks, blocked, manager)", () => {
  const d = {
    sections: [{ items: [{ sessions: [{ address: "vm/t2", status: "blocked" }, { address: "vm/t3", status: null }] }] }],
    tasks: [{ sessions: [{ address: "vm/t2", status: "blocked" }] }],
    blocked: [{ address: "box/t9", task: "a" }],
    manager: { address: "box/t1", status: "idle" },
  };
  assert.deepEqual(knownSessions(d).map((s) => s.address), ["vm/t2", "vm/t3", "box/t9", "box/t1"]);
  assert.deepEqual(knownSessions({}), []);
});
