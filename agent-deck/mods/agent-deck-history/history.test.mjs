// node --test history.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCAN, FULLTEXT, parseScan, parseHits, snippet, parseLink, search, recent, shortPath, sessionPids, openPlan, resumeLink } from "./history.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

// --- parseScan ----------------------------------------------------------------------

test("parseScan: rows (JSON string fields) and live ids; the machine is attached", () => {
  const out = [
    `row\t${A}\t"2026-11-06T10:00:00.000Z"\t"/root/ai-workspace"\t"Fix \\"login\\" bug"`,
    `live\t${B}`,
    `row\t${B}\t"2026-11-05T09:00:00.000Z"\t"/Users/alice/DEF/x"\t"Other"`,
    "",
  ].join("\n");
  const { rows, live } = parseScan(out, "devbox");
  assert.deepEqual(rows, [
    { id: A, at: Date.parse("2026-11-06T10:00:00.000Z"), cwd: "/root/ai-workspace", title: 'Fix "login" bug', machine: "devbox" },
    { id: B, at: Date.parse("2026-11-05T09:00:00.000Z"), cwd: "/Users/alice/DEF/x", title: "Other", machine: "devbox" },
  ]);
  assert.deepEqual([...live], [B]);
});

test("parseScan: broken lines, bad ids and missing fields are dropped, not thrown on", () => {
  const out = [
    `row\tnot-an-id\t"t"\t"/a"\t"T"`,
    `row\t${A}\t"t"\t"/a"`, // no title
    `row\t${A}\tbad json\t"/a"\t"T"`, // bad time: kept, time unknown
    `row\t${B}\t"t"\t"\u0000`,
    `live\tnope`,
    "garbage",
  ].join("\n");
  const { rows, live } = parseScan(out, null);
  assert.deepEqual(rows, [{ id: A, at: null, cwd: "/a", title: "T", machine: null }]);
  assert.equal(live.size, 0);
});

// --- parseLink ----------------------------------------------------------------------

test("parseLink: herdr-resume links, local, a bare id, any case; everything else is null", () => {
  assert.deepEqual(parseLink(`herdr-resume://devbox/${A}`), { machine: "devbox", id: A });
  assert.deepEqual(parseLink(` herdr-resume://local/${A.toUpperCase()}?title=x `), { machine: null, id: A });
  assert.deepEqual(parseLink(A), { machine: undefined, id: A });
  assert.equal(parseLink("herdr-resume://devbox/not-an-id"), null);
  assert.equal(parseLink("herdr-resume://bad host!/" + A), null);
  assert.equal(parseLink("fix login"), null);
  assert.equal(parseLink(""), null);
});

// --- search / recent ----------------------------------------------------------------

const rows = [
  { id: A, at: 3000, cwd: "/root/work/webapp", title: "Fix login bug", machine: "devbox" },
  { id: B, at: 5000, cwd: "/Users/alice/DEF/herdr", title: "Herdr labels", machine: null },
  { id: C, at: 1000, cwd: "/root", title: "Login page review", machine: "testbox" },
  { id: D, at: null, cwd: "/tmp", title: "No time", machine: null },
];

test("search: every word must appear in the title, folder or machine (any case); newest first", () => {
  assert.deepEqual(search(rows, "login").map((r) => r.id), [A, C]);
  assert.deepEqual(search(rows, "LOGIN webapp").map((r) => r.id), [A]);
  assert.deepEqual(search(rows, "testbox").map((r) => r.id), [C]);
  assert.deepEqual(search(rows, "local herdr").map((r) => r.id), [B]);
  assert.deepEqual(search(rows, "nothing like this"), []);
});

test("search: empty text matches nothing (Recent covers that); limit applies; unknown times sort last", () => {
  assert.deepEqual(search(rows, "  "), []);
  assert.deepEqual(search(rows, "o", 2).map((r) => r.id), [B, A]);
  assert.deepEqual(search(rows, "o").map((r) => r.id).at(-1), D);
});

test("search: a pasted link finds that session only (its machine, or any for a bare id)", () => {
  assert.deepEqual(search(rows, `herdr-resume://devbox/${A}`).map((r) => r.id), [A]);
  assert.deepEqual(search(rows, `herdr-resume://local/${A}`), []);
  assert.deepEqual(search(rows, C).map((r) => r.id), [C]);
});

test("recent: the newest n", () => {
  assert.deepEqual(recent(rows, 2).map((r) => r.id), [B, A]);
});

test("shortPath: home folders read as ~", () => {
  assert.equal(shortPath("/Users/alice/DEF/x"), "~/DEF/x");
  assert.equal(shortPath("/home/bob"), "~");
  assert.equal(shortPath("/root/ai-workspace"), "~/ai-workspace");
  assert.equal(shortPath("/rootless"), "/rootless");
});

// --- reopening ----------------------------------------------------------------------

test("sessionPids: pids of the session's ~/.claude/sessions files (one JSON per line); junk ignored", () => {
  const out = [JSON.stringify({ pid: 10, sessionId: A }), "", "not json", JSON.stringify({ pid: "11", sessionId: A }),
    JSON.stringify({ pid: 12, sessionId: B }), JSON.stringify({ pid: 13, sessionId: A })].join("\n");
  assert.deepEqual([...sessionPids(out, A)].sort(), [10, 13]);
  assert.equal(sessionPids("", A).size, 0);
});

test("openPlan: a new tab in a space on that machine, the one in the same folder first", () => {
  const spaces = [
    { id: "s1", machine: "devbox", folder: "/root" },
    { id: "s2", machine: "devbox", folder: "/root/x" },
    { id: "s3", machine: null, folder: "/root/x" },
  ];
  const row = { id: A, machine: "devbox", title: "Fix login", cwd: "/root/x" };
  assert.deepEqual(openPlan(spaces, row, "/root/x"),
    { command: "tab.new", args: { space: "s2", folder: "/root/x", argv: ["claude", "--resume", A], name: "Fix login" } });
  assert.deepEqual(openPlan(spaces, row, "/root/y").args.space, "s1");
});

test("openPlan: this computer matches spaces without a machine (null or missing)", () => {
  const row = { id: A, machine: null, title: "T", cwd: "/x" };
  assert.equal(openPlan([{ id: "s9", folder: "/x" }], row, "/x").args.space, "s9");
});

test("openPlan: no space on that machine: a new space there (no machine field for this computer)", () => {
  assert.deepEqual(openPlan([], { id: A, machine: "devbox", title: "T" }, "/root"),
    { command: "space.new", args: { machine: "devbox", folder: "/root", argv: ["claude", "--resume", A] } });
  assert.deepEqual(openPlan([{ id: "s1", machine: "other" }], { id: A, machine: null, title: "T" }, "/x"),
    { command: "space.new", args: { folder: "/x", argv: ["claude", "--resume", A] } });
});

test("resumeLink: machine or local, then the id", () => {
  assert.equal(resumeLink({ machine: "devbox", id: A }), `herdr-resume://devbox/${A}`);
  assert.equal(resumeLink({ machine: null, id: A }), `herdr-resume://local/${A}`);
});

// --- the scan script, for real, on a fake home ----------------------------------------

const line = (o) => JSON.stringify(o) + "\n";
function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), "adh-"));
  const proj = join(home, ".claude", "projects", "-root-x");
  mkdirSync(proj, { recursive: true });
  mkdirSync(join(home, ".claude", "sessions"), { recursive: true });
  writeFileSync(join(proj, `${A}.jsonl`),
    line({ type: "user", cwd: "/root/x", timestamp: "2026-11-01T10:00:00.000Z" }) +
    line({ type: "ai-title", aiTitle: "First title" }) +
    line({ type: "user", cwd: "/root/x/sub", timestamp: "2026-11-02T10:00:00.000Z" }) +
    line({ type: "custom-title", customTitle: 'Renamed "A"' }));
  writeFileSync(join(proj, `${B}.jsonl`), // headless SDK run: left out
    line({ type: "user", cwd: "/root/x", entrypoint: "sdk-py", timestamp: "2026-11-03T10:00:00.000Z" }) +
    line({ aiTitle: "Automated review" }));
  writeFileSync(join(proj, `${C}.jsonl`), // no title yet: left out
    line({ type: "user", cwd: "/root/x", timestamp: "2026-11-03T10:00:00.000Z" }));
  return { home, proj };
}
const scan = (home) => parseScan(execFileSync("sh", ["-c", SCAN], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8", timeout: 30000 }), null);

test("scan: titles (a /rename wins), first folder, last time; SDK runs and untitled ones left out", () => {
  const { home } = fakeHome();
  try {
    const { rows } = scan(home);
    assert.deepEqual(rows, [{ id: A, at: Date.parse("2026-11-02T10:00:00.000Z"), cwd: "/root/x", title: 'Renamed "A"', machine: null }]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("scan: an unchanged transcript comes from the index; a changed one is read again; a deleted one leaves it", () => {
  const { home, proj } = fakeHome();
  const idx = join(home, ".cache", "agent-deck-history", "index.tsv");
  try {
    scan(home);
    // Prove the second run reuses the row: tamper with the cached title only.
    writeFileSync(idx, readFileSync(idx, "utf8").replace('Renamed \\"A\\"', "From the index"));
    assert.equal(scan(home).rows[0].title, "From the index");
    // Change the transcript (size and time): read again.
    appendFileSync(join(proj, `${A}.jsonl`), line({ customTitle: "Changed" }));
    const later = new Date(Date.now() + 5000);
    utimesSync(join(proj, `${A}.jsonl`), later, later);
    assert.equal(scan(home).rows[0].title, "Changed");
    // Delete it: gone from the rows and the index.
    rmSync(join(proj, `${A}.jsonl`));
    assert.deepEqual(scan(home).rows, []);
    assert.ok(!readFileSync(idx, "utf8").includes(A));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("scan: a run cut short keeps the rows it read; the next run doesn't read them again", () => {
  const { home } = fakeHome();
  const idx = join(home, ".cache", "agent-deck-history", "index.tsv");
  const bin = join(home, "bin");
  mkdirSync(bin);
  // A grep that counts transcript reads and kills the scan (kill -9, no clean-up) on the
  // second one: A (first) has been read by then, B (second) not.
  const realGrep = execFileSync("sh", ["-c", "command -v grep"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "grep"), `#!/bin/sh
case "$*" in *customTitle*)
  n=$(cat "$HOME/reads" 2>/dev/null || echo 0); n=$((n + 1)); echo $n > "$HOME/reads"
  echo "$@" >> "$HOME/read-files"
  [ -n "$KILL_AT" ] && [ "$n" -ge "$KILL_AT" ] && kill -9 "$SCANPID";;
esac
exec ${realGrep} "$@"
`, { mode: 0o755 });
  const env = { HOME: home, PATH: `${bin}:${process.env.PATH}` };
  const run = (extra) => {
    try {
      return execFileSync("sh", ["-c", `SCANPID=$$; export SCANPID; ${SCAN}`], { env: { ...env, ...extra }, encoding: "utf8", timeout: 30000 });
    } catch { return null; }
  };
  try {
    assert.equal(run({ KILL_AT: "2" }), null, "the first run should have been killed");
    assert.ok(readFileSync(idx, "utf8").includes(A), "A's row should be in the index after the cut");
    rmSync(join(home, "read-files"), { force: true });
    rmSync(join(home, "reads"), { force: true });
    const { rows } = parseScan(run({}), null);
    assert.deepEqual(rows.map((r) => r.id), [A]);
    const read = readFileSync(join(home, "read-files"), "utf8");
    assert.ok(!read.includes(`${A}.jsonl`), "A should not be read again");
    assert.ok(read.includes(`${B}.jsonl`), "B should be read this time");
    // One row per transcript after a finished run.
    assert.equal(readFileSync(idx, "utf8").split("\n").filter((l) => l.includes(`${A}.jsonl`)).length, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("scan: a session is live only while its process runs", async () => {
  const { home } = fakeHome();
  const child = spawn("sleep", ["30"]);
  try {
    writeFileSync(join(home, ".claude", "sessions", `${child.pid}.json`), JSON.stringify({ pid: child.pid, sessionId: A }));
    writeFileSync(join(home, ".claude", "sessions", "999999.json"), JSON.stringify({ pid: 999999, sessionId: B }));
    assert.deepEqual([...scan(home).live], [A]);
  } finally {
    child.kill();
    rmSync(home, { recursive: true, force: true });
  }
});

// --- full-text search ---------------------------------------------------------------

test("parseHits: id -> raw matched text; junk dropped; the first hit of an id wins", () => {
  const hits = parseHits(`${A}\tabc "login" def\nnope\tx\n${A}\tsecond\n${B}\t\n`);
  assert.deepEqual([...hits], [[A, 'abc "login" def'], [B, ""]]);
});

test("snippet: JSON escapes read as text, cut around the match at whole words, the match kept apart (any case)", () => {
  const raw = String.raw`{"type":"user","message":{"content":"please fix the Login\nbug in \"auth.py\" now"}}`;
  // 20 characters each side, then back to a word start / end: "t\":\"please fix the " -> "fix the ".
  assert.deepEqual(snippet(raw, "login", 20), { before: "…fix the ", match: "Login", after: ' bug in "auth.py"…' });
});

test("snippet: near the start or the end, no ellipsis there; a match it can't find shows the start", () => {
  assert.deepEqual(snippet("login here", "login", 40), { before: "", match: "login", after: " here" });
  assert.deepEqual(snippet("abc", "zzz", 40), { before: "abc", match: "", after: "" });
  assert.deepEqual(snippet("", "x", 40), { before: "", match: "", after: "" });
});

test("snippet: a match inside an escape (\\\\n) still shows: the search ran on the raw line", () => {
  const raw = String.raw`a\\nb` ; // a literal backslash-n in the file
  assert.equal(snippet(raw, "\\n", 40).match, "\\n");
});

test("FULLTEXT: only indexed (titled, non-SDK) transcripts are searched; any case; the text is literal", () => {
  const { home, proj } = fakeHome();
  try {
    scan(home);
    appendFileSync(join(proj, `${A}.jsonl`), line({ type: "user", message: { content: "Please FIX the (login) bug.* now" } }));
    // B is an SDK run: never searched, even though it contains the text.
    appendFileSync(join(proj, `${B}.jsonl`), line({ message: "fix the (login) bug" }));
    const grep = (q) => parseHits(execFileSync("sh", ["-c", FULLTEXT, "sh", q], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8" }));
    const hits = grep("fix the (login)");
    assert.deepEqual([...hits.keys()], [A]);
    assert.ok(hits.get(A).includes("FIX the (login) bug"));
    assert.equal(grep("bug.*").size, 1, "a literal .* matches the literal text");
    assert.equal(grep("b.g").size, 0, "not a regex");
    assert.equal(grep("-e").size, 0, "a leading - is text, not an option");
    assert.equal(grep("nothing like this").size, 0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("FULLTEXT: only the conversation counts, not the injected instructions or the raw API request", () => {
  const { home, proj } = fakeHome();
  try {
    // Same text in A's instructions attachment and in a request blob (which repeats the
    // messages, nested "type":"user" included): no hit for A.
    appendFileSync(join(proj, `${A}.jsonl`), line({ type: "attachment", attachment: { type: "instructions", content: "# notes: widget:all" } }));
    appendFileSync(join(proj, `${A}.jsonl`), line({ type: "api-request-blob", body: { messages: [{ type: "user", content: "widget notes" }] } }));
    writeFileSync(join(proj, `${D}.jsonl`),
      line({ type: "user", cwd: "/root/y", timestamp: "2026-11-04T10:00:00.000Z", message: { role: "user", content: "tune the Widget cache" } }) +
      line({ type: "ai-title", aiTitle: "Widget tuning" }) +
      line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Done: widget cache 4242 tuned" }] } }));
    scan(home);
    const hits = parseHits(execFileSync("sh", ["-c", FULLTEXT, "sh", "widget"], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8" }));
    assert.deepEqual([...hits.keys()], [D]);
    assert.ok(hits.get(D).includes("tune the Widget cache"), "the first conversation line that matches");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("FULLTEXT: the snippet comes from the matched line, at most 400 characters of it", () => {
  const { home, proj } = fakeHome();
  try {
    scan(home);
    appendFileSync(join(proj, `${A}.jsonl`), line({ type: "user", message: "x".repeat(5000) + " needle " + "y".repeat(5000) }));
    const raw = parseHits(execFileSync("sh", ["-c", FULLTEXT, "sh", "needle"], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8" })).get(A);
    assert.ok(raw.length <= 400 && raw.includes("needle"), raw.length);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("scan: no transcripts at all is no rows, not an error", () => {
  const home = mkdtempSync(join(tmpdir(), "adh-"));
  try {
    assert.deepEqual(scan(home).rows, []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
