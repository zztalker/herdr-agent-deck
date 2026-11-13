# Changelog

What changed in `agent-deck`, newest first. Dates are when it landed on `main`.

## 2026-11-12

### Changed
- **Cursor agents:** the README and recipe point to the Cursor hook now shipped in [herdr-agent-waiting-mod](https://github.com/zztalker/herdr-agent-waiting-mod) ([`1a34c00`](https://github.com/zztalker/herdr-agent-waiting-mod/commit/1a34c00)). With it a Cursor Agent CLI pane is an agent card (status, Cursor's icon), not a program. Its one installer, `agent-waiting/hooks/install.sh`, installs the Claude Code (Waiting) and Cursor hooks for whichever agents a machine has, and warns when hc has no `hc report`; the hc build to use is now [0.1.21-report.1](https://github.com/zztalker/herdr-core/releases/tag/0.1.21-report.1). No mod code changed.

## 2026-11-09

### Added
- **Label badges on the rail:** a session with a `task` or `role` label shows their first letters (`CR` for cloud-scan / reviewer) instead of its program icon. Without labels the icon stays.
- **One color per task:** a badge's color is its task's, one of 10 that can't be confused, with a palette for the dark and the light appearance. It's worked out from the task's name, and a task whose color another task on the rail already has takes the next free one, so up to 10 tasks on screen never share. A task keeps its color while it stays on the rail. (The first version colored by the first letter, from 26 colors; too many of them looked alike at badge size.) Tests: `agent-deck-agents/badge.test.mjs`.
- **Choose a task's color:** a Color row in the label editor (`Auto` and the 10 colors) saves a color for the task, shared by all its sessions and kept across restarts (`agent-deck.task-colors` in Herdr's shared state).
- **The rail looks like herdr-app [PR #286](https://github.com/herdrdev/herdr-app/pull/286)** (by ali, ported into `agent-deck-spaces` and `agent-deck-agents`, which don't get Herdr's changes): spaces are centered colored avatars with a status dot when they need you, agents are their program's icon and status mark, and the `«` / `»` button is a 26px button. The hover cards stay. The PR's `workspace-chrome` part (the brand row, snapping out of in-between widths) arrives with Herdr, since agent-deck uses that mod as shipped.
- **Copy link on Agents cards:** resting on a Claude Code card in the Agents column (or its hover card on the rail) shows the link icon, as on Overview cards.
- **`«` / `»` in the Agents footer:** `«` narrows the sidebar to the rail, `»` brings back its width.
- **The focused agent stands out on the rail:** `selected` background and an `accent` border, as its wide card has.
- **Labels in pane headers** (new `agent-deck-pane` mod, a clone of the shipped `pane`): a terminal's own labels show at the right end of its pane's top line, styled like the Overview's chips (name dimmed, value bright, tooltip `key=value`). Tests: `agent-deck-pane/labels.test.mjs`.

### Fixed
- **Tab names follow the session:** a tab named only after its program (`Claude Code`) shows the agent's chat title. Tabs History reopens are no longer named after the title they had then, so a later `/rename` shows there too. Clearing a stale name (an empty `tab.rename`) hands it back.
- **Copy link and "bring to front" for sessions on this computer:** Herdr reports the shell wrapper's pid (`fish -lic 'command claude; exec fish'`), not claude's, so Copy link found no session and History or a `herdr-resume://` link opened a second copy of a running one. `SESSION_OF` now looks at the wrapper's child, `SESSIONS` lists a running session under its parent's pid too. Run `resume-link/install.sh` again to update the link handler.
- **Path titles:** an agent whose title is a path (`~/src`) no longer shows as `src` in the Agents list (`agent-deck-agents/title.js`).

## 2026-11-06

History search and resume links follow the design of Martin Krcho's Herdr setup ([GitHub](https://github.com/martinkrcho) · [LinkedIn](https://www.linkedin.com/in/martinkrcho/)): an index of Claude Code transcripts kept on each machine, `claude --resume` to reopen, and the `herdr-resume://<machine>/<session-id>` link format, so links work with either handler. Thank you, Martin. The code here is agent-deck's own implementation.

### Added
- **History** (new `agent-deck-history` mod): a dialog that searches past Claude Code sessions on every connected machine, opened from a search icon beside the Overview icon in the Agents footer (or `mod.open:agent-deck-history`).
  - An empty box shows Recent (the last 8, without the ones running now); typing matches every word in the title (a `/rename` wins over Claude's own), folder or machine (`local` for this computer), newest first, up to 50, running ones marked `running`.
  - A pasted `herdr-resume://` link or a bare session id finds that one session.
  - ↑ / ↓ and Enter, or a click: a running session comes to the front; any other reopens with `claude --resume <id>` in a new tab on its machine (in a space in the same folder first), in the nearest folder that still exists.
  - Each machine keeps `~/.cache/agent-deck-history/index.tsv`: only new or changed transcripts are read again (the first scan of a busy machine took 3–14 s here, later ones ~0.15 s), and a scan cut short keeps what it read. Headless Agent SDK runs are left out.
- **Full text** in History: a check button beside the search box (remembered, or `agent-deck-history.full`) searches inside the conversations too. Each machine greps its titled sessions' transcripts for the typed text, literally and in any case (`grep -F -i`, at least 3 characters, after a 0.4 s pause), and each card gets a third line: the first matching conversation line, shortened to the words around the match, with the match picked out. Only user and assistant lines count (tool output included): the instructions injected into every session and the raw API-request copies are skipped, so a word from your CLAUDE.md doesn't match every session. Here: about 0.2 s per VM, 5 s on a Mac with a 987 MB transcript.
- `agent-deck-history.search <text>` types a search into the open History dialog.
- **The Overview remembers the task filter:** the last pick in the `Task ▾` menu applies the next time the Overview opens. `agent-deck-overview.task <name>` picks a task (`task` alone: all).
- **Resume links:** `Copy link` on History rows and a link icon on Claude Code cards in the Overview copy a `herdr-resume://<machine|local>/<session-id>` link. A running card's id is read on click from `~/.claude/sessions/<pid>.json` on its machine (no link before the first message).
- **`resume-link/`** (macOS): `install.sh` builds `~/Applications/Agent Deck Resume Link.app`, which opens `herdr-resume://` links: it brings the session to the front if it runs, else reopens it as History does. Log: `~/Library/Logs/agent-deck-resume.log`. Python 3, standard library only; tests in `test_agent_deck_resume.py`.
- Tests: `agent-deck-history/history.test.mjs` (runs the scan script on a fake home: titles, the index, a scan killed halfway, live sessions) and `agent-deck-overview/resume.test.mjs`.
- **Labels on cards.** A terminal's own labels (`hc label t7 role=reviewer`) show as `key value` chips on Overview cards, on both tabs. Herdr's own labels (`where`, `herdr.*`) are left out.
- **Label editor** (new `agent-deck-labels` mod): a dialog with Role and Task fields, `+ Add label` for other `key=value` rows, and Save / Cancel (Enter / Esc). Save runs `hc label` with only what changed; an emptied value removes the label. Keys with spaces or `=`, or starting with `-`, are refused.
  - Suggestions under the field being typed: values from every live terminal on every machine, plus, for tasks and roles, the ones saved before (kept in the mod's localStorage, most recent first, 50 at most).
  - Opened from a tag icon on every agent card in the Overview, from a tag button beside `+` in the tab bar (labels the focused terminal, agent or shell; its tooltip lists the current labels), or with `mod.open:agent-deck-labels`.
- **Task filter** on the Overview: a `Task ▾` menu beside the filter box lists every task with its count, plus `No task`; picking one filters both tabs (tabs read `Agents 1/21`).
- Commands `agent-deck-overview.label` (label the focused agent) and `agent-deck-overview.tasks` (open or close the task menu).
- New `agent-deck-tabs` mod: Herdr's shipped `tabs` (0.1.13) with the tag button; the layout uses it instead of `tabs`.
- Tests: `agent-deck-overview/labels.test.mjs` (chips, task filter) and `agent-deck-labels/edit.test.mjs` (suggestions, cache, `hc label` arguments).
- **Usage on the Overview's Terminals tab.** A `Usage` button in the title row measures every machine at once and shows `CPU · MEM · Disk` in percent under each machine's lane header: amber from 75%, red from 90%. A machine that is not connected, or does not answer, shows why instead. It measures only when pressed, about a second per machine, all in parallel.
- `agent-deck-overview.usage` command: switches to the Terminals tab and measures (keys can name it).
- `mods/agent-deck-overview/usage.js` (the measuring script and its parser) with tests in `usage.test.mjs` (`node --test usage.test.mjs`).

### Changed
- The Overview now also runs `hc exec [--on <machine>] -- sh -c <script>` when Usage is pressed. The script only reads (`/proc/stat`, `/proc/meminfo`, `df` on Linux; `top`, `vm_stat`, `sysctl`, `df` on macOS).
- The layout now writes labels when you save them in the editor (`hc label`); everything else stays read-only.
- History runs a read-only scan script on each machine with `hc exec` while its dialog is open; it writes only its own cache, `~/.cache/agent-deck-history/index.tsv`.
- The Agents footer holds two icons (Overview, History); on the narrow rail it is 76px tall instead of 52px.

## 2026-11-05

### Added
- **Waiting** state: an idle agent whose own hook still reports background work (`hc report state=working:id=bg`) shows as Waiting in the sidebar and in the Overview's Working lane. Needs the Claude Code hook from [herdr-agent-waiting-mod](https://github.com/zztalker/herdr-agent-waiting-mod) and an hc with `hc report`.

## 2026-11-04

### Added
- `+` on each Overview Terminals lane opens a new space on that machine.

## 2026-11-02

### Added
- Filter box on the Overview: every typed word must appear on a card, or it is hidden.
- Grabbable divider between Spaces and Agents; the Agents header rolls Spaces up.

### Docs
- README leads with the agents Overview; `preview.png` is the Overview (herdr.dev card picture).
- Divider cursor note says what was seen, with the right Herdr version.

## 2026-11-01

### Added
- First version of the `agent-deck` layout: `agent-deck-spaces`, `agent-deck-agents` and the `agent-deck-overview` board.
- Settings preview picture for the layout.
- Tabs holding one agent take the chat's name, so Herdr's alerts say which chat.
