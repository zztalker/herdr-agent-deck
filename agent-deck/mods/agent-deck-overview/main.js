// agent-deck: every agent on every machine, in a lane per state, grouped by machine;
// a Terminals tab shows every live terminal, a lane per machine, with what runs and its last lines.
// Opened with `mod.open:agent-deck-overview` (again: closes it); a card goes to its agent.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, agents, terminals, panes, run, hc, theme, props, closeOverlay, settings, nextCommand } from "herdr";

const ORDER = ["blocked", "done", "working", "idle"];
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const WORD = { blocked: "needs you", done: "done", working: "working", idle: "idle" };
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
// The agent's own title (Claude's chat name) when it says something, else its program.
function chatName(a) {
  const live = clean(a.title);
  const telling = live && live !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== a.program?.key;
  return telling ? live : a.program?.name || a.address;
}
function counts(list) {
  const n = {};
  for (const a of list) n[a.status] = (n[a.status] ?? 0) + 1;
  return ORDER.filter((k) => n[k]).map((k) => [k, n[k]]);
}
function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}
const short = (cwd) => (cwd ? cwd.replace(/^\/private(?=\/(tmp|var)\/)/, "").replace(/^\/(Users|home)\/[^/]+/, "~").replace(/^\/root(?=\/|$)/, "~") : "");
const PREVIEW = 2; // last non-empty screen lines on a terminal card
const machineOf = (address) => (address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null);
// The filter: every word typed must appear somewhere in what a card says.
const matches = (words, ...parts) => {
  const text = parts.flat().filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
};

export default class Overview extends View {
  init(_props, cx) {
    this.machines = [];
    this.tab = localStorage.getItem("tab") ?? "agents";
    this.preview = {}; // address -> its last lines
    this.query = "";
    this.input = InputState.new({ placeholder: "Filter: name, machine, space, command…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); cx.notify(); });
    this.input.focus();
    this.refresh(cx);
    this.read(cx);
    cx.timer.every(30000, (cx) => this.refresh(cx));
    cx.timer.every(8000, (cx) => this.read(cx));
    // `agent-deck-overview.agents` / `agent-deck-overview.terminals` pick the tab (keys can name them).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "agents" || c === "terminals") this.show(c, cx);
      }
    });
  }

  // The last lines of every live terminal, one at a time, while the Terminals tab shows.
  read(cx) {
    if (this.tab !== "terminals" || this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      const reading = terminals().filter((x) => x.state === "live" && !x.program?.agent);
      // Lines of terminals that are gone go too.
      this.preview = Object.fromEntries(reading.filter((x) => this.preview[x.address]).map((x) => [x.address, this.preview[x.address]]));
      for (const x of reading) {
        try {
          const r = await hc(["read", x.address]);
          if (r.code === 0) this.preview[x.address] = r.stdout.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim()).slice(-PREVIEW);
        } catch {}
      }
      this.reading = false;
      cx.notify();
    });
  }

  show(tab, cx) {
    this.tab = tab;
    localStorage.setItem("tab", tab);
    this.read(cx);
    cx.notify();
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
      } catch {}
      cx.notify();
    });
  }

  // Not `close`: Herdr calls a View's close(cx) itself when the overlay goes.
  dismiss() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  // A shell on machine `m` (null: this computer), in a new space there (its home).
  newTerminal(m) {
    run("space.new", { machine: m ?? "" });
    this.dismiss();
  }

  clearFilter(cx) {
    this.query = "";
    this.input.set_value("");
    this.input.focus();
    cx.notify();
  }

  pills(t, list) {
    return counts(list).map(([k, n]) => div().flex_none().px(6).py(1).rounded(4).bg(t[k] + "26").text_size(11).text_color(t[k] ?? t.dim).child(`${n} ${WORD[k]}`));
  }

  card(t, a, tab, now) {
    const since = a.status === "working" ? tab?.working_since : tab?.changed_at;
    const color = t[a.status] ?? t.dim;
    return v_flex()
      .id(`ov-${a.address}`)
      .flex_1()
      .min_w(240)
      .px(10)
      .py(8)
      .gap(5)
      .rounded(8)
      .bg(a.focused ? t.selected : t.surface)
      .border(1)
      .border_color(a.status === "blocked" ? t.blocked : a.focused ? t.accent : t.border)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        run("agent.focus", { terminal: a.address });
        this.dismiss();
      })
      .child(h_flex().gap(8).items_center().min_w(0)
        .when(Boolean(a.program?.icon), (el) => el.child(icon(a.program, 16, t.foreground)))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(a.status === "idle" ? t.muted : t.foreground).child(chatName(a)))
        .child(div().flex_none().size(8).rounded(4).bg(color)))
      .child(h_flex().gap(6).items_center().min_w(0).text_size(11).text_color(t.dim)
        .child(div().flex_none().text_color(color).child(WORD[a.status]))
        .when(Boolean(since), (el) => el.child(div().flex_none().child(`· ${duration(now - since)}`)))
        .child(div().flex_1().min_w(0).truncate().text_right().child(`${a.space_name} · tab ${a.tab_name || a.tab_index}`)));
  }

  term(t, x, shown, title, status, now) {
    const g = x.program;
    const fg = x.foreground;
    // A command reads as typed: `make test`, not /usr/bin/make test.
    const running = g?.agent || g?.shell ? null : (fg?.argv?.length ? [fg.argv[0].split("/").pop(), ...fg.argv.slice(1)].join(" ") : g?.name);
    // An agent's state as the Agents tab has it ("done" turns "idle" once seen).
    const state = g?.agent ? status ?? x.status ?? "idle" : running ? "running" : "idle";
    const color = g?.agent ? t[state] ?? t.dim : running ? t.accent : t.dim;
    const name = g?.agent ? chatName({ title: title ?? x.title, program: g, address: x.address }) : running ?? `${g?.name ?? "shell"}`;
    const where = shown ? x.labels?.where ?? "" : "hidden";
    // An agent's screen is its own chrome; what it last reported says more.
    const lines = g?.agent ? (x.report?.msg ? [x.report.msg] : []) : this.preview[x.address] ?? [];
    return v_flex()
      .id(`ov-t-${x.address}`)
      .flex_1()
      .min_w(260)
      .px(10)
      .py(8)
      .gap(5)
      .rounded(8)
      .bg(t.surface)
      .border(1)
      .border_color(state === "blocked" ? t.blocked : running ? t.accent + "80" : t.border)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .tooltip(shown ? "Go to it" : "Peek (it is in no space)")
      .on_click(() => {
        run(shown ? "pane.focus" : "terminal.peek", { terminal: x.address });
        this.dismiss();
      })
      .child(h_flex().gap(8).items_center().min_w(0)
        .child(g?.icon ? icon(g, 15, t.foreground) : div().flex_none().text_size(11).text_color(t.dim).child(">_"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(state === "idle" ? t.muted : t.foreground).child(name))
        .child(div().flex_none().text_size(11).text_color(color).child(WORD[state] ?? state)))
      .child(h_flex().gap(6).items_center().min_w(0).text_size(11).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(short(fg?.cwd ?? x.cwd)))
        .child(div().flex_none().text_color(shown ? t.dim : t.done).child(where))
        .when(Boolean(x.created_ms), (el) => el.child(div().flex_none().child(`· ${duration(now - x.created_ms)}`))))
      .when(lines.length > 0, (el) => el.child(v_flex().px(6).py(4).rounded(4).bg(t.chrome).font_family(settings()?.font_family ?? "monospace").text_size(10.5).text_color(t.dim)
        .children(lines.map((l, i) => div().id(`ov-tl-${x.address}-${i}`).truncate().child(l)))));
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const all = agents();
    const sp = spaces();
    const tabs = new Map(sp.flatMap((s) => s.tabs).map((x) => [x.id, x]));
    const inPanes = new Set(panes().map((p) => p.terminal).filter(Boolean));
    const live = terminals().filter((x) => x.state === "live");
    const names = [null, ...[...new Set([...sp.map((s) => s.machine).filter(Boolean), ...this.machines.map((m) => m.name)])].sort()];

    const spaceOf = new Map(sp.map((s) => [s.id, s]));
    const machineOfAgent = (a) => spaceOf.get(a.space)?.machine ?? null;
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const shownAgents = all.filter((a) => matches(words, chatName(a), a.program?.name, WORD[a.status], a.space_name, a.tab_name, machineOfAgent(a) ?? "this computer local"));

    // A strip of machines: state, hc version, terminals.
    const strip = h_flex().id("ov-machines").flex_none().flex_wrap().gap(8).px(16).py(8).border_b(1).border_color(t.border)
      .children(names.map((m) => {
        const machine = this.machines.find((k) => k.name === m);
        const connected = !m || machine?.state === "connected";
        const terms = live.filter((x) => machineOf(x.address) === m);
        const hidden = terms.filter((x) => !inPanes.has(x.address)).length;
        const n = all.filter((a) => machineOfAgent(a) === m).length;
        return h_flex().id(`ov-m-${m ?? "local"}`).gap(6).items_center().px(8).py(3).rounded(6).bg(t.surface).text_size(11).text_color(t.dim)
          .tooltip(`${connected ? "connected" : (machine?.state ?? "asleep").replace(/_/g, " ")}${machine?.version ? ` · hc ${machine.version}` : ""} · ${terms.length} terminals${hidden ? `, ${hidden} hidden` : ""}`)
          .child(div().size(7).rounded(4).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(div().text_color(t.foreground).child(m ?? "This computer"))
          .child(div().child(`${n} agent${n === 1 ? "" : "s"} · ${terms.length} terms`));
      }));

    // A lane per state, in this order; inside, agents grouped by machine.
    const LANES = ["working", "blocked", "done", "idle"];
    const lane = (k) => {
      const list = shownAgents.filter((a) => a.status === k);
      const groups = names.map((m) => [m, list.filter((a) => machineOfAgent(a) === m).sort((x, y) => y.seq - x.seq)]).filter(([, g]) => g.length);
      // An empty lane keeps a narrow column; the others share the rest.
      return v_flex().id(`ov-lane-${k}`).when(list.length > 0, (el) => el.flex_1().min_w(0)).when(list.length === 0, (el) => el.w(150).flex_none()).min_h(0).rounded(10).bg(t.chrome).border(1).border_color(t.border)
        .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(2).border_color(t[k] ?? t.border)
          .child(div().size(8).rounded(4).flex_none().bg(t[k] ?? t.dim))
          .child(div().font_semibold().text_color(t.foreground).child(k === "blocked" ? "Needs you" : WORD[k][0].toUpperCase() + WORD[k].slice(1)))
          .child(div().text_size(12).text_color(t.dim).child(String(list.length))))
        .child(v_flex().id(`ov-lane-body-${k}`).flex_1().min_h(0).p(8).gap(10).overflow_y_scrollbar()
          .when(list.length === 0, (el) => el.child(div().p(4).text_size(12).text_color(t.dim).child(words.length ? "No match" : "None")))
          .children(groups.map(([m, g]) => v_flex().id(`ov-${k}-${m ?? "local"}`).gap(6).flex_none()
            .child(h_flex().gap(6).items_center().px(2).text_size(11).text_color(t.dim)
              .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(12).flex_none())
              .child(div().flex_1().truncate().child(m ?? "This computer"))
              .child(div().child(String(g.length))))
            // Several cards to a line when the lane is wide enough.
            .child(h_flex().flex_wrap().items_start().gap(6).children(g.map((a) => this.card(t, a, tabs.get(a.tab), now)))))));
    };

    // Terminals: a lane per machine; shown ones first, busy before idle, hidden last.
    const statusOf = new Map(all.map((a) => [a.address, a.status]));
    const titles = new Map(panes().filter((p) => p.terminal).map((p) => [p.terminal, p.title]));
    const shownTerms = live.filter((x) => matches(words, x.address, x.program?.name, x.foreground?.argv?.join(" "), x.title, titles.get(x.address), x.cwd, x.foreground?.cwd, x.labels?.where, inPanes.has(x.address) ? "" : "hidden", x.report?.msg, this.preview[x.address], machineOf(x.address) ?? "this computer local"));
    const termLane = (m) => {
      const machine = this.machines.find((k) => k.name === m);
      const connected = !m || machine?.state === "connected";
      const rank = (x) => (inPanes.has(x.address) ? 0 : 4) + (x.program?.agent ? 1 : x.program?.shell ? 2 : 0);
      const list = shownTerms.filter((x) => machineOf(x.address) === m).sort((a, b) => rank(a) - rank(b) || (b.created_ms ?? 0) - (a.created_ms ?? 0));
      const busyN = list.filter((x) => !x.program?.agent && !x.program?.shell).length;
      const hidden = list.filter((x) => !inPanes.has(x.address)).length;
      return v_flex().id(`ov-tlane-${m ?? "local"}`).flex_1().min_w(0).min_h(0).rounded(10).bg(t.chrome).border(1).border_color(t.border)
        .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(2).border_color(connected ? t.ansi2 : t.border)
          .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none().text_color(t.muted))
          .child(div().flex_shrink_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(m ?? "This computer"))
          .child(div().flex_none().text_size(11).text_color(t.dim).child([`${list.length}`, busyN && `${busyN} running`, hidden && `${hidden} hidden`].filter(Boolean).join(" · ")))
          .child(div().flex_1())
          .when(connected, (el) => el.child(div().id(`ov-tnew-${m ?? "local"}`).flex_none().p(3).rounded(4).text_color(t.dim).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground))
            .tooltip(`New space on ${m ?? "this computer"}`)
            .on_click(() => this.newTerminal(m))
            .child(svg("mods/workspace-chrome/plus.svg").size(13)))))
        .child(v_flex().id(`ov-tlane-body-${m ?? "local"}`).flex_1().min_h(0).p(8).overflow_y_scrollbar()
          .when(list.length === 0, (el) => el.child(div().p(4).text_size(12).text_color(t.dim).child(connected ? "No terminals" : (machine?.state ?? "asleep").replace(/_/g, " "))))
          .child(h_flex().flex_wrap().items_start().gap(6).children(list.map((x) => this.term(t, x, inPanes.has(x.address), titles.get(x.address), statusOf.get(x.address), now)))));
    };
    const tabBtn = (id, text) => div().id(`ov-tab-${id}`).px(10).py(3).rounded(6).text_size(12).cursor_pointer()
      .when(this.tab === id, (el) => el.bg(t.selected).text_color(t.foreground))
      .when(this.tab !== id, (el) => el.text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .on_click((_e, cx) => this.show(id, cx))
      .child(text);
    const onTerms = this.tab === "terminals";

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.background ?? t.chrome)
      // Esc clears the filter first, then closes.
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        if (this.query) this.clearFilter(cx);
        else this.dismiss();
        cx.stop_propagation();
      })
      .child(h_flex().h(44).flex_none().px(16).gap(10).items_center().border_b(1).border_color(t.border)
        .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Overview"))
        .child(h_flex().gap(2).p(2).rounded(8).bg(t.chrome)
          .child(tabBtn("agents", words.length ? `Agents ${shownAgents.length}/${all.length}` : `Agents ${all.length}`))
          .child(tabBtn("terminals", words.length ? `Terminals ${shownTerms.length}/${live.length}` : `Terminals ${live.length}`)))
        .child(div().text_size(12).text_color(t.dim).child(`${names.length} machine${names.length === 1 ? "" : "s"}`))
        // agent-deck: type to hide the cards that don't match.
        .child(h_flex().id("ov-filter").flex_1().max_w(360).h(28).px(8).gap(6).items_center().rounded(7).border(1).border_color(words.length ? t.accent : t.border).bg(t.chrome)
          .child(svg("mods/workspace-chrome/search.svg").size(13).flex_none().text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12).text_color(t.foreground))
          .when(words.length > 0, (el) => el.child(div().id("ov-filter-clear").flex_none().text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
            .tooltip("Clear (Esc)")
            .on_click((_e, cx) => this.clearFilter(cx))
            .child(svg("mods/workspace-chrome/x.svg").size(12)))))
        .child(div().flex_1())
        .when(!onTerms, (el) => el.children(this.pills(t, shownAgents)))
        .child(div().id("ov-close").p(4).rounded(4).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.dismiss())
          .tooltip("Close (Esc)")
          .child(svg("mods/workspace-chrome/x.svg").size(14))))
      .child(strip)
      .child(h_flex().id("ov-body").flex_1().min_h(0).p(12).gap(10).items_stretch().children(onTerms ? names.map(termLane) : LANES.map(lane)));
  }
}
