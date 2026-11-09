// Modified from Herdr's shipped `agents` mod (Apache-2.0, herdr 0.1.11) for agent-deck;
// changes are marked `agent-deck:`.
// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { agents, hc, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout } from "herdr";
import { SESSION_OF, sessionFrom, resumeLink, machineOf } from "./resume.js";
import { liveTitle } from "./title.js";
import { labelBadge } from "./badge.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// agent-deck: Spaces rolls up into the line above Agents; clicking the Agents header unrolls it.
const spacesHidden = () => !!find(layout(), "spaces")?.hidden;
const toggleSpaces = () => run("layout.toggle", { id: "spaces" });

function lead(tab, all = panes()) {
  const mine = all.filter(p => p.tab === tab.id && p.terminal);
  return mine.find(p => p.program?.agent) ?? mine.find(p => p.focused) ?? mine[0];
}

function title(tab, l) {
  const live = liveTitle(l?.title, l?.program);
  return tab.name === l?.program?.name && live ? live : tab.name;
}
// agent-deck: a tab with one agent takes the agent's chat name, so Herdr's
// alerts ("Claude Code needs you · space / tab") say which chat. Only tabs
// nobody named, or that this named; a name someone gave a tab stays.
const NAME_TABS = true;
const TAB_NAME_MAX = 48;
function chatTitle(a) {
  const live = liveTitle(a.title, a.program);
  return live && !/^\d+$/.test(live) ? (live.length > TAB_NAME_MAX ? live.slice(0, TAB_NAME_MAX - 1) + "\u2026" : live) : null;
}

// agent-deck: "waiting" is an idle agent whose own hook still reports background work as
// a `bg` record (`hc report state=working:id=bg`, e.g. Claude Code's run_in_background
// shells). A done agent stays done until seen; then, still working in the background, it waits.
const RANK = { blocked: 5, done: 4, working: 3, waiting: 2, idle: 1 };
const waits = (s, k) => s === "idle" && bgRunning(k);
const bgRunning = (k) => k?.records?.bg?.state === "working";
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  const word = s === "error" ? "blocked" : s === "done" ? "idle" : s;
  return waits(word, k) ? "waiting" : word; // agent-deck: by the word it shows
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 5: "Needs you", 4: "Done", 3: "Working", 2: "Waiting", 1: "Idle" };
const SECTION_STATUS = { 5: "blocked", 4: "done", 3: "working", 2: "waiting" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    cx.timer.every(30000, (cx) => cx.notify());
    if (NAME_TABS) {
      this.named = JSON.parse(localStorage.getItem("namedTabs") ?? "{}"); // tab -> the name this gave it
      cx.timer.every(3000, () => this.nameTabs());
    }
  }

  // agent-deck: see NAME_TABS.
  nameTabs() {
    const byTab = {};
    for (const a of agents()) (byTab[a.tab] ??= []).push(a);
    const tabs = spaces().flatMap((s) => s.tabs);
    const named = {};
    for (const tab of tabs) {
      const mine = this.named[tab.id];
      const own = !tab.named || (mine != null && tab.name === mine);
      if (own && mine != null) named[tab.id] = mine;
      const list = byTab[tab.id] ?? [];
      const want = list.length === 1 ? chatTitle(list[0]) : null;
      if (!own || !want || tab.name === want) continue;
      run("tab.rename", { id: tab.id, name: want });
      named[tab.id] = want;
    }
    this.named = named;
    localStorage.setItem("namedTabs", JSON.stringify(named));
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  setPins(pins) {
    this.pins = pins;
    localStorage.setItem("pins", JSON.stringify(pins));
  }

  // Drops pins of agents that ended. Only for machines the list has heard from:
  // right after a start, or while a machine connects, its agents aren't listed yet.
  prunePins(all) {
    const machine = (addr) => (addr.includes("/") ? addr.split("/")[0] : "");
    const heard = new Set(all.map((k) => machine(k.address)));
    const live = new Set(all.filter((k) => k.state === "live").map((k) => k.address));
    const kept = this.pins.filter((p) => !heard.has(machine(p)) || live.has(p));
    if (kept.length !== this.pins.length) this.setPins(kept);
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    // agent-deck: a seen done agent with background work turns waiting, not idle.
    if (!same || !(cur.status === "idle" || cur.status === "waiting")) this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && (a.status === "idle" || a.status === "waiting");
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    // agent-deck: waiting spins slower, in its own color (theme "waiting", else muted).
    if (a.status === "waiting") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.waiting ?? t.muted ?? t.dim).spin(2400);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  // agent-deck: Copy link on a Claude Code card, as in the Overview: a herdr-resume:// link
  // to its session (resume.js). The id is read on click from the pid of the terminal's
  // program and ~/.claude/sessions/<pid>.json on its machine. The icon says how it went for 2 s.
  copyLink(address, cx) {
    if (this.linkState?.address === address && this.linkState.state === "busy") return;
    const mark = (state, cx) => { this.linkState = { address, state }; cx.notify(); };
    mark("busy", cx);
    cx.spawn(async (cx) => {
      let id = null;
      try {
        let pid = terminals().find((x) => x.address === address)?.foreground?.pid;
        if (!Number.isInteger(pid)) pid = JSON.parse((await hc(["get", address, "--json"])).stdout)?.foreground?.pid;
        const m = machineOf(address);
        if (Number.isInteger(pid)) {
          const r = await hc(["exec", ...(m ? ["--on", m] : []), "--timeout", "20", "--", "sh", "-c", SESSION_OF, "sh", String(pid)]);
          id = sessionFrom(r.stdout);
        }
        if (id) cx.write_to_clipboard(resumeLink(m, id));
      } catch {}
      const state = id ? "copied" : "failed";
      mark(state, cx);
      cx.timer.after(2000, (cx) => { if (this.linkState?.address === address && this.linkState.state === state) { this.linkState = null; cx.notify(); } });
    });
  }

  linkButton(t, address) {
    const st = this.linkState?.address === address ? this.linkState.state : null;
    return div().id(`ag-link-${address}`).flex_none().p(2).rounded(4).cursor_pointer()
      .text_color(st === "copied" ? t.ansi2 ?? t.foreground : st === "failed" ? t.blocked : t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(st === "copied" ? "Link copied" : st === "failed" ? "No session to link yet (send it a message first)" : "Copy a herdr-resume:// link to this session")
      .on_click((_e, cx) => { cx.stop_propagation(); this.copyLink(address, cx); })
      .child(svg("mods/agent-deck-agents/link.svg").size(12));
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    const all = terminals();
    // agent-deck: agents at rest with background work show as waiting.
    const byAddress = new Map(all.map((k) => [k.address, k]));
    let list = agents().map((a) => (waits(a.status, byAddress.get(a.address)) ? { ...a, status: "waiting" } : a));
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    this.prunePins(all);
    const pinned = this.pins.map((p) => list.find((a) => a.address === p)).filter(Boolean);
    const rest = list.filter((a) => !this.pins.includes(a.address));
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    const tabs = spaces().flatMap(s => s.tabs);
    // agent-deck: the agent's own title (Claude's chat name) wins over the tab's.
    const label = (a) => {
      const live = liveTitle(a.title, a.program);
      if (live) return live;
      const tab = tabs.find(tab => tab.id === a.tab);
      return tab ? title(tab, lead(tab)) : a.title || a.program?.name || "";
    };
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = [], wide = false) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      // agent-deck: on the rail, resting on a row shows its wide card beside it.
      if (collapsed && !wide) {
        const badge = labelBadge(byAddress.get(a.address)?.labels);
        return HoverCard.new(`ag-hover-${a.address}`).anchor("left_center").open_delay(250)
          .content(v_flex().w(300).p(6).rounded(10).bg(t.popover).border(1).border_color(t.border).shadow_lg()
            .child(row(a, i, this.tree(all, a.address), true))
            .children(this.tree(all, a.address).map((s) => this.subRow(t, s, shown, false))))
          .trigger(h_flex()
          .id(`ag-${a.address}`)
          // agent-deck: the rail cell follows herdr-app PR #286 (the program's icon and the
          // status mark, centered); the current session also gets an accent border.
          .h(30)
          .flex_none()
          .rounded(8)
          .items_center()
          .justify_center()
          .gap(3)
          .when(a.focused, (el) => el.bg(t.selected).border(1).border_color(t.accent))
          .when(!a.focused, (el) => el.hover((s) => s.bg(t.hover)))
          .cursor_pointer()
          .on_click(() => run("pane.focus", { pane: a.pane }))
          // agent-deck: a session with a task or role label shows their letters (badge.js) instead.
          .child(badge
            ? h_flex().h(18).min_w(22).px(3).flex_none().rounded(5).bg(badge.color).items_center().justify_center().text_size(10.5).font_bold().text_color("#ffffff").child(badge.text)
            : pic ?? div().w(16).flex_none().text_center().text_size(11).text_color(a.focused ? t.foreground : t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true))));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = this.pins.includes(a.address);
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          this.setPins(isPinned ? this.pins.filter((p) => p !== a.address) : [...this.pins, a.address]);
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      // agent-deck: the chat name leads; the space follows, dimmed.
      const name = full ? more || a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      // agent-deck: a two-line card: name, then host and space chips.
      const chip = (id, text) => div().id(id).flex_shrink_1().min_w(0).truncate().px(5).py(1).rounded(4)
        .bg(t.chrome).text_size(11).text_color(t.muted).child(text);
      return v_flex()
        .id(`ag-${a.address}`)
        .mb(4)
        .px(8)
        .py(7)
        .gap(5)
        .flex_none()
        .rounded(8)
        .bg(a.focused ? t.selected : t.surface)
        .border(1)
        .border_color(a.focused ? t.accent : t.border)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .child(h_flex().items_center().gap(9).min_w(0)
          .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
            .when(subs.length > 0, el => el.on_click((_e, cx) => {
              cx.stop_propagation();
              this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
              cx.notify();
            })).child(pic)))
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(idle ? t.muted : t.foreground).child(name))
          .when(subs.length > 0, el => el.child(fold(a, subs)))
          // agent-deck: Copy link (Claude Code only), on hover or while it says how it went.
          .when(a.program?.key === "claude" && (this.hovered === a.address || this.linkState?.address === a.address), el => el.child(this.linkButton(t, a.address)))
          .when(this.hovered === a.address, el => el.child(pin))
          .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
          .child(this.status(t, a, byPriority && !isPinned)))
        .child(h_flex().gap(4).min_w(0).pl(25)
          .child(chip(`host-${a.address}`, `@${machine ?? "local"}`))
          .when(Boolean(a.space_name), el => el.child(chip(`space-${a.address}`, a.space_name))));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      // agent-deck: the layout's divider above is the line (and the grab handle), so no top border.
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            // agent-deck: the header rolls Spaces up or down.
            .child(
              h_flex()
                .id("ag-spaces-fold")
                .flex_1()
                .gap(4)
                .items_center()
                .cursor_pointer()
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSpaces)
                .tooltip(spacesHidden() ? "Show Spaces" : "Roll up Spaces")
                .child(div().text_size(11.5).font_medium().child("Agents"))
                .child(svg(`mods/workspace-chrome/chevron-${spacesHidden() ? "right" : "down"}.svg`).size(12)),
            )
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "agent-deck-agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      // agent-deck: on the rail, the same toggle sits above the list.
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .id("ag-spaces-fold")
            .h(20)
            .flex_none()
            .justify_center()
            .items_center()
            .cursor_pointer()
            .text_color(t.dim)
            .hover((s) => s.text_color(t.foreground))
            .on_click(toggleSpaces)
            .tooltip(spacesHidden() ? "Show Spaces" : "Roll up Spaces")
            .child(svg(`mods/workspace-chrome/chevron-${spacesHidden() ? "right" : "down"}.svg`).size(12)),
        ),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 4 : 8).when(collapsed, (el) => el.pt(6).gap(2)).overflow_y_scrollbar().mode("always").children(rows))
      .child(
        h_flex()
          .h(28)
          .px(12)
          .items_center()
          .justify_between()
          .when(collapsed, (el) => el.flex_col().h(76).gap(8).justify_center().px(0))
          // agent-deck: the all-machines overview (cmd-shift-o; again closes it), and History:
          // search past Claude Code sessions on every machine.
          .child(
            h_flex()
              .gap(12)
              .items_center()
              .when(collapsed, (el) => el.flex_col().gap(8))
              .child(
                div()
                  .id("overview")
                  .text_color(t.dim)
                  .cursor_pointer()
                  .hover((s) => s.text_color(t.foreground))
                  .on_click(() => run("mod.open", { name: "agent-deck-overview" }))
                  .tooltip("Agents overview (⌘⇧O)")
                  .child(svg("mods/workspace-chrome/layers.svg").size(14)),
              )
              .child(
                div()
                  .id("history")
                  .text_color(t.dim)
                  .cursor_pointer()
                  .hover((s) => s.text_color(t.foreground))
                  .on_click(() => run("mod.open", { name: "agent-deck-history" }))
                  .tooltip("Search past sessions (History)")
                  .child(svg("mods/workspace-chrome/search.svg").size(14)),
              ),
          )
          // Herdr's rail control. agent-deck: on the wide sidebar too, as « (narrow) and » (back).
          .child(
            // agent-deck: a 26px button as in herdr-app PR #286, keeping the « / » marks.
            div()
              .id("collapse")
              .size(26)
              .flex()
              .flex_none()
              .items_center()
              .justify_center()
              .rounded(6)
              .text_size(13)
              .text_color(t.muted)
              .cursor_pointer()
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_click(toggleSidebar)
              .tooltip(collapsed ? "Widen the Agents column" : "Narrow the Agents column")
              .child(collapsed ? "»" : "«"),
          ),
      );
  }
}
