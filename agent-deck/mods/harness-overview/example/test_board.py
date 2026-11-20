"""Tests for the example board script. Run: python3 -m unittest test_board.py (from this folder)."""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).parent


class ExampleBoard(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.env = dict(os.environ, BOARD_STATE=str(pathlib.Path(self.dir.name) / "state.json"))

    def tearDown(self):
        self.dir.cleanup()

    def run_board(self, *args):
        p = subprocess.run([sys.executable, str(HERE / "board.py"), *args], capture_output=True, text=True, env=self.env)
        return p.returncode, json.loads(p.stdout)

    def item(self, d, qkey):
        return next(i for s in d["sections"] for i in s["items"] if i["qkey"] == qkey)

    def test_json_has_every_part_the_page_reads(self):
        rc, d = self.run_board("json")
        self.assertEqual((rc, d["ok"]), (0, True))
        for k in ("at", "source", "manager", "commit", "sections", "tasks", "batches", "draft", "blocked"):
            self.assertIn(k, d)
        cols = {s["column"] for s in d["sections"]}
        self.assertTrue({"Urgent", "Decide", "On review", "FYI"} <= cols)
        for i in (i for s in d["sections"] for i in s["items"]):
            for k in ("qkey", "column", "text", "tasks", "sessions", "links", "draft", "question"):
                self.assertIn(k, i)
        for b in d["blocked"]:  # why each session is blocked
            for k in ("address", "task", "title", "kind", "question", "since", "harness", "cards"):
                self.assertIn(k, b)
        for t in d["tasks"]:
            for k in ("task", "column", "state", "sessions"):
                self.assertIn(k, t)

    def test_draft_add_shows_on_its_card_and_del_removes_it(self):
        rc, res = self.run_board("draft", "add", "Decide|D1", "go with B")
        self.assertEqual((rc, res["ok"]), (0, True))
        _, d = self.run_board("json")
        notes = self.item(d, "Decide|D1")["draft"]
        self.assertEqual([n["text"] for n in notes], ["go with B"])
        self.run_board("draft", "del", notes[0]["nid"])
        _, d = self.run_board("json")
        self.assertEqual(self.item(d, "Decide|D1")["draft"], [])

    def test_draft_edit_changes_the_text(self):
        self.run_board("draft", "add", "Decide|D1", "go with B")
        _, d = self.run_board("json")
        nid = d["draft"][0]["nid"]
        rc, res = self.run_board("draft", "edit", nid, "go with A")
        self.assertEqual((rc, res["ok"]), (0, True))
        _, d = self.run_board("json")
        self.assertEqual([n["text"] for n in d["draft"]], ["go with A"])
        rc, res = self.run_board("draft", "edit", "nope", "x")
        self.assertEqual((rc, res["ok"]), (1, False))

    def test_answer_sends_that_card_only(self):
        self.run_board("draft", "add", "Decide|D2", "later")
        rc, res = self.run_board("answer", "Decide|D1", "go with B")
        self.assertEqual((rc, res["ok"], res["sent"]), (0, True, 1))
        _, d = self.run_board("json")
        self.assertEqual(self.item(d, "Decide|D1")["question"], "waiting")
        self.assertEqual([n["text"] for n in d["draft"]], ["later"])
        self.assertEqual(d["batches"][-1]["entries"][0]["questions"], ["go with B"])

    def test_send_and_ok(self):
        self.run_board("draft", "add", "Decide|D1", "a")
        self.run_board("draft", "add", "Decide|D2", "b")
        rc, res = self.run_board("send")
        self.assertEqual((rc, res["sent"]), (0, 2))
        _, d = self.run_board("json")
        self.assertEqual(d["draft"], [])
        answered = [b for b in d["batches"] if b["status"] == "answered"]
        self.assertTrue(answered)  # the demo comes with one answered batch
        rc, res = self.run_board("ok", answered[0]["sent"])
        self.assertEqual((rc, res["ok"]), (0, True))
        _, d = self.run_board("json")
        self.assertEqual(next(b for b in d["batches"] if b["sent"] == answered[0]["sent"])["status"], "ok-sent")

    def test_ask_about_a_task_or_a_blocked_session(self):
        rc, res = self.run_board("answer", "task|release", "when does it ship?")
        self.assertEqual((rc, res["ok"], res["sent"]), (0, True, 1))
        rc, res = self.run_board("draft", "add", "session|t3", "what is it waiting for?")
        self.assertEqual((rc, res["ok"]), (0, True))
        _, d = self.run_board("json")
        e = d["batches"][-1]["entries"][0]
        self.assertEqual((e["name"], e["where"]), ("release", "Task"))
        self.assertEqual(e["questions"], ["when does it ship?"])
        self.assertEqual([(n["name"], n["where"]) for n in d["draft"]], [("t3", "Blocked session")])
        for key in ("task|nope", "session|t99"):
            rc, res = self.run_board("draft", "add", key, "x")
            self.assertEqual((rc, res["ok"]), (1, False), key)

    def test_errors_are_json_with_exit_1(self):
        for args in (["draft", "add", "nope", "x"], ["answer", "Decide|D1"], ["ok", "nope"], ["frobnicate"]):
            rc, res = self.run_board(*args)
            self.assertEqual((rc, res["ok"]), (1, False), args)
            self.assertTrue(res["error"])


if __name__ == "__main__":
    unittest.main()
