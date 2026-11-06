# Changelog

What changed in `agent-deck`, newest first. Dates are when it landed on `main`.

## Unreleased

### Added
- **Usage on the Overview's Terminals tab.** A `Usage` button in the title row measures every machine at once and shows `CPU · MEM · Disk` in percent under each machine's lane header: amber from 75%, red from 90%. A machine that is not connected, or does not answer, shows why instead. It measures only when pressed, about a second per machine, all in parallel.
- `agent-deck-overview.usage` command: switches to the Terminals tab and measures (keys can name it).
- `mods/agent-deck-overview/usage.js` (the measuring script and its parser) with tests in `usage.test.mjs` (`node --test usage.test.mjs`).

### Changed
- The Overview now also runs `hc exec [--on <machine>] -- sh -c <script>` when Usage is pressed. The script only reads (`/proc/stat`, `/proc/meminfo`, `df` on Linux; `top`, `vm_stat`, `sysctl`, `df` on macOS).

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
