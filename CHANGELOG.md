# Changelog

What changed in `agent-deck`, newest first. Dates are when it landed on `main`.

## 2026-11-06

### Added
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
