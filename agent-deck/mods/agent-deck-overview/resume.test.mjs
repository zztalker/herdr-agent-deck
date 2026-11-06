// node --test resume.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_OF, sessionFrom, resumeLink, machineOf } from "./resume.js";

const A = "11111111-1111-4111-8111-111111111111";

test("sessionFrom: the id when the file is that pid's and its transcript exists", () => {
  assert.equal(sessionFrom(`${JSON.stringify({ pid: 42, sessionId: A })}\nfound\n`, 42), A);
});

test("sessionFrom: null without a transcript yet, for another pid, or for junk", () => {
  assert.equal(sessionFrom(`${JSON.stringify({ pid: 42, sessionId: A })}\n`, 42), null);
  assert.equal(sessionFrom(`${JSON.stringify({ pid: 7, sessionId: A })}\nfound\n`, 42), null);
  assert.equal(sessionFrom(`${JSON.stringify({ pid: 42, sessionId: "nope" })}\nfound\n`, 42), null);
  assert.equal(sessionFrom("", 42), null);
  assert.equal(sessionFrom("not json\nfound", 42), null);
});

test("resumeLink and machineOf", () => {
  assert.equal(resumeLink(null, A), `herdr-resume://local/${A}`);
  assert.equal(resumeLink("devbox", A), `herdr-resume://devbox/${A}`);
  assert.equal(machineOf("devbox/t3"), "devbox");
  assert.equal(machineOf("t3"), null);
});

test("SESSION_OF on a fake home: found only once the transcript exists", () => {
  const home = mkdtempSync(join(tmpdir(), "adr-"));
  try {
    mkdirSync(join(home, ".claude", "sessions"), { recursive: true });
    writeFileSync(join(home, ".claude", "sessions", "42.json"), JSON.stringify({ pid: 42, sessionId: A }));
    const run = () => execFileSync("sh", ["-c", SESSION_OF, "sh", "42"], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8" });
    assert.equal(sessionFrom(run(), 42), null);
    mkdirSync(join(home, ".claude", "projects", "-x"), { recursive: true });
    writeFileSync(join(home, ".claude", "projects", "-x", `${A}.jsonl`), "{}\n");
    assert.equal(sessionFrom(run(), 42), A);
    assert.equal(execFileSync("sh", ["-c", SESSION_OF, "sh", "99"], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8" }), "");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
