#!/usr/bin/env python3
"""An example data script for the harness-overview page: a made-up board, stdlib only.

Copy it and replace `board()` with your own data (a tracker, files, an API); keep the commands.
Every command prints one JSON object and exits 1 when its "ok" is false. The format is in
../README.md. Drafts, sent questions and OKs are kept in $BOARD_STATE
(default ~/.cache/harness-overview-example.json), so the page's buttons work for real here.

  board.py json                  the board
  board.py draft add KEY TEXT    save a draft note on a card (KEY: the card's qkey or an answer's key)
  board.py draft edit NID TEXT  change a draft note
  board.py draft del NID         delete a draft note
  board.py answer KEY [TEXT]     send that card's drafts (+ TEXT) now
  board.py send                  send every draft as one batch
  board.py ok SENT               accept the answer to batch SENT
"""
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

STATE = Path(os.environ.get("BOARD_STATE", Path.home() / ".cache" / "harness-overview-example.json"))


def now():
    return datetime.now(timezone.utc)


def stamp(t):
    return t.strftime("%Y-%m-%d %H:%M UTC")


def load():
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {"draft": [], "batches": [{
            "sent": "2026-01-05 09:00 UTC", "status": "answered",
            "entries": [{"name": "R1", "where": "On review", "quote": "Review the login page change",
                         "questions": ["Is the old page still reachable?"],
                         "answers": [{"head": "Answer [2026-01-05 09:30]", "body": "No: it redirects to the new one."}]}]}]}


def save(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=1))


def card(column, cid, text, **extra):
    return {"qkey": f"{column}|{cid}", "id": cid, "key": cid, "column": column, "group": extra.pop("group", None),
            "text": text, "stamp": None, "since": None, "age": extra.pop("age", None), "due": extra.pop("due", None),
            "rec": extra.pop("rec", None), "tasks": extra.pop("tasks", []), "sessions": extra.pop("sessions", []),
            "links": extra.pop("links", []), "question": None, "draft": []}


def board():
    """The made-up data. Replace this with your own."""
    return {
        "sections": [
            {"column": "Urgent", "title": "Urgent", "notes": [], "items": [
                card("Urgent", "U1", "**Deploy is waiting** for your approval in `t3`.", age="5m", tasks=["release"],
                     sessions=[{"address": "t3", "status": "blocked"}])]},
            {"column": "Ready to merge", "title": "Ready to merge", "notes": [], "items": [
                card("Ready to merge", "M1", "Pipeline green, reviews done.", tasks=["login"],
                     links=["https://example.com/merge_requests/12"])]},
            {"column": "On review", "title": "On review", "notes": [], "items": [
                card("On review", "R1", "Review the login page change.", tasks=["login"], age="1d")]},
            {"column": "Decide", "title": "Decisions needed", "notes": [], "items": [
                card("Decide", "D1", "**D1** Cache: A) keep 1h, B) 10 min. ★ B", rec="B", tasks=["perf"], group="Performance"),
                card("Decide", "D2", "**D2** Drop the beta flag now or next week?", due=(now() + timedelta(days=2)).date().isoformat())]},
            {"column": "FYI", "title": "Done while you were away", "notes": [], "items": [
                card("FYI", "F1", "Nightly tests are green again.")]},
        ],
        "tasks": [
            {"task": "release", "n": 1, "title": "Ship 2.4", "goal": "", "state": "waiting on you (deploy approval)",
             "column": "Waiting on you", "target": "", "sessions": [{"address": "t3", "status": "blocked"}],
             "last": "build 2.4.0 passed"},
            {"task": "login", "n": 2, "title": "New login page", "goal": "", "state": "active", "column": "Active",
             "target": "", "sessions": [{"address": "t5", "status": "working"}], "last": "review asked"},
        ],
        "blocked": [{"address": "t3", "task": "release"}],
    }


def items(b):
    return {i["qkey"]: i for s in b["sections"] for i in s["items"]}


def out(res):
    print(json.dumps(res))
    return 0 if res.get("ok") else 1


def find_answer(state, key):
    _, sent, name = (key.split("|", 2) + ["", ""])[:3]
    return next((e for bt in state["batches"] if bt["sent"] == sent for e in bt["entries"] if e["name"] == name), None)


def add(state, b, key, text):
    if not text.strip():
        return "empty text"
    if key.startswith("followup|"):
        e = find_answer(state, key)
        if not e:
            return "unknown answer " + key
        name, where = e["name"], e["where"]
    else:
        i = items(b).get(key)
        if not i:
            return "unknown card " + key
        name, where = i["id"], i["column"]
    state["draft"].append({"nid": uuid.uuid4().hex[:12], "qkey": key, "name": name, "where": where,
                           "text": text.strip(), "at": stamp(now())})
    return None


def send(state, notes):
    if not notes:
        return {"ok": False, "error": "nothing to send"}
    entries = {}
    for n in notes:
        e = entries.setdefault(n["qkey"], {"name": n["name"], "where": n["where"], "quote": "", "questions": [], "answers": []})
        e["questions"].append(n["text"])
    state["batches"].append({"sent": stamp(now()), "status": "waiting", "entries": list(entries.values())})
    state["draft"] = [n for n in state["draft"] if n not in notes]
    return {"ok": True, "sent": len(notes), "pinged": True}


def main(argv):
    state, b = load(), board()
    cmd, rest = (argv[0], argv[1:]) if argv else ("", [])
    if cmd == "json":
        asked = {e["name"]: bt["status"] for bt in state["batches"] for e in bt["entries"]}
        for i in items(b).values():
            i["draft"] = [n for n in state["draft"] if n["qkey"] == i["qkey"]]
            i["question"] = asked.get(i["id"])
        batches = [{**bt, "tasks": [], "entries": [
            {**e, "key": f"followup|{bt['sent']}|{e['name']}",
             "draft": [n for n in state["draft"] if n["qkey"] == f"followup|{bt['sent']}|{e['name']}"]}
            for e in bt["entries"]]} for bt in state["batches"]]
        return out({"ok": True, "error": None, "at": now().isoformat(timespec="seconds"), "source": "example board",
                    "target": "", "manager": {"address": "t1", "status": "idle"},
                    "commit": {"age": "1h", "subject": "example", "dirty": 0},
                    **b, "batches": batches, "draft": state["draft"]})
    if cmd == "draft" and rest[:1] == ["add"] and len(rest) == 3:
        err = add(state, b, rest[1], rest[2])
        if err:
            return out({"ok": False, "error": err})
        save(state)
        return out({"ok": True, "count": len(state["draft"])})
    if cmd == "draft" and rest[:1] == ["edit"] and len(rest) == 3:
        note = next((n for n in state["draft"] if n["nid"] == rest[1]), None)
        if not note or not rest[2].strip():
            return out({"ok": False, "error": "unknown draft or empty text"})
        note["text"] = rest[2].strip()
        save(state)
        return out({"ok": True, "count": len(state["draft"])})
    if cmd == "draft" and rest[:1] == ["del"] and len(rest) == 2:
        state["draft"] = [n for n in state["draft"] if n["nid"] != rest[1]]
        save(state)
        return out({"ok": True, "count": len(state["draft"])})
    if cmd == "answer" and len(rest) in (1, 2):
        if len(rest) == 2:
            err = add(state, b, rest[0], rest[1])
            if err:
                return out({"ok": False, "error": err})
        res = send(state, [n for n in state["draft"] if n["qkey"] == rest[0]])
        save(state)
        return out(res)
    if cmd == "send" and not rest:
        res = send(state, list(state["draft"]))
        save(state)
        return out(res)
    if cmd == "ok" and len(rest) == 1:
        bt = next((x for x in state["batches"] if x["sent"] == rest[0] and x["status"] == "answered"), None)
        if not bt:
            return out({"ok": False, "error": "no answered batch " + rest[0]})
        bt["status"] = "ok-sent"
        save(state)
        return out({"ok": True})
    return out({"ok": False, "error": "unknown command; see the top of board.py"})


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
