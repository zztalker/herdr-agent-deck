# Agent Deck

Herdr's main window rebuilt to show what every agent is doing on every machine. Spaces say what's inside them: chat names, status counts, open shells and running programs. Agents are two-line cards. On the narrow rail, resting the pointer on a row shows its wide card. A full-window Overview (`⌘⇧O`) lays out every agent as a board with one lane per state, and every terminal on every machine with its command and last output lines.

![Overview: agents](preview.png)

![Main window](main-window.png)

## What you see

**Sidebar (268px, `chrome` background), top to bottom:**

- **Brand bar** (46px): the shipped `workspace-chrome` mod.
- **Spaces** (half of the rest, min 90px):
  - **Machine header** (26px): one per machine when more than this computer is known, with:
    - a server/monitor icon and the name;
    - a red `N needs you` badge;
    - `N terms · M hidden` (tooltip: agents / other / hidden in no space);
    - `+` (new space there);
    - a 6px dot, `ansi2` when connected (tooltip: state and `hc` version);
    - a fold chevron.
  - **Space row:**
    - an 18px colored letter avatar and the name (max 150px);
    - git tail (repo/branch only when unusual, ↑ahead ↓behind);
    - status counts in status colors (`1 needs you`, `1 working`, `2 idle`);
    - `N shells · M busy`.
  - **Under the row**, up to 4 lines (11.5px) per kind, then `+N more`:
    - its agents' chat names, each with a status dot;
    - its shells/programs: program icon, program name, and the folder (or the program's own title while busy, unless that is a path, a prompt or just the terminal id).
- **Divider:** a 12px gap with a 2px `dim` line (the layout's `divider` on `sidebar-lists`); drag it to resize.
- **Agents** (the other half, min 90px). Its header `Agents ⌄` rolls Spaces up (`layout.toggle {id: "spaces"}`); `Agents ›` shows it again. On the rail the same chevron sits above the list. Grouped by space, or by priority (Needs you / Done / Working / Waiting / Idle) with the sort menu. Each agent is a card (8px radius, `surface` background, `border`; focused: `selected` background and `accent` border):
  - **Line 1:** program icon, chat name (semibold), the fold chevron with sub-agent count, time in state (a pin on hover), status mark.
  - **Line 2:** chips `@machine` (`@local` here) and the space name.
- **Agents footer** (28px): on the left a layers icon (Overview) and, 12px after it, a search icon (History); at the right `«` (tooltip `Narrow the Agents column`) narrows the sidebar to the rail. On the rail it is 76px and stacks the two icons over `»` (`Widen the Agents column`), which brings back the width it had (268px by default).
- **Copy link on Agents cards:** resting on a Claude Code card (program key `claude`) shows a 12px link icon before the pin, as on Overview cards: `ansi2` for 2 s after a copy, `blocked` when there's no session to link yet. The rail's hover cards have it too.
- **Sidebar footer** (69px): the shipped `workspace-chrome` footer.

**Narrow rail** (under 160px wide, 76px on macOS), the cells as in herdr-app [PR #286](https://github.com/herdrdev/herdr-app/pull/286), centered: a space is its 22px colored avatar (a branch mark for a worktree), 34px high (30 for a worktree), with a 9px status dot on its corner when it needs you; the active one has the `selected` background, and right-click opens its menu. The `+` above them is centered. An agent is its program's 16px icon (its number when it has none) and its status mark, 30px high, 8px radius; the focused one has the `selected` background and an `accent` border. The `«` / `»` button is 26px with a `hover` background. Resting on any row for 250ms opens its wide card to the right:
- an agent card is 300px wide and includes its sub-agents;
- a space card is 320px wide.

The cards use `popover` background, `border` and `shadow_lg`.

**Main area:** the tab bar (42px), panes, a `files`/`changes` panel (368px) and the `workspace-status` bar (28px). These are Herdr's main layout, except that the tab bar is `agent-deck-tabs`: the shipped `tabs` with a 26px tag button left of `+` (Lucide `tag`, 14px, `dim`; `border` color when no terminal is focused). Its tooltip lists the focused terminal's own labels (`Labels: role=lead · task=PROJ-1`), or says `Add labels (role, task…)`.

**Pane header** (`agent-deck-pane`): Herdr's shipped pane header, plus the terminal's own labels (not `where`, not `herdr.*`, not empty) right-aligned after the folder, before the status mark and the hover buttons. They're chips like the Overview's, sorted by key: `key` in `dim`, the value in `foreground`, 10.5px, `chrome` background, `border`, each cut at 220px (tooltip `key=value`), 480px at most for all of them; the folder shrinks first.

**Label editor** (`agent-deck-labels`): a dialog 560px wide, `popover` background, 16px padding.
- **Header:** tag icon, `Labels`, then `<chat or program name> · <address>` in `dim`.
- **Rows:** `Role` and `Task` always (a 64px label, then a 28px field with the `accent` border while focused); then one row per other label the terminal has: a 120px key field, the value field and a `×`.
- **Suggestions:** under the focused value field, up to 8 clickable chips (11px, `chrome` background, `accent` border on hover).
- **`+ Add label`** adds a key/value row; an error line (`blocked`) when a key is refused or `hc label` fails.
- **Footer:** `Enter saves · Esc cancels · an empty value removes the label`, `Cancel` (bordered) and `Save` (`accent` background; `Saving…` while it runs).

**History** (`agent-deck-history`): a dialog 720px wide, 70% of the window tall, `popover` background, 16px padding.
- **Header:** search icon, `History`, then `N past sessions on M machines` (`Reading devbox, …` while scans run).
- **Search box** (34px, `accent` border while it has text): `Search past sessions, or paste a herdr-resume:// link`; it has the keyboard when the dialog opens. At its right a `Full text` check button (a 14px box, `accent` with a check when on).
- **A small heading:** `Recent`, `Matches (N)` (`N+` at the limit), `Full text: N sessions · searching devbox…` or `This session` for a pasted link.
- **Full-text rows** grow a third line: the matched line in the terminal font, 11px, `chrome` background, the match semibold in `accent`, the words before and after it `dim` and cut with `…` (tooltip: the whole shortened line).
- **Rows** (46px, 8px radius, `surface`, `border`; the picked one `selected` with an `accent` border): a clock icon (a `working` dot when the session runs now), the title (13px) over `machine · folder` (11px, `dim`, server or monitor icon, home as `~`); on the right `running` (a `working` pill) or the age (`5m`, `3h`, `2d`); on hover `Copy link` (`Copied` for 1.5 s); `Opening…` while it opens.
- **Footer:** errors per machine (`blocked`), then `↑ ↓ pick · Enter opens · Esc closes · …`.

**Copy link on Overview cards:** a Claude Code card (program key `claude`) has a 12px link icon (Lucide `link`) before its tag icon; `ansi2` for 2 s after a copy, `blocked` when there's no session to link yet.

**Overview:** a dialog at 85% × 85% of the window.
- **Title row** (44px): `Overview`, the tab switch `Agents N | Terminals N`, the machine count, a filter box (up to 360px, `search` icon, `accent` border while it has text), a `Task ▾` menu (28px, up to 240px, `accent` border while it filters; the open list is a 280px popup under it, up to 360px tall, with `All tasks`, every task and `No task`, each with its count on the current tab), status pills (Agents tab only), a bordered `Usage` button (Terminals tab only; `Usage…` while measuring) and a close button.
- **Machine strip:** one chip per machine with a connection dot, `N agents · N terms`; the tooltip shows the state, `hc` version and hidden terminals.
- **Agents tab:** four lanes, left to right:
  - **Working** (`working` color), **Needs you** (`blocked`), **Done** (`done`) and **Idle** (`idle`), each with a 2px colored underline and a count;
  - the Working lane also holds **waiting** agents (state word and pill in `muted`), after the busy ones;
  - inside a lane, agents are grouped by machine (small header, count);
  - cards are at least 240px and wrap several to a line;
  - an empty lane shrinks to 150px and says `None`.
- **Terminals tab:** one lane per machine. The header shows the count, `N running` and `N hidden`, and on a connected machine a `+` at the right (tooltip `New space on <machine>`); the underline is `ansi2` when connected. After `Usage` was pressed, a 24px row under the header reads `CPU 12% · MEM 47% · Disk 81%` (labels `dim`, values semibold: `foreground`, `working` from 75%, `blocked` from 90%, `–` for one it could not measure); `Measuring…` while it runs, or `Usage: <reason>` (tooltip: the full reason) for a machine that is not connected or did not answer. Cards are at least 260px. Each card shows:
  - the program icon;
  - the command as typed (`make test`), `zsh` for an idle shell, or the chat name for an agent;
  - a state word: `running` (accent), `idle`, or the agent's status;
  - the folder, `space / tab` (or `hidden` in `done` color) and its age;
  - the last 2 non-empty screen lines in the terminal font (an agent shows its last report message instead).
- **Labels on cards (both tabs):** an agent card has a 12px tag icon (`dim`) before its status mark or word. A card whose terminal carries labels of its own (not `where`, not `herdr.*`, not empty) shows them as chips under its second line, sorted by key: `key` in `dim`, the value in `foreground`, 10.5px, `chrome` background, `border`, cut at 200px (tooltip `key=value`), wrapping to more lines.

## How it behaves

**Status:**
- **working:** yellow dot, or a spinner in the Agents list.
- **blocked:** red: `needs you`, `!` in priority view, a red card border in the Overview.
- **done:** blue, until you look at it; then it is idle.
- **idle:** a grey ring or dot, with dimmed names.
- **waiting:** an `idle` agent whose 7501 record `bg` is `working`: a slow grey spinner (2.4 s a turn) in its own Waiting section, and in the Overview's Working lane. A `done` agent stays done until you look at it, whatever its records say. The `bg` record comes from a hook, such as the Claude Code hook in [herdr-agent-waiting-mod](https://github.com/zztalker/herdr-agent-waiting-mod) (needs an hc with `hc report`, [herdrdev/herdr-core#81](https://github.com/herdrdev/herdr-core/pull/81)). Without it no agent waits and nothing changes.

**Clicks:**
- An agent card or row focuses its pane.
- A space row selects the space; right-click opens its menu; dragging reorders spaces.
- A machine header folds that machine.
- Overview:
  - an agent card runs `agent.focus` and closes the Overview;
  - a terminal card in a pane runs `pane.focus`;
  - a hidden terminal (in no space) runs `terminal.peek`;
  - a Terminals lane's `+` runs `space.new {machine}` (empty for this computer): a new space with a shell in that machine's home. Then the Overview closes.
  - `Usage` measures this computer and every connected machine in parallel; each lane fills in as its answer comes. Pressing it again while a machine is still measuring skips that machine.
  - a card's tag icon opens the label editor for that agent (it stops the click, so the card doesn't also go to the agent);
  - `Task ▾` opens its list; picking an entry filters and closes it; clicking `Task ▾` again or `Esc` closes it.
- The tab bar's tag button opens the label editor for the focused terminal, agent or shell (nothing when no terminal is focused).
- Label editor:
  - clicking a suggestion puts it in the field;
  - `Save` or Enter in any field runs `hc label <address> k=v… k=…` with only what changed (an emptied value or a removed row sends `k=`), remembers the role and task in the mod's localStorage, and closes; nothing changed just closes;
  - `Cancel` or `Esc` closes without writing.

**Filter:** typing goes to the filter box as the Overview opens. Every word must appear on a card (any case), or the card is hidden:
- an agent: chat name, program, state word, space, tab, machine (`local` for this computer);
- a terminal: command, folder, `space / tab` or `hidden`, address, title, last lines, machine.

The task menu filters too: a card shows only if its terminal's `task` label is the picked one (`No task`: it has none). Both filters apply together. While either is on, the tabs read `Agents 3/9`, the pills count only what matches and empty lanes say `No match`. The last pick is remembered (localStorage `taskFilter`) and applies when the Overview opens again; a stored value it can't read means all tasks.

**Suggestions** in the label editor: values of that key from every live terminal on every machine; for `task` and `role` also the values saved before, kept in `agent-deck-labels`' localStorage (`tasks`, `roles`, most recent first, 50 at most), listed first. Matching is anywhere in the value, any case; values starting with what was typed come first; the value already typed is not offered; with nothing typed, the first 8. The `×` or `Esc` clears it; `Esc` again closes the Overview.

**History:**
- Empty box: Recent, the 8 newest past sessions not running now.
- Typing: sessions where every word appears in the title, the folder or the machine (`local` for this computer), any case; newest first, up to 50; running ones included and marked.
- A pasted `herdr-resume://<machine|local>/<id>` (or a bare id): that session only (on any machine for a bare id).
- ↑ / ↓ move the highlight, Enter or a click opens: if the session runs in a terminal now (a pid in `~/.claude/sessions/*.json` on its machine that a live terminal there runs), `agent.focus` on it; else `claude --resume <id>` with `tab.new` in a space on its machine (the one whose folder is the session's first), else `space.new` there, in the session's folder or its nearest existing parent. Then the dialog closes.
- Every reachable machine is scanned when the dialog opens; each fills in as it answers.
- **Full text** (remembered in localStorage `full`): with at least 3 characters typed and 0.4 s since the last key, each scanned machine runs `FULLTEXT` with the text; the list is then the sessions it reports, newest first, up to 50. A machine that answers later fills in then; an answer for older text is dropped. A pasted link still finds that session only.
- `agent-deck-history.full` toggles Full text; `agent-deck-history.search <text>` sets the search text.

**Resume links:** `herdr-resume://<machine>/<session-id>`, `local` for the Mac the link is clicked on. `resume-link/install.sh` registers `~/Applications/Agent Deck Resume Link.app` for the scheme; it runs its copy of `agent_deck_resume.py`, which checks the machine is in `hc machine ls`, reads the folder from the session's own transcript there (never from the link), starts Herdr if needed and then shows or reopens the session as History does. Errors are macOS notifications; the log is `~/Library/Logs/agent-deck-resume.log`.

**Keys and commands:**
- `⌘⇧O` (`mod.open:agent-deck-overview`) toggles the Overview; `Esc` closes it.
- `agent-deck-overview.agents` and `agent-deck-overview.terminals` switch its tab while it's open.
- `agent-deck-overview.usage` switches to Terminals and measures, like the button.
- `agent-deck-overview.label` opens the label editor for the focused agent; `agent-deck-overview.tasks` opens or closes the task menu; `agent-deck-overview.task <name>` filters to that task (`task` alone: all).
- `mod.open:agent-deck-labels` opens the label editor for the focused terminal (the tab bar button does the same).
- The tab you used last is remembered.

**Tab names:** a tab holding exactly one agent with a real chat name takes that name, cut to 48 characters. It's checked every 3 seconds and follows the chat if it's renamed. Herdr's own alerts then read `Claude Code needs you`, then `space / <chat name>` instead of `space / 1`. Tabs someone named stay as they are, so History opens its tabs unnamed (`openPlan`). The tab bar shows the same title for a tab that is unnamed or named only after its program (`Claude Code`) (`agent-deck-tabs/name.js`). A title counts when it isn't the program's name, a path (`~/…`, `/…`, `C:\…`) or `user@host`, after Claude's status glyph (`✳ `) is dropped (`agent-deck-agents/title.js`; `name.js` has a copy). Clearing a tab's name (an empty `tab.rename`) hands it back. `NAME_TABS = false` at the top of `agent-deck-agents` turns this off.

**Refresh:**
- Machines: every 15s (Spaces) and 30s (Overview).
- Terminal output lines: every 8s, one `hc read` at a time, only while the Terminals tab shows.
- Usage: never on its own; only when `Usage` is pressed. The numbers stay until the next press or until the Overview reloads.

## Built from

- **`layouts/agent-deck.json`:** a clone of Herdr's `main` layout with `spaces` → `agent-deck-spaces`, `agents` → `agent-deck-agents`, `tabs` → `agent-deck-tabs` and the pane header `pane` → `agent-deck-pane`.
- **`mods/agent-deck-tabs`:** `mod.clone` of the shipped `tabs` (Herdr 0.1.13, `cloned_from` in `mod.json`). A tab's label comes from `tabName(tab, lead)` in `name.js` (node-tested in `name.test.mjs`). It adds `labelButton(t, button)`: the tag button before `+`, from `focused().terminal` and that terminal's `labels` in `terminals()`, opening `openOverlay({ mod: "agent-deck-labels", kind: "dialog", width: 560, props: { terminal } })`.
- **`mods/agent-deck-pane`:** `mod.clone` of the shipped `pane` (Herdr 0.1.14, `cloned_from` in `mod.json`). It reads the pane's terminal's `labels` from `terminals()` and adds the chips after the folder. `labels.js` (no imports): `headerLabels(labels)`, the `[key, value]` pairs to show. Tests: `labels.test.mjs`.
- **`mods/agent-deck-history`:** new, `mod.json` overlay `{ kind: "dialog", width: 720, height: 0.7 }`.
  - `history.js` (no imports, node-tested in `history.test.mjs`): `SCAN` (the per-machine scan), `parseScan`, `parseLink`, `search(rows, query, limit = 50)`, `recent(rows, n)`, `shortPath`, `resumeLink`, `SESSIONS` / `sessionPids` (running sessions: each session file, and a running one again under its parent's pid; `resume-link/agent_deck_resume.py` has a copy), `NEAREST` (nearest existing folder) and `openPlan(spaces, row, folder)` (the `tab.new` / `space.new` to run).
  - `SCAN`: `stat` (GNU, else BSD) lists every `~/.claude/projects/*/*.jsonl` with its change time and size; ones not in `~/.cache/agent-deck-history/index.tsv` are read with `grep -oE` for `cwd` (first), `timestamp` (last), `customTitle` / `aiTitle` and `entrypoint` (`sdk-*` is left out), each row appended to the index at once; then the index is tidied to the last row of each file that still exists. Then `live<TAB>id` for each session file whose pid runs (`kill -0`).
  - `FULLTEXT` (the text as `$1`): for each transcript the index lists, `grep -v -F` drops `"type":"attachment"` and `"type":"api-request-blob"` lines, `grep -F` keeps `"type":"user"` / `"type":"assistant"` ones, then `grep -m1 -i -F --` finds the text; awk prints up to 400 characters around it. `parseHits` reads that; `snippet(raw, query, width = 60)` unescapes JSON and cuts it to whole words around the match.
  - It runs everything as `hc exec [--on m] --timeout 120 -- sh -c <script>` (argv, so a fish login shell never parses it; Herdr's `exec()` stops at 30 s).
- **`mods/agent-deck-overview` (links):** `resume.js` (node-tested in `resume.test.mjs`): `SESSION_OF` (the pid whose session file it reads, that pid's or else a direct child's, the file, then `found` when its transcript exists), `sessionFrom(out)`, `resumeLink`; `link.svg` (Lucide). `agent-deck-agents` has copies of all three files for its cards' Copy link, plus `title.js` (`liveTitle(title, program)`, node-tested in `title.test.mjs`).
- **`mods/agent-deck-agents` (footer):** the History icon runs `mod.open {name: "agent-deck-history"}`.
- **`resume-link/`:** `agent_deck_resume.py` (Python 3, standard library; every outside call goes through one `run(argv, timeout)`, so `test_agent_deck_resume.py` drives it with a fake) and `install.sh` (`osacompile` an AppleScript `open location` handler, copy the script into `Contents/Resources`, add `CFBundleURLTypes` for `herdr-resume`, `LSUIElement`, ad-hoc `codesign`, `lsregister -f`).
- **`mods/agent-deck-labels`:** new, `mod.json` overlay `{ kind: "dialog", width: 560 }`.
  - It edits `props().terminal`, else `focused().terminal`; the name comes from `agents()` / `panes()` titles, else the program.
  - `edit.js` (no imports, so node can test it): `customLabels` (the starting rows), `knownValues(terminals, key, cache)`, `remember(cache, value, max = 50)`, `suggest(values, typed, limit = 8)` and `labelArgs(before, rows)` (the `hc label` arguments; refuses keys with spaces or `=` or a leading `-`, never touches `where` / `herdr.*`). Tests: `edit.test.mjs`.
  - It runs `hc label <address> …` on Save, nothing else.
  - `tag.svg`: Lucide's `tag` icon (ISC), also used by the Overview and the tab bar.
- **`layouts/agent-deck-preview.png`:** the Settings picture (root `"preview"`): the Overview's Agents tab, 480×300 (1.6:1, the shape Settings cards show).
- **`mods/agent-deck-agents`:** modified from the shipped `agents` mod. It adds:
  - `label()`, which prefers the agent's own title (its chat name) when it is not a path, prompt or the program name;
  - the card row;
  - `HoverCard` (from `gpui-base`) around the rail row;
  - the footer button `run("mod.open", { name: "agent-deck-overview" })`;
  - the Waiting state: `waits(status, terminal)` (`idle` and `terminal.records.bg.state === "working"`), applied in `render` with `terminals()` indexed by address and in `kidStatus`; `hold` / `rank` treat `waiting` like `idle`.
- **`mods/agent-deck-spaces`:** modified from the shipped `spaces` mod. It adds:
  - helpers `chatName`, `counts`, `shellsIn` (terminal panes with no status that aren't agents), `busy` (not a shell) and `progIcon`;
  - the machine header badges;
  - `HoverCard` around the compact row.
  - It reads `agents()`, `panes()`, `terminals()` and `hc machine ls --json`.
- **`mods/agent-deck-overview`:** new, `mod.json` overlay `{ kind: "dialog", width: 0.85, height: 0.85 }`.
  - It reads `agents()`, `spaces()` (tab `working_since` / `changed_at` for time in state), `terminals()` (`foreground.argv`, `foreground.cwd`, `labels.where`, `created_ms`, `report.msg`) and `panes()`.
  - It runs `hc machine ls --json` and `hc read <address>`.
  - It uses `nextCommand()` for the tab commands, and `InputState` / `Input` (from `gpui-base`) for the filter.
  - It applies the same `waits` rule to `agents()` and puts waiting agents in the Working lane.
  - `usage.js` (no imports, so node can test it): `USAGE_SCRIPT`, one POSIX `sh` script that prints `cpu=N mem=N disk=N`; `usageArgs(machine)`, the `hc` arguments (`exec [--on m] --timeout 20 -- sh -c <script>`); `parseUsage(stdout)`, the last such line as `{cpu, mem, disk}` (0..100, `null` for an empty field), or `null`. Tests: `usage.test.mjs`, run with `node --test usage.test.mjs` in the mod folder.
    - Linux: CPU busy share over 1 s from two `/proc/stat` reads; memory `(MemTotal − MemAvailable) / MemTotal`.
    - macOS: CPU `100 − idle` from the second sample of `top -l 2 -n 0 -s 1`; memory (active + wired + compressor pages) × page size / `hw.memsize`.
    - Disk: `df -P "$HOME"`'s capacity: the Data volume on macOS, `/` on a typical VM.
  - `machineNames()`: this computer, then every machine with a space or in `hc machine ls`, sorted; used by `render` and by `measure`.
  - `labels.js` (no imports): `customLabels` (chips), `taskOf`, `taskMatches(labels, filter)` (`null` all, `NO_TASK` none), `taskCounts(terminals)`. Tests: `labels.test.mjs`. The task menu is a `Popup` (from `gpui-base`) whose content is filled only while it's open. Tag icons call `openOverlay` for `agent-deck-labels`.
- **`keys.json`:** `global` → `cmd-shift-o`.
- **Shipped mods used as-is:** `workspace-chrome` (also its SVG icons: server, monitor, layers, x, plus, chevron-down/right, pin, pin-off, branch, spinner, clock, check, search), `files`, `changes`, `workspace-status`.

Runs programs and reads files:
- `hc` (read-only: `machine ls`, `read`).
- `hc exec` with the Usage script, only when `Usage` is pressed: it reads `/proc/stat`, `/proc/meminfo` and `df` on Linux, `top`, `vm_stat`, `sysctl` and `df` on macOS, and changes nothing.
- `agent-deck-spaces` keeps Herdr's own git tail from the shipped `spaces` mod. It runs `git` (`rev-parse`, `status`) in each space's folder, on that space's machine for remote spaces, and `watchFolder`s local repos' git folders to refresh on commits.
- `hc label <address> …` when Save is pressed in the label editor: the only write.
- History: `hc exec` with `SCAN` on each reachable machine while the dialog is open (reads transcripts, writes only `~/.cache/agent-deck-history/index.tsv`); `SESSIONS` and `NEAREST` when a row is opened.
- Copy link: `hc get` (when `terminals()` lacks the pid) and `hc exec` with `SESSION_OF` on the card's machine.
- No network.

## Watch out

- **Agent titles:** the chat name is the terminal title. Filter out titles that are a path (`~/…`, `/…`), a shell prompt (contains `@`) or the program name, or rows read `root@host:~`.
- **`hidden`** means the terminal is alive in the core but in no pane. Compute it from `panes()` terminals, not from `terminals()` alone.
- **Agent status:** use `agents()` status on Overview cards; the core's `status` keeps `done` after you've looked, while `agents()` turns it `idle`.
- **Agent previews:** an agent's screen is its own interface chrome. Show `report.msg`, not `hc read`.
- **Commands:** `foreground.argv[0]` can be a full path (`/Library/Developer/CommandLineTools/usr/bin/make`). Show its last path part.
- **Wrapped rows:** use `items_start()`, or cards of different heights drift.
- **`/private` prefix:** macOS reports `/private/tmp/…`. Strip `/private` before `/tmp` and `/var`, and show home as `~`.
- **Alerts:** Herdr draws its agent alerts with the shipped `toast` mod: the program name and status as the title, `space / tab` below it. Edits to a shipped mod are reverted at the next start, so the chat name reaches the alert through the tab name (`tab.rename {id, name}`). Remember which names this mod set (`localStorage`), and only rename tabs that are unnamed (`named` false) or still carry the name it set, so a person's name is never overwritten.
- **IDs:** a `HoverCard` needs a stable id per row, and its trigger and content are slots, not children.
- **`close`:** don't name a View method `close`: Herdr calls a View's `close(cx)` itself when an overlay goes.
- **Divider:** Herdr drags anywhere in a row/column's `gap`, but its resize cursor shows only part of the time there (Herdr 0.1.11, macOS). A divider as wide as the gap looks heavy, so this layout keeps a thin line. Mods can't draw in the gap, so the line is the only grab cue. Drop the Agents mod's own top border, or it doubles the line.
- **Base:** `agent-deck-spaces` is based on the shipped `spaces` of Herdr 0.1.11 (drag-reorder with a drop line and a same-machine guard). When a later Herdr changes that mod, re-apply the `agent-deck:` changes to the new one.
- **Wrapped cards:** `flex_1().min_w(N)` in a `flex_wrap()` row gives full-width cards that pair up once the lane is wide enough.
- **Usage script:** pass it as argv (`hc exec … -- sh -c <script>`). `hc exec` runs argv with no shell, so the script never reaches the machine's login shell (fish would not parse it).
- **No detaching under `hc exec`:** everything it started ends with it, `setsid nohup … &` included. Run what must outlive the call in an `hc` terminal instead.
- **Conditional children:** `.child()` takes no `null`; add an optional row with `.when(cond, el => el.child(…))`.
- **No imports across mods:** a mod can only import files in its own folder (`../other-mod/x.js` is refused). Shared rules are copied, with a note in each copy. Assets are different: `svg("mods/other-mod/icon.svg")` works from any mod.
- **`exec()` stops at 30 s:** the first scan of a machine with thousands of transcripts can take longer. Use `hc exec --timeout N` (up to 600), and make long work resumable: the scan appends each row to its index as it reads it, so a run cut short keeps its progress.
- **Instructions are in every transcript:** Claude Code stores the injected CLAUDE.md / rules as an `"type":"attachment"` line and repeats the whole request in `"type":"api-request-blob"` lines. A plain grep matches every session for any word in your rules; search user and assistant lines only.
- **Filter before you match:** blob lines are huge (1,133 of them in one 987 MB transcript). `grep text | filter` reads every matching blob (21 s for that file); `grep -v blobs | grep -m1 text` takes 2 s.
- **Mod commands carry text:** `herdr-app do "<mod>.search login"` reaches `nextCommand()` as `search login`.
- **Most transcripts are headless:** on a box that runs automated reviews, almost all of `~/.claude/projects` is Agent SDK runs (`"entrypoint":"sdk-…"`; 1,659 of 1,684 on one VM here). Leave them out, or History is noise.
- **A session id needs the pid:** Herdr doesn't know a terminal's Claude Code session. `~/.claude/sessions/<pid>.json` maps the running pid to it; a crash or `kill -9` can leave a file behind, so trust a pid only when a live terminal runs it. A local terminal's program is Herdr's shell wrapper (`fish -lic 'command claude; exec fish'`), so its pid is claude's parent's: look one level down (`SESSION_OF`) or up (`SESSIONS`).
- **AppleScript:** `handler` is a reserved word (`osacompile` fails with "Access not allowed"); name the variable otherwise. Apps macOS starts get a minimal `PATH`: add `~/.local/bin` and Homebrew in the shell line.
- **Mouse handlers:** `on_mouse_down` / `on_mouse_up` take the button first (`"left"`); without it the mod fails when that element first renders.
- **`herdr-app check` renders the first frame only:** a dialog or a branch that shows only after a click is not checked. Open it in the window (a command helps) and look at `herdr-app status` and a `shot`.
- **Clicks inside a card:** GPUI sends a click to every handler under the pointer. A button inside a clickable card calls `cx.stop_propagation()`.
- **Tabs base:** `agent-deck-tabs` is a clone of the shipped `tabs` of Herdr 0.1.13. Clones are never updated; when a later Herdr changes `tabs`, clone it again and re-add `labelButton`.
- **Status colors as warnings:** `done` is blue in some themes; use `working` (amber) for "getting full", `blocked` for "full".

## Done when

- Two Claude Code agents in one space show their chat names under the space row, with status counts on it.
- A blocked agent turns its space count red, lands in the Needs you lane and has a red card border in the Overview.
- On an idle agent `t5`, `hc report state=working:id=bg --terminal t5` moves it to Waiting in the sidebar and into the Overview's Working lane (`waiting`); `state=clear:id=bg` moves it back to Idle. On an unseen done agent, the same report leaves it in Done.
- `make test` running in a shell shows `1 shell · 1 busy` on the space and a `make test` card marked `running` with its last 2 output lines under Terminals.
- With the sidebar dragged under 160px, resting on an agent number shows its card to the right within about ¼ second; clicking it focuses the agent.
- A terminal started with `hc run --bg` outside Herdr (in no space) shows on its machine lane as `hidden`; clicking it peeks.
- Clicking `+` on the devbox lane under Terminals closes the Overview and opens a new space on devbox with a shell in `/root`.
- An unnamed tab with a Claude Code agent whose chat is called `Fix login` is called `Fix login` within 3 seconds, and when that agent needs you the alert's second line reads `<space> / Fix login`. A tab you renamed yourself keeps your name.
- Clicking `Agents` hides Spaces and gives Agents the height; clicking it again brings Spaces back at the size it had.
- Typing `devbox done` in the Overview leaves only finished agents on devbox, and the tab reads `Agents 1/9`; `Esc` brings the rest back.
- `⌘⇧O` opens the Overview and pressing it again closes it; with a remote machine added, its lane and strip chip show its `hc` version.
- Pressing `Usage` on the Terminals tab fills a `CPU · MEM · Disk` row under every connected machine's lane within about 3 seconds, matching `free` / `df` there; a disconnected machine's row says why.
- `node --test usage.test.mjs` passes in `mods/agent-deck-overview`.
- Clicking the tab bar's tag button on a shell opens the editor for that shell; typing `rev` in Role offers `reviewer` if any terminal has it; Save adds `role=reviewer`, and the shell's card in the Overview shows a `role reviewer` chip.
- Emptying Task and saving removes `task` from `hc get <t>`; Cancel writes nothing.
- With two agents on `task=PROJ-1` and one on `PROJ-2`, the task menu lists `PROJ-1 2`, `PROJ-2 1`; picking `PROJ-1` leaves those two on both tabs and the tab reads `Agents 2/N`.
- Clicking an agent card's tag icon opens the editor and does not go to the agent.
- `node --test edit.test.mjs` passes in `mods/agent-deck-labels`, `node --test labels.test.mjs usage.test.mjs` in `mods/agent-deck-overview`, `node --test labels.test.mjs` in `mods/agent-deck-pane`, `node --test name.test.mjs` in `mods/agent-deck-tabs`, and `node --test title.test.mjs resume.test.mjs` in `mods/agent-deck-agents`.
- After `hc label <t> role=lead task=PROJ-1`, that terminal's pane header shows `role lead` and `task PROJ-1` chips at its right end; `hc label <t> role= task=` removes them.
- The search icon in the Agents footer opens History; with an empty box it lists recent past sessions from every connected machine, none of them running now.
- Typing a word from an old session's title on devbox lists it with `devbox · ~/…`; Enter opens a new tab on devbox running `claude --resume <id>` in that folder.
- Searching for a session that is running shows it marked `running`; opening it brings its terminal to the front instead of starting a second copy.
- Pasting `herdr-resume://devbox/<id>` lists only that session.
- With `Full text` on, typing `login` lists the sessions whose conversation mentions it, each with a line like `…fix the Login bug in auth.py…`; a word that's only in your CLAUDE.md finds nothing.
- Picking a task in the Overview, closing it and opening it again keeps that task; the tab reads `Agents N/M`.
- A local Claude Code session renamed with `/rename Fix login` is called `Fix login` in the tab bar and on its Agents card; reopening it from History while it runs brings it to the front.
- `«` in the Agents footer narrows the sidebar to the rail: spaces are colored letter avatars, agents their program icons, the focused agent's row highlighted; `»` brings it back.
- `Copy link` on a Claude Code card (Overview, or resting on an Agents card) puts `herdr-resume://<machine|local>/<id>` on the clipboard; with the handler installed, `open '<that link>'` in a shell brings that session to the front.
- `node --test history.test.mjs` passes in `mods/agent-deck-history`, `node --test resume.test.mjs` in `mods/agent-deck-overview`, and `python3 -m unittest test_agent_deck_resume` in `resume-link/`.
- `herdr-app check` passes for all six mods.
