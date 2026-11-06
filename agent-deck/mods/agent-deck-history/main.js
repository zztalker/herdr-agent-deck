// agent-deck: search past Claude Code sessions on every machine and reopen one.
// Opened with `mod.open:agent-deck-history` (the search icon in the Agents footer).
// Empty box: Recent. Typing: every word in the title, folder or machine. A pasted
// herdr-resume:// link (or a bare session id) finds that session. ↑ / ↓ and Enter pick one;
// a click (or Enter) shows it if it runs, else reopens it with `claude --resume`.
// The approach follows Martin Krcho's Herdr setup (see history.js).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { machines, terminals, spaces, run, hc, theme, props, closeOverlay, settings, nextCommand } from "herdr";
import { SCAN, SESSIONS, NEAREST, FULLTEXT, parseScan, parseHits, snippet, parseLink, search, recent, shortPath, sessionPids, openPlan, resumeLink } from "./history.js";

const RECENT = 8;
const LIMIT = 50;
// Full text: the shortest text worth a grep, and the pause after typing before it runs.
const FULL_MIN = 3;
const FULL_WAIT = 400;

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
const where = (m) => m ?? "local";
// `hc exec` there (null: this computer), argv as given: the machine's login shell never parses it.
const onMachine = (m, argv, timeout = 120) => hc(["exec", ...(m ? ["--on", m] : []), "--timeout", String(timeout), "--", ...argv]);
const err = (r) => (r.stderr || r.stdout || `exit ${r.code}`).trim().split("\n").pop();

export default class History extends View {
  init(_props, cx) {
    this.query = "";
    this.sel = 0;
    this.hovered = null;
    this.copied = null;
    this.busy = null; // the row being opened
    this.data = new Map(); // machine ("" = this computer) -> { rows, live, loading, error }
    // Full text: grep the conversations too (remembered). Per machine: the text it ran for,
    // its hits (id -> raw matched text), loading, error.
    try { this.full = localStorage.getItem("full") === "1"; } catch { this.full = false; }
    this.ft = new Map();
    this.input = InputState.new({ placeholder: "Search past sessions, or paste a herdr-resume:// link" });
    this.input.on("change", (_e, cx) => {
      this.query = this.input.value();
      this.sel = 0;
      const q = this.query;
      cx.timer.after(FULL_WAIT, (cx) => { if (this.query === q) this.fullSearch(cx); });
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => { const r = this.shown()[this.sel]; if (r) this.open(r, cx); });
    this.input.focus();
    this.load(cx);
    // `agent-deck-history.full` toggles Full text; `agent-deck-history.search <text>` types a search.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "full") this.toggleFull(cx);
        else if (typeof c === "string" && c.startsWith("search ")) {
          this.input.set_value(c.slice(7));
          this.query = this.input.value();
          this.sel = 0;
          this.fullSearch(cx);
          cx.notify();
        }
      }
    });
  }

  // Every reachable machine at once; each fills in as it answers.
  load(cx) {
    for (const m of machines()) {
      if (m.layout === "unavailable") continue;
      const key = m.name ?? "";
      this.data.set(key, { rows: [], live: new Set(), loading: true, error: null });
      cx.spawn(async (cx) => {
        let next;
        try {
          const r = await onMachine(m.name, ["sh", "-c", SCAN]);
          next = r.code === 0 ? { ...parseScan(r.stdout, m.name), loading: false, error: null }
            : { rows: [], live: new Set(), loading: false, error: err(r) };
        } catch (e) {
          next = { rows: [], live: new Set(), loading: false, error: String(e?.message ?? e) };
        }
        this.data.set(key, next);
        this.fullSearch(cx, key); // the grep reads the index this scan keeps
        cx.notify();
      });
    }
  }

  // The text full-text search runs for now, or null (off, too short, or a pasted link).
  fullQuery() {
    const q = this.query.trim();
    return this.full && q.length >= FULL_MIN && !parseLink(q) ? q : null;
  }

  // Greps every scanned machine (or only `only`) for the current text, unless it already ran.
  fullSearch(cx, only) {
    const q = this.fullQuery();
    if (q === null) return;
    for (const [key, d] of this.data) {
      if ((only !== undefined && key !== only) || d.loading || d.error) continue;
      if (this.ft.get(key)?.query === q) continue;
      this.ft.set(key, { query: q, hits: new Map(), loading: true, error: null });
      cx.spawn(async (cx) => {
        let next;
        try {
          const r = await onMachine(key || null, ["sh", "-c", FULLTEXT, "sh", q]);
          next = r.code === 0 ? { query: q, hits: parseHits(r.stdout), loading: false, error: null }
            : { query: q, hits: new Map(), loading: false, error: err(r) };
        } catch (e) {
          next = { query: q, hits: new Map(), loading: false, error: String(e?.message ?? e) };
        }
        // A newer text took this machine's slot meanwhile: drop this answer.
        if (this.ft.get(key)?.query !== q) return;
        this.ft.set(key, next);
        cx.notify();
      });
    }
  }

  toggleFull(cx) {
    this.full = !this.full;
    try { localStorage.setItem("full", this.full ? "1" : "0"); } catch {}
    this.sel = 0;
    this.fullSearch(cx);
    this.input.focus();
    cx.notify();
  }

  // The raw matched text for a row in the current full-text results, or undefined.
  hitOf(r) {
    const q = this.fullQuery();
    const f = q !== null ? this.ft.get(r.machine ?? "") : null;
    return f?.query === q ? f.hits.get(r.id) : undefined;
  }

  rows() { return [...this.data.values()].flatMap((d) => d.rows); }
  isLive(r) { return this.data.get(r.machine ?? "")?.live.has(r.id) ?? false; }
  shown() {
    const q = this.query.trim();
    // Recent leaves out sessions running now (the Agents list shows them); a search keeps them.
    if (!q) return recent(this.rows().filter((r) => !this.isLive(r)), RECENT);
    // Full text: sessions whose conversation contains the text, newest first.
    if (this.fullQuery() !== null) return recent(this.rows().filter((r) => this.hitOf(r) !== undefined), LIMIT);
    return search(this.rows(), q, LIMIT);
  }

  dismiss() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  // The live terminal on the row's machine whose program is one of the session's pids.
  async runningTerminal(r) {
    const s = await onMachine(r.machine, ["sh", "-c", SESSIONS], 20);
    const pids = sessionPids(s.stdout, r.id);
    if (!pids.size) return null;
    const here = (a) => (r.machine ? a.startsWith(`${r.machine}/`) : !a.includes("/"));
    for (const x of terminals().filter((x) => x.state === "live" && here(x.address))) {
      let pid = x.foreground?.pid;
      if (!Number.isInteger(pid)) {
        try { pid = JSON.parse((await hc(["get", x.address, "--json"])).stdout)?.foreground?.pid; } catch {}
      }
      if (pids.has(pid)) return x.address;
    }
    return null;
  }

  open(r, cx) {
    if (this.busy) return;
    this.busy = r;
    this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const address = await this.runningTerminal(r);
        if (address) {
          run("agent.focus", { terminal: address });
        } else {
          const f = await onMachine(r.machine, ["sh", "-c", NEAREST, "sh", r.cwd], 20);
          const folder = f.code === 0 && f.stdout ? f.stdout : r.cwd;
          const plan = openPlan(spaces(), r, folder);
          run(plan.command, plan.args);
        }
        this.dismiss();
      } catch (e) {
        this.busy = null;
        this.error = `Could not open it: ${String(e?.message ?? e)}`;
        cx.notify();
      }
    });
  }

  copy(r, cx) {
    cx.write_to_clipboard(resumeLink(r));
    this.copied = r.id;
    cx.notify();
    cx.timer.after(1500, (cx) => { if (this.copied === r.id) { this.copied = null; cx.notify(); } });
  }

  row(t, r, i, now) {
    const live = this.isLive(r);
    const picked = i === this.sel;
    const key = `${r.machine ?? ""}/${r.id}`;
    const hover = this.hovered === key;
    // Full text: the matched line, shortened, with the match picked out.
    const raw = this.hitOf(r);
    const hit = raw === undefined ? null : snippet(raw, this.fullQuery());
    return h_flex().id(`hi-${key}`).flex_none().when(!hit, (el) => el.h(46)).when(Boolean(hit), (el) => el.py(6)).px(10).gap(10).items_center().rounded(8)
      .bg(picked ? t.selected : t.surface).border(1).border_color(picked ? t.accent : t.border)
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .tooltip(live ? "Running now: click to show it" : `Reopen with claude --resume in ${r.cwd}`)
      .on_hover((on, cx) => { if (on) this.hovered = key; else if (this.hovered === key) this.hovered = null; cx.notify(); })
      .on_click((_e, cx) => this.open(r, cx))
      .child(live
        ? div().flex_none().size(8).mx(3).rounded(4).bg(t.working)
        : svg("mods/workspace-chrome/clock.svg").size(14).flex_none().text_color(t.dim))
      .child(v_flex().flex_1().min_w(0)
        .child(div().min_w(0).truncate().text_size(13).text_color(t.foreground).child(r.title))
        .child(h_flex().min_w(0).gap(4).items_center().text_size(11).text_color(t.dim)
          .child(svg(`mods/workspace-chrome/${r.machine ? "server" : "monitor"}.svg`).size(11).flex_none())
          .child(div().min_w(0).truncate().child(`${where(r.machine)} · ${shortPath(r.cwd)}`)))
        .when(Boolean(hit), (el) => el.child(h_flex().id(`hi-hit-${key}`).mt(3).min_w(0).px(6).py(2).rounded(4).bg(t.chrome)
          .font_family(settings()?.font_family ?? "monospace").text_size(11).text_color(t.dim)
          .tooltip(`${hit.before}${hit.match}${hit.after}`)
          .child(div().flex_shrink_1().min_w(0).truncate().child(hit.before))
          .child(div().flex_none().font_semibold().text_color(t.accent).child(hit.match))
          .child(div().flex_1().min_w(0).truncate().child(hit.after)))))
      .when(live, (el) => el.child(div().flex_none().px(6).py(1).rounded(4).bg(t.working + "26").text_size(11).text_color(t.working).child("running")))
      .when(this.busy === r, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("Opening…")))
      .when(hover && this.busy !== r, (el) => el.child(div().id(`hi-link-${key}`).flex_none().px(6).py(2).rounded(4).text_size(11)
        .text_color(this.copied === r.id ? t.ansi2 ?? t.foreground : t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Copy a herdr-resume:// link to this session")
        .on_click((_e, cx) => { cx.stop_propagation(); this.copy(r, cx); })
        .child(this.copied === r.id ? "Copied" : "Copy link")))
      .when(!hover && !live && Boolean(r.at), (el) => el.child(div().flex_none().w(36).text_right().text_size(11).text_color(t.dim).child(duration(now - r.at))));
  }

  render(_cx) {
    const t = theme();
    const now = Date.now();
    const list = this.shown();
    if (this.sel >= list.length) this.sel = Math.max(0, list.length - 1);
    const q = this.query.trim();
    const link = parseLink(q);
    const states = [...this.data.entries()];
    const loading = states.filter(([, d]) => d.loading).map(([k]) => where(k || null));
    const failed = states.filter(([, d]) => d.error);
    const total = this.rows().length;
    const fq = this.fullQuery();
    const fullOn = this.full && Boolean(q) && !link;
    const ftLoading = fq === null ? [] : [...this.ft].filter(([, f]) => f.query === fq && f.loading).map(([k]) => where(k || null));
    const ftFailed = fq === null ? [] : [...this.ft].filter(([, f]) => f.query === fq && f.error);
    const empty = fullOn
      ? (fq === null ? `Type at least ${FULL_MIN} characters to search the conversations.`
        : loading.length || ftLoading.length ? "Searching the conversations…" : "No conversation contains this.")
      : link
      ? (link.machine && !this.data.has(link.machine) ? `${link.machine} is not connected, so this session can't be found.` : loading.length ? "Looking for this session…" : "No session with this id here.")
      : q ? (loading.length ? "Searching…" : "No past sessions match.") : (loading.length ? "Reading past sessions…" : "No past sessions yet.");
    return v_flex().id("hist").size_full().min_h(0).p(16).gap(10).bg(t.popover ?? t.surface)
      .on_key_down((e, cx) => {
        const n = this.shown().length;
        if (e.key === "down" || e.key === "up") {
          if (n) this.sel = e.key === "down" ? Math.min(n - 1, this.sel + 1) : Math.max(0, this.sel - 1);
          cx.notify();
          cx.stop_propagation();
        } else if (e.key === "escape") {
          this.dismiss();
          cx.stop_propagation();
        }
      })
      .child(h_flex().gap(8).items_center()
        .child(svg("mods/workspace-chrome/search.svg").size(15).flex_none().text_color(t.dim))
        .child(div().flex_none().text_size(15).font_semibold().text_color(t.foreground).child("History"))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim)
          .child(loading.length ? `Reading ${loading.join(", ")}…` : `${total} past sessions on ${states.length} machine${states.length === 1 ? "" : "s"}`)))
      .child(h_flex().id("hist-box").h(34).px(10).gap(8).items_center().rounded(8).border(1).border_color(q ? t.accent : t.border).bg(t.chrome)
        .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground))
        // Full text: search inside the conversations too (grep on each machine); remembered.
        .child(h_flex().id("hist-full").flex_none().gap(6).px(6).py(2).items_center().rounded(5).cursor_pointer()
          .text_size(12).text_color(this.full ? t.foreground : t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Search inside the conversations too: what was said, tool output and all")
          .on_click((_e, cx) => this.toggleFull(cx))
          .child(div().size(14).flex_none().flex().items_center().justify_center().rounded(3).border(1)
            .border_color(this.full ? t.accent : t.border).bg(this.full ? t.accent : t.chrome)
            .when(this.full, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(11).text_color(t.background ?? t.chrome))))
          .child("Full text")))
      .child(div().text_size(11).text_color(t.dim).child(
        !q ? "Recent"
        : link ? "This session"
        : fullOn ? (fq === null ? "Full text" : `Full text: ${list.length}${list.length === LIMIT ? "+" : ""} session${list.length === 1 ? "" : "s"}${ftLoading.length ? ` · searching ${ftLoading.join(", ")}…` : ""}`)
        : `Matches (${list.length}${list.length === LIMIT ? "+" : ""})`))
      .child(v_flex().id("hist-list").flex_1().min_h(0).gap(6).overflow_y_scrollbar()
        .when(list.length === 0, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child(empty)))
        .children(list.map((r, i) => this.row(t, r, i, now))))
      .when(Boolean(this.error), (el) => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .when(failed.length > 0, (el) => el.child(div().text_size(11).text_color(t.blocked)
        .child(failed.map(([k, d]) => `${where(k || null)}: ${d.error}`).join(" · "))))
      .when(ftFailed.length > 0, (el) => el.child(div().text_size(11).text_color(t.blocked)
        .child(ftFailed.map(([k, f]) => `full text on ${where(k || null)}: ${f.error}`).join(" · "))))
      .child(div().text_size(11).text_color(t.dim).child("↑ ↓ pick · Enter opens · Esc closes · running sessions show, others reopen with claude --resume"));
  }
}
