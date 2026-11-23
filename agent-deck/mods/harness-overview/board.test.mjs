// node --test board.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, shellArgs, plain, columns, matches, CONFIG_PATH, linkify, cutMarkdown, taskOptions, keepTask, NO_TASK, draftGroups, shortTitle, knownSessions, taskKey, sessionKey, notesFor, threadOf, threadMarkdown, memo, cardTitle, entryTitle, repairCut, dueRefresh, escapeStep, messageText, messageTask, ackKey, splitAcks, keepAcks } from "./board.js";

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

test("a Needs-you or Reviews card you already asked or answered about moves to In progress (asked)", () => {
  const data = { sections: [
    { column: "Urgent", items: [item("Urgent", "U1"), item("Urgent", "U2", { question: "waiting" })] },
    { column: "Decide", items: [item("Decide", "D1", { question: "answered" }), item("Decide", "D2"), item("Decide", "D3", { question: "ok-sent" }), item("Decide", "D4", { question: "accepted" })] },
    { column: "Ready to merge", items: [item("Ready to merge", "M1", { question: "answered" })] },
    { column: "On review", items: [item("On review", "R1", { question: "waiting" }), item("On review", "R2")] },
  ] };
  const c = columns(data);
  assert.deepEqual(c.needs.map((i) => i.id), ["U1", "D2"]);
  assert.deepEqual(c.reviews.map((i) => i.id), ["R2"]);
  assert.deepEqual(c.asked.map((i) => i.id), ["U2", "D1", "D3", "D4", "M1", "R1"], "Needs you first, then Reviews");
  assert.deepEqual(columns(data, (x) => x.id === "D1").asked.map((i) => i.id), ["D1"], "the filter applies");
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
  assert.deepEqual([c.needs, c.asked, c.reviews, c.fyi, c.tasks, c.blocked, c.answered, c.waiting], [[], [], [], [], [], [], [], []]);
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

test("taskOptions: every task once, sorted, counting its cards in Needs you + Reviews; then none, then all", () => {
  // D1 (a, b) and D2 (no task) are in Needs you; tasks, batches and blocked sessions count 0.
  assert.deepEqual(taskOptions(TD), { tasks: [["a", 1], ["b", 1], ["c", 0]], none: 1, all: 2 });
  const more = { ...TD, sections: [...TD.sections,
    { column: "On review", items: [item("On review", "R1", { tasks: ["c"] }), item("On review", "R2", { tasks: ["c"], question: "waiting" })] },
    { column: "FYI", items: [item("FYI", "F1", { tasks: ["a"] })] },
    { column: "Urgent", items: [item("Urgent", "U1", { tasks: ["b"], question: "answered" })] }] };
  // R1 counts; R2 and U1 (asked: In progress) and F1 (FYI) don't, but their tasks are listed.
  assert.deepEqual(taskOptions(more), { tasks: [["a", 1], ["b", 1], ["c", 1]], none: 1, all: 3 });
  assert.deepEqual(taskOptions({}), { tasks: [], none: 0, all: 0 });
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

// --- Ask on tasks and blocked sessions -------------------------------------------------------

test("Ask keys: task|<name> and session|<address>; a task's own key wins", () => {
  assert.equal(taskKey({ task: "infra" }), "task|infra");
  assert.equal(taskKey({ task: "infra", key: "custom-key" }), "custom-key");
  assert.equal(sessionKey({ address: "vm/t4", task: "a" }), "session|vm/t4");
});

test("notesFor: the drafts saved under one key", () => {
  const draft = [{ nid: "1", qkey: "task|infra" }, { nid: "2", qkey: "Decide|D1" }, { nid: "3", qkey: "task|infra" }];
  assert.deepEqual(notesFor(draft, "task|infra").map((n) => n.nid), ["1", "3"]);
  assert.deepEqual(notesFor(undefined, "x"), []);
});

test("matches: a blocked session is found by its tab title, its question and its harness state", () => {
  const b = { address: "vm/t2", task: "sec", title: "scanner update", question: "Proceed on Jenkins evidence?", harness: { state: "waiting-ci", next: "watcher polling" } };
  assert.equal(matches(["jenkins"], b), true);
  assert.equal(matches(["scanner"], b), true);
  assert.equal(matches(["waiting-ci"], b), true);
  assert.equal(matches(["polling"], b), true);
  assert.equal(matches(["nothing"], b), false);
});

// --- the whole thread of a question, for the reader ------------------------------------------------

const QB = [
  { sent: "2026-01-05 09:00 UTC", status: "accepted", entries: [{ name: "R1", where: "On review", quote: "Review login", questions: ["[2026-01-05 09:00] reachable?"], answers: [{ head: "Answer [09:30]", body: "No." }] }] },
  { sent: "2026-01-06 10:00 UTC", status: "answered", entries: [
    { name: "R1", where: "On review", quote: "follow-up to batch 2026-01-05 09:00 UTC", questions: ["[2026-01-06 10:00] and the API?"], answers: [{ head: "Answer [10:30]", body: "Same." }] },
    { name: "D2", where: "Decide", quote: "x", questions: ["q"], answers: [] }] },
];

test("threadOf: every entry about one name, oldest batch first, with its batch's time and status", () => {
  assert.deepEqual(threadOf(QB, "R1").map((e) => [e.sent, e.status, e.questions[0]]), [
    ["2026-01-05 09:00 UTC", "accepted", "[2026-01-05 09:00] reachable?"],
    ["2026-01-06 10:00 UTC", "answered", "[2026-01-06 10:00] and the API?"],
  ]);
  assert.deepEqual(threadOf(QB, "nope"), []);
  assert.deepEqual(threadOf(undefined, "R1"), []);
});

test("threadMarkdown: what it is about, then each batch's questions and answers in order", () => {
  const md = threadMarkdown("R1", threadOf(QB, "R1"), (x) => x);
  assert.equal(md, [
    "**Asked from On review**",
    "",
    "> Review login",
    "",
    "### Batch 2026-01-05 09:00 UTC · accepted",
    "",
    "**❓ [2026-01-05 09:00]** reachable?",
    "",
    "**Answer [09:30]**",
    "",
    "No.",
    "",
    "### Batch 2026-01-06 10:00 UTC · answered",
    "",
    "**❓ [2026-01-06 10:00]** and the API?",
    "",
    "**Answer [10:30]**",
    "",
    "Same.",
  ].join("\n"));
});

test("threadMarkdown: texts go through the formatter; a follow-up's own quote isn't repeated", () => {
  const md = threadMarkdown("R1", threadOf(QB, "R1"), (x) => x.toUpperCase());
  assert.match(md, /> REVIEW LOGIN/);
  assert.match(md, /SAME\./);
  assert.doesNotMatch(md, /follow-up to batch/i);
});

// --- render cost --------------------------------------------------------------------------------

test("memo: computes once per key, then returns the same result; forgets the oldest past its size", () => {
  let calls = 0;
  const f = memo((a, b) => { calls++; return `${a}+${b}`; }, 2);
  assert.equal(f("x", "1"), "x+1");
  assert.equal(f("x", "1"), "x+1");
  assert.equal(calls, 1);
  f("y", "1"); f("z", "1"); // x drops out (size 2)
  f("x", "1");
  assert.equal(calls, 4);
});

// --- titles and cut-off text -------------------------------------------------------------------

test("cardTitle: the id, else the first bold or link text, else the group, else the column", () => {
  assert.equal(cardTitle({ id: "D1", text: "**D1** x", column: "Decide" }), "D1");
  assert.equal(cardTitle({ id: null, text: "**[ER-3 report](https://c.ai/a)** · **from `vm/t19`**: x", column: "On review" }), "ER-3 report");
  assert.equal(cardTitle({ id: null, text: "**Needs a rebase** now", column: "Urgent" }), "Needs a rebase");
  assert.equal(cardTitle({ id: null, text: "see [app!1](https://x.io/1) soon", column: "FYI" }), "app!1");
  assert.equal(cardTitle({ id: null, group: "Merges", text: "plain words", column: "Decide" }), "Merges");
  assert.equal(cardTitle({ id: null, text: "plain words", column: "FYI" }), "FYI");
});

test("entryTitle: a URL name reads as the text the quote links it with, else as shortTitle", () => {
  const url = "https://c.ai/artifact/1osuAX";
  assert.equal(entryTitle({ name: url, quote: `[on review] **[ER-1 report](${url})** · from` }), "ER-1 report");
  assert.equal(entryTitle({ name: "https://git.example.com/g/app/-/merge_requests/5", quote: "x" }), "app!5");
  assert.equal(entryTitle({ name: "R3", quote: "x" }), "R3");
});

test("repairCut: a link cut off in the middle shows its text and …; whole links stay", () => {
  assert.equal(repairCut("triage of [imunify MRs](https://git.example.com/g…"), "triage of imunify MRs…");
  assert.equal(repairCut("see [half text"), "see half text");
  assert.equal(repairCut("ok [a](https://x.io) done"), "ok [a](https://x.io) done");
  assert.equal(repairCut("code `not closed"), "code not closed");
  assert.equal(repairCut(""), "");
});

// --- refresh ---------------------------------------------------------------------------

test("the timed refresh waits while you type an answer or read the reader", () => {
  const s = { config: { every: 120 }, loading: false, edit: null, reader: null, loadedAt: 0 };
  const now = 121_000;
  assert.equal(dueRefresh(s, now), true);
  assert.equal(dueRefresh({ ...s, loadedAt: 10_000 }, now), false, "not yet `every` seconds");
  assert.equal(dueRefresh({ ...s, config: null }, now), false, "no config");
  assert.equal(dueRefresh({ ...s, loading: true }, now), false, "already loading");
  assert.equal(dueRefresh({ ...s, edit: { key: "k" } }, now), false, "typing an answer");
  // A re-render under the reader sent its scroll back to the top.
  assert.equal(dueRefresh({ ...s, reader: { title: "t", md: "long" } }, now), false, "reading");
  assert.equal(dueRefresh({ ...s, message: { task: null } }, now), false, "writing to the manager");
});

// --- Esc -------------------------------------------------------------------------------

test("Esc closes the innermost thing first, the board last", () => {
  const none = { reader: null, taskMenu: false, showDrafts: false, draftEdit: null, edit: null, query: "" };
  assert.equal(escapeStep(none), "close");
  assert.equal(escapeStep({ ...none, query: "x" }), "query");
  assert.equal(escapeStep({ ...none, query: "x", edit: { key: "k" } }), "edit");
  assert.equal(escapeStep({ ...none, edit: { key: "k" }, showDrafts: true }), "drafts");
  assert.equal(escapeStep({ ...none, showDrafts: true, draftEdit: "n1" }), "draftEdit");
  assert.equal(escapeStep({ ...none, showDrafts: true, taskMenu: true }), "taskMenu");
  // The reader sits over everything, the Drafts dialog included.
  assert.equal(escapeStep({ ...none, reader: { md: "x" }, showDrafts: true, edit: { key: "k" }, query: "x" }), "reader");
  // The Message dialog sits over the board, under the reader.
  assert.equal(escapeStep({ ...none, message: { task: "x" }, taskMenu: true, edit: { key: "k" } }), "message");
  assert.equal(escapeStep({ ...none, message: { task: "x" }, reader: { md: "x" } }), "reader");
});

// --- the Message button -------------------------------------------------------------------

test("a message to the manager says which task it is for", () => {
  assert.equal(messageText("release", "  hold the tag \n"), "for release: hold the tag");
  assert.equal(messageText(null, "hello"), "hello", "no task: the text as written");
  assert.equal(messageText("release", "   "), "", "nothing to send");
});

test("the Message dialog starts on the task the board shows", () => {
  assert.equal(messageTask("release"), "release");
  assert.equal(messageTask(null), null, "All tasks");
  assert.equal(messageTask(NO_TASK), null, "No task");
});

// --- ACK -------------------------------------------------------------------------------------

const answeredBatch = (sent, answers) => ({ sent, status: "answered", entries: [{ name: "R1", answers: Array.from({ length: answers }, (_, i) => ({ head: `a${i}`, body: "x" })) }] });

test("an ACKed answer hides behind ACKs; a new answer brings it back", () => {
  const b1 = answeredBatch("s1", 1), b2 = answeredBatch("s2", 2);
  const acks = [ackKey(b1)];
  assert.deepEqual(splitAcks([b1, b2], acks), { open: [b2], acked: [b1] });
  const later = answeredBatch("s1", 2); // the manager answered again
  assert.deepEqual(splitAcks([later, b2], acks), { open: [later, b2], acked: [] });
  assert.deepEqual(splitAcks([b1], []), { open: [b1], acked: [] });
  assert.deepEqual(splitAcks([b1], null), { open: [b1], acked: [] }, "nothing stored yet");
});

test("stored ACKs keep only batches still on the board", () => {
  const b1 = answeredBatch("s1", 1);
  assert.deepEqual(keepAcks([ackKey(b1), "gone|1", ackKey(answeredBatch("s1", 3))], [b1]), [ackKey(b1)]);
  assert.deepEqual(keepAcks("nope", [b1]), [], "a stored value it can't read");
});
