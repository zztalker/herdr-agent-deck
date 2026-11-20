# harness-overview

A full-window board for the work your agents do: what needs you, what is on review, tasks in progress, blocked sessions, and your questions with their answers. You answer a card from the board: **Send** sends it now, **Save draft** keeps it to send later.

The data comes from a script of yours. Herdr only shows it and runs the script's commands when you press a button. Open it with `⌘⇧H` or the board icon beside the Overview icon at the foot of the Agents column.

## Set it up

Name the script in `~/.config/herdr-app/data/harness-overview/config.json`. That's outside `layouts/` and `mods/`, so the setting never travels with them:

```json
{ "command": "python3 ~/path/to/board.py", "every": 120 }
```

- `command`: run through `sh -c`, so `~` and `PATH` work. Arguments are added as separate words and never re-read by the shell.
- `every`: seconds between refreshes while the page is open (default 120, at least 30). It also refreshes after every button and on **Refresh**.
- `on` (optional): a machine name from `hc machine ls` to run the command on.

Without the file, or without `command`, the page says the config is absent, shows this format, and runs nothing.

To try the page with made-up data, point it at the example: `{ "command": "python3 ~/.config/herdr-app/mods/harness-overview/example/board.py" }`. Its buttons work: it keeps drafts and sent questions in `~/.cache/harness-overview-example.json`.

## What the script delivers

Every command prints **one JSON object** on stdout. `"ok": false` with an `"error"` (and exit 1) is shown as an error; the page keeps the last board it had.

### `<command> json`: the board

```json
{
  "ok": true,
  "at": "2026-01-05T10:00:00+00:00",
  "source": "where the data came from (shown in the header)",
  "manager": { "address": "t1", "status": "idle" },
  "commit": { "age": "1h", "subject": "last change", "dirty": 0 },
  "sections": [ { "column": "Decide", "title": "Decisions needed", "items": [ card ] } ],
  "tasks": [ task ],
  "batches": [ batch ],
  "blocked": [ { "address": "vm/t3", "task": "release" } ],
  "draft": [ note ]
}
```

Only `ok` is required; a missing part shows as empty. `manager` and `commit` are optional header details.

**Columns.** A section's `column` picks where its cards go:

| `column` | Shown in |
| --- | --- |
| `Urgent`, then `Decide` | **Needs you** (Urgent cards get a red border) |
| `Ready to merge`, then `On review` | **Reviews** |
| `FYI` | **In progress**, behind the FYI toggle |
| anything else | not shown |

**card:**

| Field | Meaning |
| --- | --- |
| `qkey` | Unique key; the buttons pass it back as `KEY`. |
| `id`, `group` | Title line: the id in bold, the group dimmed (the group alone when there's no id). |
| `text` | Markdown, shown as such. Links, bare URLs and the card's session addresses are clickable (a session goes to it; so does `tN` or `other-name/tN` when exactly one listed session ends in `/tN`). Long text folds behind "more". |
| `age`, `due`, `rec` | Optional: "16h" at the right, a `due 2026-01-07` chip, a `★ recommendation` line. |
| `tasks` | Task names, as chips. |
| `sessions` | `[{ "address": "vm/t2", "status": "blocked" }]`: chips colored by status; a running one (status set) is a button that goes to that session. |
| `links` | URLs, opened in the browser; shown as chips only when the text doesn't already contain them. |
| `question` | Status of a question you sent about it: `waiting`, `answered`, `ok-sent`, `accepted`. |
| `draft` | Your saved notes on it: `[{ "nid": "…", "text": "…" }]`, each with ✕. |

**task** (In progress; `Waiting on you` first, `Closed` left out): `task`, `title`, `state`, `column` (`Active`, `Waiting on you`, `Closed`), `sessions` (as on cards), `last` (latest log line).

**batch** (Questions; `answered` first with an **OK** button, then `waiting` and `ok-sent`; `accepted` left out): `sent` (its id), `status`, `entries`: `[{ "key", "name", "where", "quote", "questions": [text], "answers": [{ "head", "body" }], "draft": [note] }]`. An entry with answers has **Ask more**, which uses its `key` as `KEY`.

**blocked**: sessions waiting on a dialog, shown on top of In progress.

The filter box matches every word against ids, groups, text, tasks, sessions and answers. The **Task** drop-list (All, each task with its number of cards, No task) shows one task's cards: queue cards and batches by their `tasks`, task cards and blocked sessions by their `task`. The pick is remembered.

**note** (a draft; in `draft` and on cards): `{ "nid", "qkey", "text", "at" }`, plus for the Drafts dialog's titles `id` or `name` (else `key`), `column` or `where`, `group` and `excerpt` (all optional).

**Drafts dialog** (the `Drafts (N)` button): every draft by card, with ✎ (edit), ✕, `Send this card` per card and `Send all`.

### The button commands

| Button | Runs | Should |
| --- | --- | --- |
| Save draft | `draft add KEY TEXT` | keep a note for that card |
| ✎ then Save (Drafts dialog) | `draft edit NID TEXT` | change its text |
| ✕ on a draft | `draft del NID` | delete it |
| Send (in the answer box) | `answer KEY [TEXT]` | send that card's drafts plus TEXT now; leave other drafts alone |
| Send this card (Drafts dialog) | `answer KEY` | send that card's drafts |
| Send all (Drafts dialog) | `send` | send every draft |
| OK | `ok SENT` | accept that batch's answer |

Commands for keys: `harness-overview.drafts` toggles the Drafts dialog, `harness-overview.refresh` rereads, `harness-overview.task <name>` / `harness-overview.task` pick a task / all.

Each prints `{ "ok": true, … }` or `{ "ok": false, "error": "…" }`. After **Send** the page says "not pinged" when the reply has `"pinged": false`.

## Files

- `main.js`: the page. `board.js`: config, columns and text, tested in `board.test.mjs` (`node --test board.test.mjs`).
- `example/board.py`: the example script (stdlib Python), tested in `example/test_board.py` (`python3 -m unittest test_board.py` from `example/`).
- `kanban.svg`: Lucide `square-kanban` (ISC).

What it runs: only your command (`exec sh -c`), and `open` / `xdg-open` for a link you click. It writes nothing itself.
