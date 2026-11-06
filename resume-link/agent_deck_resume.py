#!/usr/bin/env python3
"""Open a herdr-resume:// link: show or reopen a Claude Code session in Herdr.

    herdr-resume://<machine>/<session-id>     <machine>: a name from `hc machine ls`,
    herdr-resume://local/<session-id>         or `local` for the Mac the link is clicked on

The session's folder comes from its own transcript on that machine, never from the link,
so a link can only reach a session that exists there. If the session runs in a Herdr
terminal now, that terminal comes to the front; otherwise it opens in a new tab (in a space
on that machine, the one in the same folder first) running `claude --resume <id>`, in the
nearest folder that still exists.

The link format is the one from Martin Krcho's Herdr setup, so links work with either
handler; this is agent-deck's own implementation. Standard library only.

    python3 -I agent_deck_resume.py 'herdr-resume://devbox/11111111-2222-4333-8444-555555555555'
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time
from urllib.parse import urlsplit

SESSION = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MACHINE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")

# Shell snippets for the session's machine; values come in as $1, never pasted in.
FIND = r"""for f in "$HOME"/.claude/projects/*/"$1".jsonl; do [ -f "$f" ] && grep -m1 -oE '"cwd":"([^"\\]|\\.)*"' "$f" && break; done; exit 0"""
SESSIONS = r"""for f in "$HOME"/.claude/sessions/*.json; do [ -f "$f" ] && { cat "$f"; echo; }; done; exit 0"""
NEAREST = r"""d="$1"; while [ ! -d "$d" ]; do d=$(dirname "$d"); done; printf %s "$d" """


class LinkError(Exception):
    """A problem to show the person as a notification."""


def parse(link):
    """(machine or None for this Mac, session id) from a herdr-resume:// link."""
    parts = urlsplit(link.strip())
    path = parts.path.strip("/")
    if parts.scheme != "herdr-resume" or "/" in path:
        raise LinkError(f"Not a herdr-resume:// link: {link}")
    machine, session = parts.netloc, path.lower()
    if not MACHINE.match(machine):
        raise LinkError(f"Bad machine name in the link: {machine!r}")
    if not SESSION.match(session):
        raise LinkError(f"Bad session id in the link: {session!r}")
    return (None if machine.lower() == "local" else machine), session


def open_plan(spaces, machine, session, folder):
    """The Herdr command that reopens it: a tab in a space on that machine, else a new space."""
    argv = ["claude", "--resume", session]
    here = [s for s in spaces if s.get("machine") == machine]
    space = next((s for s in here if s.get("folder") == folder), here[0] if here else None)
    if space:
        return "tab.new", {"space": space["id"], "folder": folder, "argv": argv}
    return "space.new", {**({"machine": machine} if machine else {}), "folder": folder, "argv": argv}


def _json(text):
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return None


def resume(link, run, tools):
    """Show or reopen the linked session; returns what was done. `run(argv, timeout)` gives
    (code, stdout, stderr); `tools` names the hc and herdr-app programs."""
    hc, app = tools["hc"], tools["app"]
    machine, session = parse(link)
    where = machine or "this Mac"

    def sh(script, *args, timeout=60):
        on = ["--on", machine] if machine else []
        return run([hc, "exec", *on, "--timeout", str(timeout), "--", "sh", "-c", script, "sh", *args], timeout + 10)

    if machine:
        names = {m.get("name") for m in (_json(run([hc, "machine", "ls", "--json"], 20)[1]) or {}).get("machines", [])}
        if machine not in names:
            raise LinkError(f"{machine} is not connected to Herdr on this Mac.")

    code, out, _ = sh(FIND, session)
    first = out.strip().splitlines()[0] if code == 0 and out.strip() else ""
    folder = _json(first[len('"cwd":'):]) if first.startswith('"cwd":') else None
    if not isinstance(folder, str) or not folder:
        raise LinkError(f"Session {session[:8]}… was not found on {where}.")

    # Herdr up and in front.
    if run([app, "status"], 15)[0] != 0:
        run(["open", "-a", "Herdr"], 15)
        for _ in range(40):
            time.sleep(0.5)
            if run([app, "status"], 15)[0] == 0:
                break
        else:
            raise LinkError("Herdr did not start.")
    else:
        run(["open", "-a", "Herdr"], 15)

    # Running now? Claude Code keeps ~/.claude/sessions/<pid>.json while a session runs; a
    # crash can leave one behind, so a pid only counts when a terminal runs it now.
    pids = set()
    for line in sh(SESSIONS, timeout=20)[1].splitlines():
        d = _json(line)
        if isinstance(d, dict) and d.get("sessionId") == session and isinstance(d.get("pid"), int):
            pids.add(d["pid"])
    if pids:
        for t in (_json(run([hc, "ls", "--json"], 20)[1]) or {}).get("terminals", []):
            a = t.get("address", "")
            there = a.startswith(f"{machine}/") if machine else "/" not in a
            if t.get("state") != "live" or not there:
                continue
            pid = ((_json(run([hc, "get", a, "--json"], 20)[1]) or {}).get("foreground") or {}).get("pid")
            if pid in pids:
                for command in ("agent.focus", "pane.focus"):
                    if run([app, "do", command, json.dumps({"terminal": a})], 20)[0] == 0:
                        return f"Showed {session} on {where}: running in {a}"
                break

    code, out, _ = sh(NEAREST, folder, timeout=20)
    opened = out if code == 0 and out else folder
    command, args = open_plan((_json(run([app, "ls"], 20)[1]) or {}).get("spaces", []), machine, session, opened)
    code, out, err = run([app, "do", command, json.dumps(args)], 30)
    if code != 0:
        raise LinkError(f"Herdr could not open the session: {(err or out).strip()}")
    gone = "" if opened == folder else f" ({folder} no longer exists)"
    return f"Opened {session} on {where} in {opened}{gone}"


def _tool(*names):
    for name in names:
        found = shutil.which(name) or (os.path.expanduser(f"~/.local/bin/{name}") if os.access(os.path.expanduser(f"~/.local/bin/{name}"), os.X_OK) else None)
        if found:
            return found
    raise LinkError(f"{names[0]} not found: install Herdr first.")


def _run(argv, timeout=60):
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def _notify(message):
    script = f"display notification {json.dumps(message)} with title \"Herdr resume link\""
    subprocess.run(["osascript", "-e", script], capture_output=True, check=False)


def main(argv):
    if len(argv) != 2 or argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if len(argv) == 2 else 2
    try:
        tools = {"hc": _tool("hc", "herdr-core"), "app": _tool("herdr-app")}
        print(resume(argv[1], _run, tools))
        return 0
    except (LinkError, subprocess.TimeoutExpired, OSError) as e:
        print(f"agent-deck resume: {e}", file=sys.stderr)
        _notify(str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
