// harness-overview: a task board from a script of yours: what needs you, reviews, tasks in progress
// and blocked sessions, questions and answers; answer a card from here (Send now, or Save draft).
// Opened with `mod.open:harness-overview` (⌘⇧H, or the board icon beside the Overview icon).
//
// The script is named in <app folder>/data/harness-overview/config.json (outside layouts/ and
// mods/, so it never travels with them):
//   { "command": "python3 ~/path/to/board.py", "every": 120 }
// optional "on": a machine to run it on. Without it the page says so and runs nothing.
// It is run as `<command> json` every `every` seconds while the page is open and after each action;
// the buttons run `answer KEY [TEXT]`, `draft add KEY TEXT`, `draft del NID`, `send` and `ok SENT`.
// Each prints one JSON object. The format: README.md here; a working example: example/board.py.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { exec, run, agents, theme, props, closeOverlay, notify, appHome, readTextFile, checking, window as win } from "herdr";
import { CONFIG_PATH, parseConfig, shellArgs, plain, columns, matches } from "./board.js";

const SHORT = 260; // characters of a card's text before "more"
const QS_WORD = { waiting: "question sent", answered: "answered", "ok-sent": "OK sent", accepted: "accepted" };
const ago = (iso) => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  return !Number.isFinite(m) ? "" : m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 2880 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};
const opener = () => {
  const p = win()?.platform;
  return p === "windows" ? ["rundll32", ["url.dll,FileProtocolHandler"]] : [p === "linux" ? "xdg-open" : "open", []];
};

export default class HarnessOverview extends View {
  init(_props, cx) {
    this.config = undefined; // undefined: not read yet; null: no board
    this.data = null;
    this.error = null;
    this.loading = false;
    this.busy = null; // the key of the action running
    this.edit = null; // {key, title}: the card whose answer box is open
    this.expanded = new Set();
    this.showFyi = false;
    this.query = "";
    try { this.data = JSON.parse(localStorage.getItem("last") ?? "null"); } catch {}
    this.input = InputState.new({ placeholder: "Filter: id, task, session, text…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); cx.notify(); });
    this.answer = TextareaState.new({ placeholder: "Your answer or question…", rows: 4 });
    if (checking()) return;
    this.load(cx);
    cx.timer.every(15000, (cx) => {
      if (this.config && !this.loading && !this.edit && Date.now() - (this.loadedAt ?? 0) >= this.config.every * 1000) this.load(cx);
    });
  }

  // The config (re-read every time, so editing it needs no restart), then the board.
  load(cx) {
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.config = parseConfig(await readTextFile(`${appHome()}/${CONFIG_PATH}`));
        if (this.config) {
          const d = await this.call(["json"]);
          if (d.ok) {
            this.data = d;
            this.error = null;
            try { localStorage.setItem("last", JSON.stringify(d)); } catch {}
          } else this.error = d.error ?? "the board command failed";
        }
      } catch (e) {
        this.error = String(e?.message ?? e);
      }
      this.loading = false;
      this.loadedAt = Date.now();
      cx.notify();
    });
  }

  // Runs the board command with these arguments; its stdout is one JSON object.
  async call(args) {
    const r = await exec("sh", shellArgs(this.config.command, args), { on: this.config.on, timeout: 90000 });
    try { return JSON.parse(r.stdout); } catch {
      return { ok: false, error: (r.stderr || r.stdout || `exit ${r.code}`).trim().split("\n").slice(-3).join(" ") };
    }
  }

  // An action, then a fresh board. `done` says what happened.
  act(key, args, cx, done) {
    if (this.busy) return;
    this.busy = key;
    cx.notify();
    cx.spawn(async (cx) => {
      let res;
      try { res = await this.call(args); } catch (e) { res = { ok: false, error: String(e?.message ?? e) }; }
      this.busy = null;
      if (res.ok) {
        if (done) notify({ title: done(res), level: "success", timeout: 4000 });
        if (this.edit?.key === key) { this.edit = null; this.answer.set_value(""); }
      } else notify({ title: "Harness", body: res.error ?? "failed", level: "error", timeout: 8000 });
      this.load(cx);
    });
  }

  dismiss() {
    const id = props()?.overlay;
    if (id) closeOverlay(id);
  }

  openEditor(key, title, cx) {
    this.edit = this.edit?.key === key ? null : { key, title };
    this.answer.set_value("");
    if (this.edit) this.answer.focus();
    cx.notify();
  }

  goTo(address) {
    if (agents().some((a) => a.address === address)) run("agent.focus", { terminal: address });
    else run("terminal.peek", { terminal: address });
    this.dismiss();
  }

  // --- pieces ----------------------------------------------------------------------------

  btn(t, id, text, onClick, { primary = false, disabled = false, tip } = {}) {
    return div().id(id).flex_none().px(8).py(3).rounded(6).text_size(12)
      .border(1).border_color(primary ? t.accent : t.border)
      .bg(primary ? t.accent + "33" : t.chrome)
      .text_color(disabled ? t.dim : t.foreground)
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }))
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .child(text);
  }

  chip(t, id, text, color, tip) {
    return div().id(id).flex_none().max_w(220).truncate().px(5).py(1).rounded(4).bg((color ?? t.dim) + "26").text_size(10.5).text_color(color ?? t.dim)
      .when(Boolean(tip), (el) => el.tooltip(tip)).child(text);
  }

  sessionChip(t, id, s) {
    const color = s.status ? t[s.status] ?? t.foreground : t.dim;
    return h_flex().id(id).flex_none().gap(4).items_center().px(5).py(1).rounded(4).border(1).border_color(t.border).text_size(10.5)
      .text_color(s.status ? t.foreground : t.dim)
      .when(Boolean(s.status), (el) => el.cursor_pointer().hover((x) => x.bg(t.hover)).on_click((_e, cx) => { cx.stop_propagation(); this.goTo(s.address); }))
      .tooltip(s.status ? `${s.address}: ${s.status} — go to it` : `${s.address}: not running`)
      .child(div().size(6).rounded(3).flex_none().bg(color))
      .child(s.address);
  }

  linkChip(t, id, url) {
    const short = url.replace(/^https?:\/\/(www\.)?/, "").replace(/^([^/]+)\/.*?([^/]+\/[^/]+)$/, "$1/…/$2");
    return div().id(id).flex_none().max_w(260).truncate().px(5).py(1).rounded(4).text_size(10.5).text_color(t.accent).cursor_pointer()
      .hover((s) => s.bg(t.hover)).tooltip(url)
      .on_click((_e, cx) => { cx.stop_propagation(); const [cmd, pre] = opener(); exec(cmd, [...pre, url]).catch(() => {}); })
      .child(short);
  }

  body(t, id, md) {
    const text = plain(md);
    const long = text.length > SHORT;
    const open = this.expanded.has(id);
    return div().id(`${id}-body`).text_size(12).text_color(t.foreground).whitespace_normal()
      .child(long && !open ? text.slice(0, SHORT).trimEnd() + "…" : text)
      .when(long, (el) => el.child(div().id(`${id}-more`).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); open ? this.expanded.delete(id) : this.expanded.add(id); cx.notify(); })
        .child(open ? "less" : "more")));
  }

  // The notes saved for this card, each with ✕.
  drafts(t, id, notes) {
    return v_flex().gap(3).children(notes.map((n) => h_flex().id(`${id}-d-${n.nid}`).gap(6).items_start().px(6).py(3).rounded(4).bg(t.chrome).border(1).border_color(t.border)
      .child(div().flex_none().text_size(10.5).text_color(t.dim).child("draft"))
      .child(div().flex_1().min_w(0).whitespace_normal().text_size(11.5).text_color(t.foreground).child(n.text))
      .child(div().id(`${id}-dx-${n.nid}`).flex_none().text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.blocked)).tooltip("Delete this draft")
        .on_click((_e, cx) => { cx.stop_propagation(); this.act(`del-${n.nid}`, ["draft", "del", n.nid], cx); })
        .child(svg("mods/workspace-chrome/x.svg").size(11)))));
  }

  // The answer box under a card: Send (now, this card only) or Save draft.
  editor(t, key, hasDrafts) {
    const busy = this.busy === key;
    return v_flex().id(`ed-${key}`).gap(6).pt(4)
      .child(Textarea.new(this.answer).w_full().text_size(12).rounded(6).border(1).border_color(t.accent).bg(t.chrome).p(6))
      .child(h_flex().gap(6).items_center()
        .child(this.btn(t, `ed-send-${key}`, busy ? "Sending…" : "Send", (cx) => {
          const text = this.answer.value();
          if (!text.trim() && !hasDrafts) return;
          this.act(key, ["answer", key, ...(text.trim() ? [text] : [])], cx, (r) => `Sent to the manager${r.pinged ? "" : " (not pinged: it is busy with a dialog)"}`);
        }, { primary: true, disabled: Boolean(this.busy), tip: "Append to QUESTIONS.md now (with this card's drafts) and ping the manager" }))
        .child(this.btn(t, `ed-save-${key}`, "Save draft", (cx) => {
          const text = this.answer.value();
          if (text.trim()) this.act(key, ["draft", "add", key, text], cx, () => "Draft saved");
        }, { disabled: Boolean(this.busy), tip: "Keep it in the draft; send it later" }))
        .child(this.btn(t, `ed-cancel-${key}`, "Cancel", (cx) => { this.edit = null; cx.notify(); }))
        .child(div().flex_1())
        .child(div().text_size(10.5).text_color(t.dim).child("Esc closes")));
  }

  card(t, i) {
    const id = `it-${i.qkey}`;
    const editing = this.edit?.key === i.qkey;
    const head = i.id ?? i.group ?? i.column;
    const qs = i.question;
    return v_flex().id(id).flex_none().w_full().px(10).py(8).gap(5).rounded(8).bg(t.surface)
      .border(1).border_color(editing ? t.accent : i.column === "Urgent" ? t.blocked : t.border)
      .child(h_flex().gap(6).items_center().min_w(0)
        .child(div().flex_none().font_semibold().text_size(12).text_color(t.foreground).child(head))
        .when(Boolean(i.id && i.group), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(i.group)))
        .when(!(i.id && i.group), (el) => el.child(div().flex_1()))
        .when(Boolean(i.due), (el) => el.child(this.chip(t, `${id}-due`, `due ${i.due}`, t.working)))
        .when(Boolean(qs), (el) => el.child(this.chip(t, `${id}-qs`, QS_WORD[qs] ?? qs, qs === "answered" ? t.done : t.accent)))
        .when(Boolean(i.age), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(i.age))))
      .child(this.body(t, id, i.text))
      .when(Boolean(i.rec), (el) => el.child(div().text_size(11.5).text_color(t.done).whitespace_normal().child(`★ ${plain(i.rec)}`)))
      .when(i.tasks.length + i.sessions.length + i.links.length > 0, (el) => el.child(h_flex().flex_wrap().gap(4)
        .children(i.tasks.map((x) => this.chip(t, `${id}-t-${x}`, x, t.accent)))
        .children(i.sessions.map((s) => this.sessionChip(t, `${id}-s-${s.address}`, s)))
        .children(i.links.slice(0, 4).map((u, k) => this.linkChip(t, `${id}-l-${k}`, u)))))
      .when(i.draft.length > 0, (el) => el.child(this.drafts(t, id, i.draft)))
      .child(editing ? this.editor(t, i.qkey, i.draft.length > 0)
        : h_flex().gap(6).child(this.btn(t, `${id}-ans`, i.draft.length ? "Answer / send drafts" : "Answer", (cx) => this.openEditor(i.qkey, head, cx), { disabled: Boolean(this.busy) })));
  }

  taskCard(t, x) {
    const id = `tk-${x.task}`;
    const waiting = x.column === "Waiting on you";
    return v_flex().id(id).flex_none().w_full().px(10).py(8).gap(5).rounded(8).bg(t.surface).border(1).border_color(waiting ? t.blocked : t.border)
      .child(h_flex().gap(6).items_center().min_w(0)
        .child(div().flex_none().font_semibold().text_size(12).text_color(t.foreground).child(x.task))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(x.title ?? ""))
        .when(waiting, (el) => el.child(this.chip(t, `${id}-w`, "waiting on you", t.blocked))))
      .child(div().text_size(11.5).text_color(t.dim).whitespace_normal().child(plain(x.state)))
      .when(Boolean(x.last), (el) => el.child(this.body(t, `${id}-last`, `last: ${x.last}`)))
      .when(x.sessions.length > 0, (el) => el.child(h_flex().flex_wrap().gap(4).children(x.sessions.map((s) => this.sessionChip(t, `${id}-s-${s.address}`, s)))));
  }

  batchCard(t, b) {
    const id = `qb-${b.sent}`;
    return v_flex().id(id).flex_none().w_full().px(10).py(8).gap(6).rounded(8).bg(t.surface).border(1).border_color(b.status === "answered" ? t.done : t.border)
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().text_size(11).text_color(t.dim).child(`batch ${b.sent}`))
        .child(this.chip(t, `${id}-st`, QS_WORD[b.status] ?? b.status, b.status === "answered" ? t.done : t.accent))
        .when(b.status === "answered", (el) => el.child(this.btn(t, `${id}-ok`, this.busy === `ok-${b.sent}` ? "…" : "OK", (cx) =>
          this.act(`ok-${b.sent}`, ["ok", b.sent], cx, () => "Answer accepted"), { primary: true, disabled: Boolean(this.busy), tip: "Tell the manager the answer is OK" }))))
      .children(b.entries.map((e, k) => {
        const eid = `${id}-e${k}`;
        const editing = this.edit?.key === e.key;
        return v_flex().id(eid).gap(4).pt(4).border_t(1).border_color(t.border)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().flex_shrink_1().min_w(0).max_w(320).truncate().font_semibold().text_size(12).text_color(t.foreground).tooltip(e.name).child(e.name))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(e.where)))
          .children(e.questions.map((q, n) => div().min_w(0).id(`${eid}-q${n}`).text_size(11.5).text_color(t.foreground).whitespace_normal().child(`❓ ${plain(q)}`)))
          .children(e.answers.map((a, n) => v_flex().id(`${eid}-a${n}`).px(6).py(4).rounded(4).bg(t.chrome).gap(2)
            .child(div().text_size(10.5).text_color(t.done).child(plain(a.head)))
            .child(this.body(t, `${eid}-a${n}`, a.body))))
          .when(e.draft.length > 0, (el) => el.child(this.drafts(t, eid, e.draft)))
          .when(e.answers.length > 0 || editing, (el) => el.child(editing ? this.editor(t, e.key, e.draft.length > 0)
            : h_flex().child(this.btn(t, `${eid}-more`, "Ask more", (cx) => this.openEditor(e.key, e.name, cx), { disabled: Boolean(this.busy) }))));
      }));
  }

  column(t, id, title, count, color, children, { width, empty = "Nothing here" } = {}) {
    return v_flex().id(`col-${id}`).when(Boolean(width), (el) => el.w(width).flex_none()).when(!width, (el) => el.flex_1()).min_w(0).min_h(0)
      .rounded(10).bg(t.chrome).border(1).border_color(t.border)
      .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(2).border_color(color)
        .child(div().size(8).rounded(4).flex_none().bg(color))
        .child(div().font_semibold().text_color(t.foreground).child(title))
        .child(div().text_size(12).text_color(t.dim).child(String(count))))
      .child(v_flex().id(`col-body-${id}`).flex_1().min_h(0).p(8).gap(8).overflow_y_scrollbar()
        .when(children.length === 0, (el) => el.child(div().p(4).text_size(12).text_color(t.dim).child(empty)))
        .children(children));
  }

  setup(t) {
    const mono = (text) => div().px(10).py(6).rounded(6).bg(t.chrome).font_family("monospace").text_size(12).text_color(t.foreground).child(text);
    const line = (text) => div().text_size(12).text_color(t.dim).whitespace_normal().child(text);
    return v_flex().id("setup").flex_1().min_h(0).overflow_y_scrollbar().items_center().p(24).child(v_flex().max_w(760).gap(10)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("No board script configured"))
      .child(line(`The config file is absent (or names no "command"): ${appHome()}/${CONFIG_PATH}`))
      .child(line("Create it with the command that prints your board. To try the page with made-up data:"))
      .child(mono(`{ "command": "python3 ${appHome()}/mods/harness-overview/example/board.py", "every": 120 }`))
      .child(line('Optional "on": a machine to run the command on. Edits are read the next time the page opens or refreshes.'))
      .child(div().pt(6).text_size(13).font_semibold().text_color(t.foreground).child("What the script delivers"))
      .child(line("`<command> json` prints one JSON object (exit 0) with:"))
      .child(mono('{ "ok": true, "at": ISO time, "source": text, "manager": {address, status},\n  "sections": [{ "column": "Urgent" | "Decide" | "Ready to merge" | "On review" | "FYI", "items": [card] }],\n  "tasks": [{ task, title, state, column: "Active" | "Waiting on you" | "Closed", sessions, last }],\n  "batches": [{ sent, status: "waiting" | "answered" | "ok-sent" | "accepted", entries: [{ key, name, where, questions, answers, draft }] }],\n  "blocked": [{ address, task }], "draft": [note] }'))
      .child(line('card: { qkey, id, column, group, text (markdown), age, due, rec, tasks: [..], sessions: [{address, status}], links: [url], question, draft: [{nid, text}] }'))
      .child(line('The buttons run `<command> answer KEY [TEXT]` (send now), `draft add KEY TEXT`, `draft del NID`, `send` (every draft) and `ok SENT`, each printing { "ok": true | false, "error": … }.'))
      .child(line(`Full description: ${appHome()}/mods/harness-overview/README.md`)));
  }

  render(cx) {
    const t = theme();
    const d = this.config === null ? null : this.data; // no config: no stale board either
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const c = columns(d ?? {}, (x) => matches(words, x));
    const blockedHere = c.blocked.filter((b) => matches(words, { ...b, tasks: [b.task], sessions: [b] }));
    const draftN = d?.draft?.length ?? 0;
    const mgr = d?.manager;

    const header = h_flex().h(44).flex_none().px(16).gap(10).items_center().border_b(1).border_color(t.border)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Harness"))
      .when(Boolean(mgr), (el) => el.child(this.sessionChip(t, "mgr", { address: mgr.address, status: mgr.status })))
      .when(Boolean(d), (el) => el.child(div().flex_shrink_1().min_w(0).truncate().text_size(11).text_color(t.dim)
        .tooltip(`${d.source} (${d.target}) · last commit: ${d.commit?.subject ?? ""}${d.commit?.dirty ? ` + ${d.commit.dirty} uncommitted` : ""}`)
        .child(`${d.source} · commit ${d.commit?.age ?? "?"} ago · read ${ago(d.at)}`)))
      .when(Boolean(this.error), (el) => el.child(div().id("err").flex_shrink_1().min_w(0).truncate().text_size(11).text_color(t.blocked).tooltip(this.error)
        .child(d ? `refresh failed: ${this.error} (showing the last board)` : this.error)))
      .child(h_flex().id("filter").flex_none().w(260).h(28).px(8).gap(6).items_center().rounded(7).border(1).border_color(words.length ? t.accent : t.border).bg(t.chrome)
        .child(svg("mods/workspace-chrome/search.svg").size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12).text_color(t.foreground)))
      .child(div().flex_1())
      .when(draftN > 0, (el) => el.child(this.btn(t, "send-all", this.busy === "send" ? "Sending…" : `Send draft (${draftN})`, (cx) =>
        this.act("send", ["send"], cx, (r) => `Sent ${r.sent} question(s)`), { primary: true, disabled: Boolean(this.busy), tip: "Send every draft note as one batch" })))
      .when(Boolean(this.config), (el) => el.child(this.btn(t, "refresh", this.loading ? "Reading…" : "Refresh", (cx) => this.load(cx), { disabled: this.loading })))
      .child(div().id("close").p(4).rounded(4).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Close (Esc)").on_click(() => this.dismiss()).child(svg("mods/workspace-chrome/x.svg").size(14)));

    const root = v_flex().size_full().min_h(0).bg(t.background ?? t.chrome)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        if (this.edit) { this.edit = null; cx.notify(); }
        else if (this.query) { this.query = ""; this.input.set_value(""); cx.notify(); }
        else this.dismiss();
        cx.stop_propagation();
      })
      .child(header);
    if (this.config === null) return root.child(this.setup(t));
    if (!d) return root.child(div().p(24).text_color(t.dim).child(this.loading || this.config === undefined ? "Reading the harness…" : "No data"));

    const blockedRow = blockedHere.length === 0 ? [] : [v_flex().id("blocked").flex_none().gap(4).px(8).py(6).rounded(8).border(1).border_color(t.blocked).bg(t.blocked + "14")
      .child(div().text_size(11).font_semibold().text_color(t.blocked).child(`Blocked sessions ${blockedHere.length}`))
      .child(h_flex().flex_wrap().gap(4).children(blockedHere.map((b) => h_flex().id(`bl-${b.address}`).gap(4)
        .child(this.sessionChip(t, `bl-s-${b.address}`, { address: b.address, status: "blocked" }))
        .when(Boolean(b.task), (el) => el.child(this.chip(t, `bl-t-${b.address}`, b.task, t.accent))))))];
    const fyiToggle = this.btn(t, "fyi", this.showFyi ? `Hide FYI (${c.fyi.length})` : `FYI (${c.fyi.length})`, (cx) => { this.showFyi = !this.showFyi; cx.notify(); });

    return root.child(h_flex().id("body").flex_1().min_h(0).p(12).gap(10).items_stretch()
      .child(this.column(t, "needs", "Needs you", c.needs.length, t.blocked, c.needs.map((i) => this.card(t, i))))
      .child(this.column(t, "reviews", "Reviews", c.reviews.length, t.working, c.reviews.map((i) => this.card(t, i))))
      .child(this.column(t, "progress", "In progress", c.tasks.length, t.ansi2 ?? t.accent,
        [...blockedRow, ...c.tasks.map((x) => this.taskCard(t, x)), h_flex().id("fyi-row").child(fyiToggle), ...(this.showFyi ? c.fyi.map((i) => this.card(t, i)) : [])]))
      .child(this.column(t, "questions", "Questions", c.answered.length + c.waiting.length, t.done,
        [...c.answered.map((b) => this.batchCard(t, b)), ...c.waiting.map((b) => this.batchCard(t, b))], { empty: "No open questions" })));
  }
}
