"""python3 -m unittest -v test_agent_deck_resume  (from this folder)"""

import json
import unittest

import agent_deck_resume as r

A = "11111111-1111-4111-8111-111111111111"


class Parse(unittest.TestCase):
    def test_machine_and_local(self):
        self.assertEqual(r.parse(f"herdr-resume://devbox/{A}"), ("devbox", A))
        self.assertEqual(r.parse(f"herdr-resume://local/{A}"), (None, A))
        self.assertEqual(r.parse(f"herdr-resume://LOCAL/{A.upper()}/?title=x"), (None, A))

    def test_refused(self):
        for bad in ["http://x/" + A, f"herdr-resume://devbox/not-an-id", f"herdr-resume://bad host/{A}",
                    f"herdr-resume:///{A}", f"herdr-resume://-x/{A}", f"herdr-resume://a/{A}/more"]:
            with self.subTest(bad=bad), self.assertRaises(r.LinkError):
                r.parse(bad)


class Plan(unittest.TestCase):
    spaces = [{"id": "s1", "machine": "devbox", "folder": "/root"},
              {"id": "s2", "machine": "devbox", "folder": "/root/x"},
              {"id": "s3", "machine": None, "folder": "/root/x"}]

    def test_same_folder_first_then_any_space_there(self):
        self.assertEqual(r.open_plan(self.spaces, "devbox", A, "/root/x"),
                         ("tab.new", {"space": "s2", "folder": "/root/x", "argv": ["claude", "--resume", A]}))
        self.assertEqual(r.open_plan(self.spaces, "devbox", A, "/elsewhere")[1]["space"], "s1")

    def test_no_space_there(self):
        self.assertEqual(r.open_plan(self.spaces, "other", A, "/x"),
                         ("space.new", {"machine": "other", "folder": "/x", "argv": ["claude", "--resume", A]}))
        self.assertEqual(r.open_plan([], None, A, "/x"), ("space.new", {"folder": "/x", "argv": ["claude", "--resume", A]}))


class Fake:
    """Answers the handler's commands from a table; records what ran."""

    def __init__(self, machines=("devbox",), folder="/root/x", nearest=None, sessions=(), terminals=(), pids=None, spaces=()):
        self.ran = []
        self.machines, self.folder, self.nearest = machines, folder, nearest
        self.sessions, self.terminals, self.pids, self.spaces = sessions, terminals, pids or {}, spaces

    def __call__(self, argv, timeout=60):
        self.ran.append(argv)
        tool, args = argv[0], argv[1:]
        if tool == "hc" and args[:2] == ["machine", "ls"]:
            return 0, json.dumps({"machines": [{"name": m} for m in self.machines]}), ""
        if tool == "hc" and args[0] == "exec":
            script = args[args.index("-c") + 1]
            if "projects" in script:
                return 0, (f'"cwd":{json.dumps(self.folder)}\n' if self.folder else ""), ""
            if "sessions" in script:
                return 0, "".join(json.dumps(s) + "\n" for s in self.sessions), ""
            if "dirname" in script:
                return 0, self.nearest or args[-1], ""
        if tool == "hc" and args[:2] == ["ls", "--json"]:
            return 0, json.dumps({"terminals": [{"address": a, "state": "live"} for a in self.terminals]}), ""
        if tool == "hc" and args[0] == "get":
            return 0, json.dumps({"foreground": {"pid": self.pids.get(args[1])}}), ""
        if tool == "app" and args == ["status"]:
            return 0, "{}", ""
        if tool == "app" and args == ["ls"]:
            return 0, json.dumps({"spaces": list(self.spaces)}), ""
        if tool == "app" and args[0] == "do":
            return 0, '{"ok": true}', ""
        if tool == "open":
            return 0, "", ""
        raise AssertionError(f"unexpected command: {argv}")

    def did(self):
        return [(a[2], json.loads(a[3])) for a in self.ran if a[:2] == ["app", "do"]]


TOOLS = {"hc": "hc", "app": "app"}


class Resume(unittest.TestCase):
    def test_running_session_is_shown(self):
        f = Fake(sessions=[{"pid": 42, "sessionId": A}, {"pid": 7, "sessionId": "other"}],
                 terminals=["devbox/t1", "devbox/t2", "t9"], pids={"devbox/t1": 5, "devbox/t2": 42, "t9": 42})
        msg = r.resume(f"herdr-resume://devbox/{A}", f, TOOLS)
        self.assertEqual(f.did(), [("agent.focus", {"terminal": "devbox/t2"})])
        self.assertIn("devbox/t2", msg)

    def test_a_leftover_session_file_without_a_terminal_does_not_count(self):
        f = Fake(sessions=[{"pid": 42, "sessionId": A}], terminals=["devbox/t1"], pids={"devbox/t1": 5},
                 spaces=[{"id": "s2", "machine": "devbox", "folder": "/root/x"}])
        r.resume(f"herdr-resume://devbox/{A}", f, TOOLS)
        self.assertEqual(f.did(), [("tab.new", {"space": "s2", "folder": "/root/x", "argv": ["claude", "--resume", A]})])

    def test_deleted_folder_opens_in_the_nearest_parent(self):
        f = Fake(folder="/root/x/gone", nearest="/root/x", spaces=[{"id": "s1", "machine": "devbox", "folder": "/root"}])
        msg = r.resume(f"herdr-resume://devbox/{A}", f, TOOLS)
        self.assertEqual(f.did(), [("tab.new", {"space": "s1", "folder": "/root/x", "argv": ["claude", "--resume", A]})])
        self.assertIn("no longer exists", msg)

    def test_local_never_asks_hc_exec_for_a_machine(self):
        f = Fake(machines=(), spaces=[])
        r.resume(f"herdr-resume://local/{A}", f, TOOLS)
        execs = [a for a in f.ran if a[:2] == ["hc", "exec"]]
        self.assertTrue(execs and all("--on" not in a for a in execs))
        self.assertEqual(f.did(), [("space.new", {"folder": "/root/x", "argv": ["claude", "--resume", A]})])

    def test_the_session_id_reaches_the_shell_as_an_argument(self):
        f = Fake(spaces=[])
        r.resume(f"herdr-resume://devbox/{A}", f, TOOLS)
        find = next(a for a in f.ran if a[:2] == ["hc", "exec"] and "projects" in a[a.index("-c") + 1])
        self.assertNotIn(A, find[find.index("-c") + 1])
        self.assertEqual(find[-1], A)

    def test_unknown_machine(self):
        with self.assertRaisesRegex(r.LinkError, "not connected"):
            r.resume(f"herdr-resume://nowhere/{A}", Fake(), TOOLS)

    def test_missing_session(self):
        with self.assertRaisesRegex(r.LinkError, "not found"):
            r.resume(f"herdr-resume://devbox/{A}", Fake(folder=None), TOOLS)


if __name__ == "__main__":
    unittest.main()
