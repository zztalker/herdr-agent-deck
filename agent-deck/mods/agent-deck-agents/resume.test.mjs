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
  assert.equal(sessionFrom(`42\n${JSON.stringify({ pid: 42, sessionId: A })}\nfound\n`), A);
});

test("sessionFrom: null without a transcript yet, for another pid, or for junk", () => {
  assert.equal(sessionFrom(`42\n${JSON.stringify({ pid: 42, sessionId: A })}\n`), null);
  assert.equal(sessionFrom(`42\n${JSON.stringify({ pid: 7, sessionId: A })}\nfound\n`), null);
  assert.equal(sessionFrom(`42\n${JSON.stringify({ pid: 42, sessionId: "nope" })}\nfound\n`), null);
  assert.equal(sessionFrom(`x\n${JSON.stringify({ pid: 42, sessionId: A })}\nfound\n`), null);
  assert.equal(sessionFrom(""), null);
  assert.equal(sessionFrom("42\nnot json\nfound"), null);
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
    assert.equal(sessionFrom(run()), null);
    mkdirSync(join(home, ".claude", "projects", "-x"), { recursive: true });
    writeFileSync(join(home, ".claude", "projects", "-x", `${A}.jsonl`), "{}\n");
    assert.equal(sessionFrom(run()), A);
    assert.equal(execFileSync("sh", ["-c", SESSION_OF, "sh", "99"], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8" }), "");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// A local terminal's program is Herdr's shell wrapper (`fish -lic 'command claude; exec fish'`):
// claude is its child, and only the child has a session file.
test("SESSION_OF finds the session of a child of the given pid", async () => {
  const home = mkdtempSync(join(tmpdir(), "adr-"));
  const parent = spawn("sh", ["-c", "sleep 30; true"], { stdio: "ignore" });
  try {
    let kid = "";
    for (let i = 0; i < 50 && !kid; i++) {
      await new Promise((r) => setTimeout(r, 20));
      kid = execFileSync("sh", ["-c", `ps -A -o pid= -o ppid= | awk -v p=${parent.pid} '$2==p{print $1}'`], { encoding: "utf8" }).trim();
    }
    const child = Number(kid);
    assert.ok(Number.isInteger(child) && child > 0, "the parent has a child");
    mkdirSync(join(home, ".claude", "sessions"), { recursive: true });
    mkdirSync(join(home, ".claude", "projects", "-x"), { recursive: true });
    writeFileSync(join(home, ".claude", "sessions", `${child}.json`), JSON.stringify({ pid: child, sessionId: A }));
    writeFileSync(join(home, ".claude", "projects", "-x", `${A}.jsonl`), "{}\n");
    const out = execFileSync("sh", ["-c", SESSION_OF, "sh", String(parent.pid)], { env: { HOME: home, PATH: process.env.PATH }, encoding: "utf8" });
    assert.equal(sessionFrom(out), A);
  } finally {
    parent.kill();
    rmSync(home, { recursive: true, force: true });
  }
});
