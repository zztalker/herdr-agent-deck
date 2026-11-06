// node --test usage.test.mjs  (from this folder)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { USAGE_SCRIPT, parseUsage, usageArgs } from "./usage.js";

test("parses the script's line", () => {
  assert.deepEqual(parseUsage("cpu=12 mem=47 disk=81\n"), { cpu: 12, mem: 47, disk: 81 });
});

test("takes the last usage line, ignoring login-shell noise around it", () => {
  assert.deepEqual(parseUsage("Welcome!\ncpu=1 mem=2 disk=3\n\n"), { cpu: 1, mem: 2, disk: 3 });
});

test("a field the machine could not measure is null, the rest still count", () => {
  assert.deepEqual(parseUsage("cpu= mem=40 disk=70"), { cpu: null, mem: 40, disk: 70 });
});

test("zero is a value, not a missing one", () => {
  assert.deepEqual(parseUsage("cpu=0 mem=0 disk=0"), { cpu: 0, mem: 0, disk: 0 });
});

test("out-of-range numbers are clamped to 0..100", () => {
  assert.deepEqual(parseUsage("cpu=-3 mem=140 disk=100"), { cpu: 0, mem: 100, disk: 100 });
});

test("no usage line at all is null", () => {
  assert.equal(parseUsage(""), null);
  assert.equal(parseUsage(undefined), null);
  assert.equal(parseUsage("sh: top: not found"), null);
  assert.equal(parseUsage("cpu= mem= disk="), null);
});

test("hc args: local runs without --on, a machine with it; always argv through sh, never a login shell", () => {
  const local = usageArgs(null);
  assert.deepEqual(local.slice(0, 1), ["exec"]);
  assert.ok(!local.includes("--on"));
  const remote = usageArgs("devbox");
  assert.deepEqual(remote.slice(0, 3), ["exec", "--on", "devbox"]);
  for (const a of [local, remote]) assert.deepEqual(a.slice(-4), ["--", "sh", "-c", USAGE_SCRIPT]);
});

// The real script on this computer: every field measured, each a percent.
test("the script measures this computer", () => {
  const u = parseUsage(execFileSync("sh", ["-c", USAGE_SCRIPT], { encoding: "utf8", timeout: 20000 }));
  assert.ok(u, "no usage line");
  for (const k of ["cpu", "mem", "disk"]) assert.ok(Number.isInteger(u[k]) && u[k] >= 0 && u[k] <= 100, `${k}=${u[k]}`);
});
