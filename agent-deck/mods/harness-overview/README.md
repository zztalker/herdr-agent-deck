# harness-overview

A full-window board for the work your agents do: what needs you, what is on review, tasks in progress, blocked sessions, and your questions with their answers. You answer a card from the board: **Send** sends it now, **Save draft** keeps it to send later. **Message**, beside the manager in the header, writes to the manager about anything.

The data comes from a script of yours. Herdr only shows it and runs the script's commands when you press a button. Open it with `⌘⇧H` or the board icon beside the Overview icon at the foot of the Agents column.

## Set it up

Name the script in `~/.config/herdr-app/data/harness-overview/config.json`. That's outside `layouts/` and `mods/`, so the setting never travels with them:

```json
{ "command": "python3 ~/path/to/board.py", "every": 120 }
```

- `command`: run through `sh -c`, so `~` and `PATH` work. Arguments are added as separate words and never re-read by the shell.
- `every`: seconds between refreshes while the page is open (default 120, at least 30). It also refreshes after every button and on **Refresh**. The timed refresh waits while you type an answer or a message, or read a text in the reader, so your place in it stays put, and runs once you close it.
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

A Needs-you or Reviews card with a `question` status other than `answered` (you asked about it, or sent your OK) waits on the harness, not on you: it shows under **In progress**, "Asked or answered by you, waiting on the harness", until the script drops it or changes its status. An `answered` card stays in its column: the answer is yours to read.

**card:**

| Field | Meaning |
| --- | --- |
| `qkey` | Unique key; the buttons pass it back as `KEY`. |
| `id`, `group` | Title line: the id, else the first bold or link text in `text`, else the group, else the column; the group dimmed beside it. |
| `text` | Markdown, shown as such. Links, bare URLs (named as people name them: `app!183`, `tool#12`, `app job 4506831`, `ABC-123`, else host/…/last part) and the card's session addresses are clickable (a session goes to it; so does `tN` or `other-name/tN` when exactly one listed session ends in `/tN`). Cut at about 140 visible characters so cards stay small; "more" opens the whole text, formatted, in a reader window (see **Reader** below). |
| `age`, `due`, `rec` | Optional: "16h" at the right, a `due 2026-01-07` chip, a `★ recommendation` line. |
| `tasks` | Task names, as chips. |
| `sessions` | `[{ "address": "vm/t2", "status": "blocked" }]`: chips colored by status; a running one (status set) is a button that goes to that session. |
| `links` | URLs, opened in the browser; shown as chips only when the text doesn't already contain them. |
| `question` | Status of a question you sent about it: `waiting`, `answered`, `ok-sent`, `accepted`. |
| `ok` | Optional: with `question` `answered`, an **OK** button (on the card and in its reader) that runs `ok <ok>`. |
| `draft` | Your saved notes on it: `[{ "nid": "…", "text": "…" }]`, each with ✕. |

**task** (In progress; `Waiting on you` first, `Closed` left out): `task`, `title`, `state`, `column` (`Active`, `Waiting on you`, `Closed`), `sessions` (as on cards), `last` (latest log line). Optional: `id` (a subtask's id: the card is named by it, so a task can have several cards, one per subtask; the Task filter still goes by `task`) and `key` (what its **Ask** button passes as `KEY`).

**batch** (Questions; `answered` first with **ACK** and **OK** buttons, then `waiting` and `ok-sent`; `accepted` left out): `sent` (its id), `status`, `entries`: `[{ "key", "name", "where", "quote", "questions": [text], "answers": [{ "head", "body" }], "draft": [note] }]`. Each entry stays small: its `name` as its title (a URL reads as `app!183` and opens on click), an `asked from <where>` chip, and one short line: the newest answer, else the newest question. Its one "more" opens the whole thread in the reader: every entry with the same `name` across the batches, newest first, under what it was asked from and about (its `quote`: the item as it read when asked). Within a batch, questions and answers are one timeline by the date each starts with (an answer's `head`), newest first, so an answer sits above the question it answers. An entry with answers has **Ask more**, which uses its `key` as `KEY`.

**blocked**: sessions waiting on a dialog, shown on top of In progress: `{ "address", "task", "title" (its tab), "kind" (`question`, …), "question" (what the dialog asks, markdown), "since" (ISO time asked), "harness": { "state", "next", "ask", "result" } (any notes the session keeps), "cards": [qkey] (queue cards naming it) }`; only `address` is required. The card shows the title, `kind · asked 18h ago · h.state …` chips, the question, `ask:` and `next:` notes, and `on the board: Urgent · Decide ×3` chips that filter the board to that session.

The filter box matches every word against ids, groups, text, tasks, sessions and answers. The **Task** drop-list (All, each task, No task; each with its number of cards waiting on you: in Needs you and Reviews, not counting asked ones or the other columns, so a task can show 0) shows one task's cards: queue cards and batches by their `tasks`, task cards and blocked sessions by their `task`. The pick is remembered.

**note** (a draft; in `draft` and on cards): `{ "nid", "qkey", "text", "at" }`, plus for the Drafts dialog's titles `id` or `name` (else `key`), `column` or `where`, `group` and `excerpt` (all optional).

**Esc** closes the innermost thing open: an answer box in the reader, the reader, the Message dialog, the Task menu, the Drafts dialog (its edit box first), the answer box, the filter, and only then the board.

**ACK** on an answered batch means you read it and need nothing more, and tells nobody: unlike **OK**, it runs no command. The batch moves behind an `ACKs (N)` toggle at the foot of Questions (like FYI), where **Un-ACK** brings it back. The page keeps the ACKs itself (its local storage, this computer only), by batch and its number of answers, so a new answer on an ACKed batch shows it again.

**Drafts dialog** (the `Drafts (N)` button): every draft by card, with ✎ (edit), ✕, `Send this card` per card and `Send all`.

**Message dialog** (the **Message** button beside the manager; shown when the board has a `manager`): pick the task it is about (it starts on the task the board shows; **No task** for none) and write. **Send** runs `tell "for <task>: <text>"` (just the text with no task). On success the dialog closes; on an error it stays open with your text, so you can send again later.

### Reader

"more" opens the whole text in a large window. Its foot has the card's buttons, so you can act while you read: **Answer** (a queue card), **Ask** (a task or blocked session), **Ask more**, **ACK** / **Un-ACK** and **OK** (a question). The answer box opens there too; Esc closes it before the reader, and closing the reader moves an unsent answer to its card. ACK, Un-ACK and OK close the reader, since the question moves. **Copy all** at its top right puts that text (markdown) on the clipboard. To copy a part, select it and press `⌘C` (`Ctrl+C` on Linux and Windows); `⌘A` selects all of it. The text view handles those keys itself: a mod can't read the selection, so a button can't copy it. While the reader is open the cards behind it can't be selected, so a selection holds only the reader's text. Each paragraph of a text (paragraphs are separated by blank lines) gets **guess formatting** first (`format.js`): fixed rules, so the same text always comes out the same, and a paragraph that already has line breaks is left as written. In order:

1. a leading `2026-01-21 00:28` time is made bold;
2. a text opening with a bold header (`**[brief](…)** · **from `vm/t5`** (tab "…"):`) has that header, up to its first `: ` outside quotes and brackets, on its own line;
3. ` — **2026-…` (a dated update) starts a paragraph;
4. options at the end, `(A (Recommended) · B)`, become a bullet list;
5. inline steps `1) … → 2) … → 3) …` become a numbered list;
6. a label after a sentence (`Was: …`, `Report: …`, `**P1 order:** …`) starts a paragraph;
7. a paragraph still over 400 characters is split at sentence ends into paragraphs of about 300 (not after `e.g.`, `i.e.`, `etc.`).

Links, autolinks and code spans are never split or changed.

### The button commands

| Button | Runs | Should |
| --- | --- | --- |
| Save draft | `draft add KEY TEXT` | keep a note for that card (or task / session, below) |
| ✎ then Save (Drafts dialog) | `draft edit NID TEXT` | change its text |
| ✕ on a draft | `draft del NID` | delete it |
| Send (in the answer / ask box) | `answer KEY [TEXT]` | send that card's drafts plus TEXT now; leave other drafts alone |
| Send this card (Drafts dialog) | `answer KEY` | send that card's drafts |
| Send all (Drafts dialog) | `send` | send every draft |
| OK | `ok SENT` | accept that batch's answer |
| Send (Message dialog) | `tell TEXT` | send TEXT to the manager now; fail (`"ok": false`) when it can't, such as while the manager waits on a dialog a message would answer |

**KEY** is a card's `qkey`, an answer entry's `key`, `task|<task>` (the **Ask** button on a task card; a task's own `key` if it has one) or `session|<address>` (**Ask** on a blocked session). For the last two the script should send your text with what it knows about that task or session, so the reader has the context.

Commands for keys: `harness-overview.drafts` toggles the Drafts dialog, `harness-overview.message` opens the Message dialog, `harness-overview.refresh` rereads, `harness-overview.task <name>` / `harness-overview.task` pick a task / all.

Each prints `{ "ok": true, … }` or `{ "ok": false, "error": "…" }`. After **Send** the page says "not pinged" when the reply has `"pinged": false`.

## Files

- `main.js`: the page. `board.js`: config, columns, links, titles, tasks, drafts and threads, tested in `board.test.mjs` (`node --test board.test.mjs`). `format.js`: the reader's guess formatting, tested in `format.test.mjs`.
- `example/board.py`: the example script (stdlib Python), tested in `example/test_board.py` (`python3 -m unittest test_board.py` from `example/`).
- `kanban.svg`: Lucide `square-kanban` (ISC).

What it runs: only your command (`exec sh -c`), and `open` / `xdg-open` for a link you click. It writes nothing itself except its own local storage (the last board, the task pick, ACKs).
