// harness-overview: a task board from a script of yours: what needs you, reviews, tasks in progress
// and blocked sessions, questions and answers; answer a card from here (Send now, or Save draft).
// Opened with `mod.open:harness-overview` (⌘⇧H, or the board icon beside the Overview icon);
// `harness-overview.drafts` toggles its Drafts dialog, `.task <name>` / `.task` pick the task filter.
//
// The script is named in <app folder>/data/harness-overview/config.json (outside layouts/ and
// mods/, so it never travels with them):
//   { "command": "python3 ~/path/to/board.py", "every": 120 }
// optional "on": a machine to run it on. Without it the page says so and runs nothing.
// It is run as `<command> json` every `every` seconds while the page is open and after each action;
// the buttons run `answer KEY [TEXT]`, `draft add KEY TEXT`, `draft del NID`, `send`, `ok SENT` and `tell TEXT`.
// Each prints one JSON object. The format: README.md here; a working example: example/board.py.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView, Popup } from "gpui-base";
import { platform } from "process";
import { exec, run, agents, theme, props, closeOverlay, notify, appHome, readTextFile, checking, nextCommand, window as win } from "herdr";
import { CONFIG_PATH, parseConfig, shellArgs, plain, columns, matches, linkify, cutMarkdown, taskOptions, keepTask, NO_TASK, draftGroups, shortTitle, knownSessions, taskKey, taskLabel, sessionKey, notesFor, threadOf, threadMarkdown, memo, cardTitle, entryTitle, repairCut, dueRefresh, escapeStep, messageText, messageTask, ackKey, splitAcks, keepAcks } from "./board.js";
import { formatText } from "./format.js";

const MAC = platform === "macos"; // ⌘C on macOS, Ctrl+C elsewhere
const SHORT = 140; // visible characters of a card's text before "more" (which opens the reader)
// A text's links and its short cut, kept by text and sessions: render runs on every change.
const shortText = memo((md, addrs) => {
  const full = linkify(repairCut(md), addrs ? addrs.split("\n").map((address) => ({ address })) : []);
  return { full, ...cutMarkdown(full, SHORT) };
});
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
    this.reader = null; // {title, md}: the text "more" opened
    this.focus = cx.focus_handle(); // the page's own, so Esc reaches escape() (see render)
    this.showFyi = false;
    // ACKed answers (ackKey): read, nothing to send; behind the ACKs toggle. This page only.
    this.acks = [];
    try { this.acks = JSON.parse(localStorage.getItem("acks") ?? "[]"); } catch {}
    this.showAcks = false;
    this.query = "";
    // null: every task; NO_TASK: cards with none; else that task. The last pick is remembered.
    this.taskFilter = null;
    try { this.taskFilter = JSON.parse(localStorage.getItem("taskFilter") ?? "null"); } catch {}
    this.taskMenu = false;
    this.showDrafts = false; // the Drafts dialog
    this.draftEdit = null; // the nid of the draft being edited there
    this.draftText = TextareaState.new({ rows: 3 });
    try { this.data = JSON.parse(localStorage.getItem("last") ?? "null"); } catch {}
    this.input = InputState.new({ placeholder: "Filter: id, task, session, text…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); cx.notify(); });
    this.answer = TextareaState.new({ placeholder: "Your answer or question…", rows: 4 });
    this.message = null; // {task}: the Message dialog, a note to the manager
    this.messageText = TextareaState.new({ placeholder: "Your message to the manager…", rows: 6 });
    if (checking()) return;
    this.load(cx);
    // `harness-overview.drafts` opens the Drafts dialog, `.message` the Message dialog, `.refresh` rereads, `.task <name>` / `.task`
    // (all) pick the task (keys can name them).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "drafts") { this.showDrafts = !this.showDrafts; cx.notify(); }
        if (c === "refresh") this.load(cx);
        if (c === "message") this.openMessage(cx);
        if (c === "task") this.setTaskFilter(null, cx);
        else if (typeof c === "string" && c.startsWith("task ")) this.setTaskFilter(c.slice(5).trim() || null, cx);
      }
    });
    cx.timer.every(15000, (cx) => {
      if (dueRefresh(this, Date.now())) this.load(cx);
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
        if (this.draftEdit && key === `edit-${this.draftEdit}`) this.draftEdit = null;
      } else notify({ title: "Harness", body: res.error ?? "failed", level: "error", timeout: 8000 });
      this.load(cx);
    });
  }

  escape(cx) {
    const step = escapeStep(this);
    if (step === "close") return this.dismiss();
    if (step === "reader") this.reader = null;
    else if (step === "message") this.message = null;
    else if (step === "taskMenu") this.taskMenu = false;
    else if (step === "draftEdit") this.draftEdit = null;
    else if (step === "drafts") this.showDrafts = false;
    else if (step === "edit") this.edit = null;
    else if (step === "query") { this.query = ""; this.input.set_value(""); }
    // The answer box or filter had the keyboard; give it back to the page so Esc keeps working.
    this.focus.focus();
    cx.notify();
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

  // A link in card text: `session:<address>` goes to that session, anything else opens in the browser.
  openLink(url) {
    if (url.startsWith("session:")) return this.goTo(url.slice("session:".length));
    const [cmd, pre] = opener();
    exec(cmd, [...pre, url]).catch(() => {});
  }

  setTaskFilter(value, cx) {
    this.taskFilter = value;
    this.taskMenu = false;
    try { localStorage.setItem("taskFilter", JSON.stringify(value)); } catch {}
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

  // Markdown with clickable links (URLs, and the card's sessions). Long text is cut short so cards
  // stay small; "more" opens it whole in the reader window.
  // `whole`: a function giving the markdown the reader shows instead (a question's whole thread);
  // it runs only on click, so render never pays for it.
  body(t, id, md, sessions = [], size = 12, title = "", whole = null) {
    const { full, text, cut } = shortText(md ?? "", sessions.map((s) => s.address).join("\n"));
    return v_flex().id(`${id}-body`).w_full().min_w(0).text_size(size).text_color(t.foreground)
      // Not while the reader is open: a selection spans every selectable text under the drag,
      // so a drag in the reader also picked up the cards behind it.
      .child(TextView.markdown(`${id}-md`, text).selectable(!this.reader).w_full()
        .on_link_click((url, _cx) => this.openLink(url)))
      .when(cut, (el) => el.child(div().id(`${id}-more`).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .tooltip("Read it all")
        .on_click((_e, cx) => { cx.stop_propagation(); this.reader = { title: shortTitle(title), md: whole ? whole() : formatText(full) }; cx.notify(); })
        .child("more")));
  }

  // The reader: one long text, formatted, in a big scrolling window. Esc / outside click / ✕ close it.
  readerDialog(t) {
    const r = this.reader;
    const close = (cx) => { this.reader = null; cx.notify(); };
    const panel = v_flex().id("reader").w(900).h(900).max_w_full().max_h_full().min_h(0).rounded(10).bg(t.popover ?? t.surface).border(1).border_color(t.border).shadow_lg()
      .on_click((_e, cx) => cx.stop_propagation())
      .child(h_flex().h(44).flex_none().px(16).gap(10).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(14).font_semibold().text_color(t.foreground).child(r.title || "Text"))
        // Copy: the text as shown here (markdown, links and all) to the clipboard. A part: select it
        // and press ⌘C (Ctrl+C), which the text view handles itself; a mod can't read the selection.
        .child(div().flex_none().text_size(11).text_color(t.dim).child(`Select a part + ${MAC ? "⌘C" : "Ctrl+C"} to copy it`))
        .child(this.btn(t, "rd-copy", r.copied ? "Copied" : "Copy all", (cx) => {
          cx.write_to_clipboard(r.md);
          r.copied = true;
          cx.notify();
          cx.timer.after(2000, (cx) => { if (this.reader === r) { r.copied = false; cx.notify(); } });
        }, { tip: "Copy the whole text (markdown) to the clipboard. For a part, select it and press ⌘C / Ctrl+C" }))
        .child(div().id("rd-close").p(4).rounded(4).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Close (Esc)").on_click((_e, cx) => close(cx)).child(svg("mods/workspace-chrome/x.svg").size(14))))
      .child(v_flex().id("rd-body").flex_1().min_h(0).px(24).py(16).overflow_y_scrollbar().text_size(14).text_color(t.foreground)
        .child(TextView.markdown("rd-md", r.md).selectable(true).w_full().on_link_click((url, _cx) => this.openLink(url))));
    return div().id("reader-backdrop").absolute().inset_0().flex().items_center().justify_center().p(32).bg("#00000099")
      .on_click((_e, cx) => close(cx))
      .child(panel);
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
        }, { primary: true, disabled: Boolean(this.busy), tip: "Send now, with this card's saved drafts" }))
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
    const head = cardTitle(i);
    const qs = i.question;
    const extra = (i.links ?? []).filter((u) => !(i.text ?? "").includes(u));
    return v_flex().id(id).flex_none().w_full().px(10).py(8).gap(5).rounded(8).bg(t.surface)
      .border(1).border_color(editing ? t.accent : i.column === "Urgent" ? t.blocked : t.border)
      .child(h_flex().gap(6).items_center().min_w(0)
        .child(div().flex_none().font_semibold().text_size(12).text_color(t.foreground).child(head))
        .when(Boolean(i.group && head !== i.group), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(i.group)))
        .when(!(i.group && head !== i.group), (el) => el.child(div().flex_1()))
        .when(Boolean(i.due), (el) => el.child(this.chip(t, `${id}-due`, `due ${i.due}`, t.working)))
        .when(Boolean(qs), (el) => el.child(this.chip(t, `${id}-qs`, QS_WORD[qs] ?? qs, qs === "answered" ? t.done : t.accent)))
        .when(Boolean(i.age), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(i.age))))
      .child(this.body(t, id, i.text, i.sessions, 12, head))
      .when(Boolean(i.rec), (el) => el.child(h_flex().gap(4).items_start().text_color(t.done)
        .child(div().flex_none().text_size(11.5).child("★"))
        .child(this.body(t, `${id}-rec`, i.rec, i.sessions, 11.5, `${head} · recommendation`))))
      // Links the text already shows (as a link) aren't repeated as chips.
      .when(i.tasks.length + i.sessions.length + extra.length > 0, (el) => el.child(h_flex().flex_wrap().gap(4)
        .children(i.tasks.map((x) => this.chip(t, `${id}-t-${x}`, x, t.accent)))
        .children(i.sessions.map((s) => this.sessionChip(t, `${id}-s-${s.address}`, s)))
        .children(extra.slice(0, 4).map((u, k) => this.linkChip(t, `${id}-l-${k}`, u)))))
      .when(i.draft.length > 0, (el) => el.child(this.drafts(t, id, i.draft)))
      .child(editing ? this.editor(t, i.qkey, i.draft.length > 0)
        : h_flex().gap(6).child(this.btn(t, `${id}-ans`, i.draft.length ? "Answer / send drafts" : "Answer", (cx) => this.openEditor(i.qkey, head, cx), { disabled: Boolean(this.busy) })));
  }

  // Saved drafts under `key`, then the answer box or the button that opens it (Ask / Answer…).
  askRow(t, id, key, label, title) {
    const notes = notesFor(this.view?.draft, key);
    return v_flex().id(`${id}-ask`).gap(5)
      .when(notes.length > 0, (el) => el.child(this.drafts(t, id, notes)))
      .child(this.edit?.key === key ? this.editor(t, key, notes.length > 0)
        : h_flex().gap(6).child(this.btn(t, `${id}-askbtn`, notes.length ? `${label} / send drafts` : label, (cx) => this.openEditor(key, title, cx),
          { disabled: Boolean(this.busy), tip: "Ask the manager about this; your text goes with its context" })));
  }

  taskCard(t, x) {
    const id = `tk-${taskLabel(x)}`;
    const waiting = x.column === "Waiting on you";
    return v_flex().id(id).flex_none().w_full().px(10).py(8).gap(5).rounded(8).bg(t.surface).border(1).border_color(waiting ? t.blocked : t.border)
      .child(h_flex().gap(6).items_center().min_w(0)
        .child(div().flex_none().font_semibold().text_size(12).text_color(t.foreground).child(taskLabel(x)))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(x.title ?? ""))
        .when(waiting, (el) => el.child(this.chip(t, `${id}-w`, "waiting on you", t.blocked))))
      .child(this.body(t, `${id}-state`, x.state, x.sessions, 11.5, taskLabel(x)))
      .when(Boolean(x.last), (el) => el.child(this.body(t, `${id}-last`, `last: ${x.last}`, x.sessions, 12, `${taskLabel(x)} · last`)))
      .when(x.sessions.length > 0, (el) => el.child(h_flex().flex_wrap().gap(4).children(x.sessions.map((s) => this.sessionChip(t, `${id}-s-${s.address}`, s)))))
      .child(this.askRow(t, id, taskKey(x), "Ask", taskLabel(x)));
  }

  // A card's title: a link reads as people name it (app!183) and opens on click; the full name on hover.
  title(t, id, name, maxW, label = null) {
    const isUrl = /^https?:\/\//.test(name ?? "");
    return div().id(id).flex_shrink_1().min_w(0).max_w(maxW).truncate().font_semibold().text_size(12).text_color(isUrl ? t.accent : t.foreground)
      .tooltip(name ?? "")
      .when(isUrl, (el) => el.cursor_pointer().hover((s) => s.underline()).on_click((_e, cx) => { cx.stop_propagation(); this.openLink(name); }))
      .child(label ?? shortTitle(name));
  }

  setAck(b, on, cx) {
    const k = ackKey(b);
    const rest = keepAcks(this.acks, this.view?.batches ?? []).filter((x) => x !== k);
    this.acks = on ? [...rest, k] : rest;
    try { localStorage.setItem("acks", JSON.stringify(this.acks)); } catch {}
    cx.notify();
  }

  batchCard(t, b, known = [], acked = false) {
    const id = `qb-${b.sent}`;
    const last = b.entries.length - 1;
    const batchBtns = [
      ...(b.status === "answered" && !acked ? [this.btn(t, `${id}-ack`, "ACK", (cx) => this.setAck(b, true, cx),
        { tip: "Read, nothing to send: hide it under ACKs. The manager isn't told; a new answer brings it back" })] : []),
      ...(acked ? [this.btn(t, `${id}-unack`, "Un-ACK", (cx) => this.setAck(b, false, cx), { tip: "Back to the open questions" })] : []),
      ...(b.status === "answered" ? [this.btn(t, `${id}-ok`, this.busy === `ok-${b.sent}` ? "…" : "OK", (cx) =>
        this.act(`ok-${b.sent}`, ["ok", b.sent], cx, () => "Answer accepted"), { primary: true, disabled: Boolean(this.busy), tip: "Tell the manager the answer is OK" })] : []),
    ];
    return v_flex().id(id).flex_none().w_full().px(10).py(8).gap(6).rounded(8).bg(t.surface).border(1).border_color(b.status === "answered" ? t.done : t.border)
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().text_size(11).text_color(t.dim).child(`batch ${b.sent}`))
        .child(this.chip(t, `${id}-st`, QS_WORD[b.status] ?? b.status, b.status === "answered" ? t.done : t.accent)))
      .children(b.entries.map((e, k) => {
        const eid = `${id}-e${k}`;
        const editing = this.edit?.key === e.key;
        const thread = () => threadMarkdown(e.name, threadOf(this.view?.batches, e.name), (x) => formatText(linkify(repairCut(x), known)));
        const openThread = (cx) => { this.reader = { title: `${entryTitle(e)} · thread`, md: thread() }; cx.notify(); };
        return v_flex().id(eid).gap(4).pt(4).border_t(1).border_color(t.border)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(this.title(t, `${eid}-title`, e.name, 320, entryTitle(e)))
            .when(Boolean(e.where), (el) => el.child(this.chip(t, `${eid}-where`, `asked from ${e.where}`, t.dim)))
            .child(div().flex_1())
            .child(div().id(`${eid}-thread`).flex_none().text_size(11).text_color(t.accent).cursor_pointer().hover((s) => s.underline())
              .tooltip("Read the whole thread: what it's about, every question and answer").on_click((_e, cx) => { cx.stop_propagation(); openThread(cx); })
              .child("Thread")))
          // The item as it read when asked: what the question is about.
          .when(Boolean(e.quote), (el) => el.child(div().id(`${eid}-quote`).pl(8).border_l(2).border_color(t.border).text_color(t.dim)
            .child(this.body(t, `${eid}-quote`, e.quote, known, 11, e.name, thread))))
          .children(e.questions.map((q, n) => h_flex().id(`${eid}-q${n}`).gap(4).items_start().min_w(0)
            .child(div().flex_none().text_size(11.5).child("❓"))
            .child(this.body(t, `${eid}-q${n}`, q, known, 11.5, e.name, thread))))
          .children(e.answers.map((a, n) => v_flex().id(`${eid}-a${n}`).px(6).py(4).rounded(4).bg(t.chrome).gap(2)
            .child(div().text_size(10.5).text_color(t.done).child(plain(a.head)))
            .child(this.body(t, `${eid}-a${n}`, a.body, known, 12, e.name, thread))))
          .when(e.draft.length > 0, (el) => el.child(this.drafts(t, eid, e.draft)))
          .child(editing ? this.editor(t, e.key, e.draft.length > 0)
            : h_flex().gap(6).items_center()
              .child(this.btn(t, `${eid}-more`, e.answers.length > 0 ? "Ask more" : "Ask", (cx) => this.openEditor(e.key, e.name, cx), { disabled: Boolean(this.busy) }))
              // The batch's own buttons sit at the foot of the card, beside the last entry's Ask more.
              .when(k === last, (el) => el.child(div().flex_1()).children(batchBtns)))
          .when(editing && k === last && batchBtns.length > 0, (el) => el.child(h_flex().gap(6).items_center().child(div().flex_1()).children(batchBtns)));
      }))
      .when(last < 0 && batchBtns.length > 0, (el) => el.child(h_flex().gap(6).items_center().child(div().flex_1()).children(batchBtns)));
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

  // The task drop-list: All, each task with its card count, No task.
  taskPicker(t, d) {
    const { tasks, none, all } = taskOptions(d);
    const f = this.taskFilter;
    const trigger = h_flex().id("task").flex_none().max_w(240).h(28).px(8).gap(6).items_center().rounded(7).border(1).border_color(f !== null ? t.accent : t.border).bg(t.chrome)
      .text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
      .tooltip("Show one task's cards. The numbers: its cards in Needs you + Reviews")
      .on_click((_e, cx) => { this.taskMenu = !this.taskMenu; cx.notify(); })
      .child(div().flex_none().text_color(t.dim).child("Task"))
      .child(div().min_w(0).truncate().text_color(t.foreground).child(f === null ? "All" : f === NO_TASK ? "No task" : f))
      .child(svg("mods/workspace-chrome/chevron-down.svg").size(12).flex_none().text_color(t.dim));
    const option = (id, value, label, n) => h_flex().id(`task-opt-${id}`).px(8).py(4).gap(8).items_center().rounded(5).cursor_pointer()
      .when(f === value, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { cx.stop_propagation(); this.setTaskFilter(value, cx); })
      .child(div().flex_1().min_w(0).truncate().text_color(value === null || value === NO_TASK ? t.dim : t.foreground).child(label))
      .child(div().flex_none().text_color(t.dim).child(String(n)));
    const menu = v_flex().id("task-list").w(280).max_h(420).overflow_y_scrollbar().p(4).gap(1).rounded(8).bg(t.popover ?? t.surface).border(1).border_color(t.border).shadow_lg().text_size(12)
      .child(option("all", null, "All tasks", all))
      .children(tasks.map(([k, n], i) => option(i, k, k, n)))
      .child(option("none", NO_TASK, "No task", none));
    return Popup.new("task-pop", trigger).flex_none().anchor("top_left").when(this.taskMenu, (el) => el.content(menu));
  }

  openMessage(cx) {
    this.message = { task: messageTask(this.taskFilter) };
    this.taskMenu = false;
    this.showDrafts = false;
    this.messageText.set_value("");
    this.messageText.focus();
    cx.notify();
  }

  // The Message dialog: a note to the manager now (`tell`), "for <task>: " in front when a task is picked.
  messageDialog(t, d) {
    const m = this.message;
    const close = (cx) => { this.message = null; this.focus.focus(); cx.notify(); };
    const pick = (id, value, label) => div().id(`msg-t-${id}`).flex_none().px(8).py(2).rounded(5).text_size(11.5).cursor_pointer().border(1)
      .border_color(m.task === value ? t.accent : t.border).bg(m.task === value ? t.selected : t.chrome)
      .text_color(value === null ? t.dim : t.foreground).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { cx.stop_propagation(); this.message = { task: value }; cx.notify(); })
      .child(label);
    const tasks = taskOptions(d).tasks.map(([k]) => k);
    if (m.task && !tasks.includes(m.task)) tasks.unshift(m.task);
    const send = (cx) => {
      const text = messageText(m.task, this.messageText.value());
      if (!text) return;
      this.act("tell", ["tell", text], cx, () => { this.message = null; this.messageText.set_value(""); return "Sent to the manager"; });
    };
    const mgr = d?.manager?.address;
    const panel = v_flex().id("message").w(620).h(400).max_h_full().min_h(0).rounded(10).bg(t.popover ?? t.surface).border(1).border_color(t.border).shadow_lg()
      .on_click((_e, cx) => cx.stop_propagation())
      .child(h_flex().h(44).flex_none().px(16).gap(10).items_center().border_b(1).border_color(t.border)
        .child(div().text_size(14).font_semibold().text_color(t.foreground).child("Message to the manager"))
        .when(Boolean(mgr), (el) => el.child(div().text_size(12).text_color(t.dim).child(mgr)))
        .child(div().flex_1())
        .child(div().id("msg-close").p(4).rounded(4).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Close (Esc)").on_click((_e, cx) => close(cx)).child(svg("mods/workspace-chrome/x.svg").size(14))))
      .child(v_flex().id("msg-body").flex_1().min_h(0).p(16).gap(10).overflow_y_scrollbar()
        .child(h_flex().flex_wrap().gap(4).items_center()
          .child(div().flex_none().pr(4).text_size(11.5).text_color(t.dim).child("For"))
          .child(pick("none", null, "No task"))
          .children(tasks.map((k, i) => pick(i, k, k))))
        .child(Textarea.new(this.messageText).w_full().flex_none().text_size(12.5).rounded(6).border(1).border_color(t.accent).bg(t.chrome).p(8))
        .child(div().text_size(11).text_color(t.dim).whitespace_normal()
          .child(m.task ? `Goes as "for ${m.task}: …", now, with hc send. Not sent while the manager waits on a dialog.` : "Goes as written, now, with hc send. Not sent while the manager waits on a dialog.")))
      .child(h_flex().h(48).flex_none().px(16).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1())
        .child(this.btn(t, "msg-cancel", "Cancel", (cx) => close(cx)))
        .child(this.btn(t, "msg-send", this.busy === "tell" ? "Sending…" : "Send", (cx) => send(cx), { primary: true, disabled: Boolean(this.busy) })));
    return div().id("message-backdrop").absolute().inset_0().flex().items_center().justify_center().p(40).bg("#00000099")
      .on_click((_e, cx) => close(cx))
      .child(panel);
  }

  // The Drafts dialog: every saved note by card; edit, delete, send one card's or all.
  draftsDialog(t, d) {
    const groups = draftGroups(d?.draft);
    const n = d?.draft?.length ?? 0;
    const note = (g, x) => {
      const editing = this.draftEdit === x.nid;
      return v_flex().id(`dd-n-${x.nid}`).gap(4).px(8).py(6).rounded(6).bg(t.chrome).border(1).border_color(editing ? t.accent : t.border)
        .when(!editing, (el) => el.child(h_flex().gap(8).items_start()
          .child(div().flex_1().min_w(0).whitespace_normal().text_size(12).text_color(t.foreground).child(x.text))
          .when(Boolean(x.at), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(x.at)))
          .child(div().id(`dd-e-${x.nid}`).flex_none().p(2).rounded(4).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
            .tooltip("Edit").on_click((_e, cx) => { cx.stop_propagation(); this.draftEdit = x.nid; this.draftText.set_value(x.text); this.draftText.focus(); cx.notify(); })
            .child("✎"))
          .child(div().id(`dd-x-${x.nid}`).flex_none().p(2).rounded(4).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.blocked))
            .tooltip("Delete").on_click((_e, cx) => { cx.stop_propagation(); this.act(`del-${x.nid}`, ["draft", "del", x.nid], cx); })
            .child(svg("mods/workspace-chrome/x.svg").size(11)))))
        .when(editing, (el) => el
          .child(Textarea.new(this.draftText).w_full().text_size(12).rounded(6).border(1).border_color(t.border).bg(t.surface).p(6))
          .child(h_flex().gap(6)
            .child(this.btn(t, `dd-save-${x.nid}`, this.busy === `edit-${x.nid}` ? "Saving…" : "Save", (cx) => {
              const text = this.draftText.value();
              if (text.trim()) this.act(`edit-${x.nid}`, ["draft", "edit", x.nid, text], cx, () => "Draft changed");
            }, { primary: true, disabled: Boolean(this.busy) }))
            .child(this.btn(t, `dd-cancel-${x.nid}`, "Cancel", (cx) => { this.draftEdit = null; cx.notify(); }))));
    };
    const panel = v_flex().id("drafts").w(760).h(640).max_h_full().min_h(0).rounded(10).bg(t.popover ?? t.surface).border(1).border_color(t.border).shadow_lg()
      .on_click((_e, cx) => cx.stop_propagation())
      .child(h_flex().h(44).flex_none().px(16).gap(10).items_center().border_b(1).border_color(t.border)
        .child(div().text_size(14).font_semibold().text_color(t.foreground).child(`Drafts to send`))
        .child(div().text_size(12).text_color(t.dim).child(`${n} note${n === 1 ? "" : "s"} on ${groups.length} card${groups.length === 1 ? "" : "s"}`))
        .child(div().flex_1())
        .child(div().id("dd-close").p(4).rounded(4).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Close (Esc)").on_click((_e, cx) => { this.showDrafts = false; this.draftEdit = null; cx.notify(); })
          .child(svg("mods/workspace-chrome/x.svg").size(14))))
      .child(v_flex().id("dd-body").flex_1().min_h(0).p(12).gap(12).overflow_y_scrollbar()
        .when(groups.length === 0, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child("No drafts. Save draft under a card's answer box adds one.")))
        .children(groups.map((g, i) => v_flex().id(`dd-g-${i}`).gap(6)
          .child(h_flex().gap(8).items_center().min_w(0)
            .child(this.title(t, `dd-t-${i}`, g.title, 360))
            .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(g.where))
            .child(this.btn(t, `dd-send-${i}`, this.busy === g.qkey ? "Sending…" : `Send this card (${g.notes.length})`, (cx) =>
              this.act(g.qkey, ["answer", g.qkey], cx, (r) => `Sent ${r.sent ?? g.notes.length} note(s)${r.pinged === false ? " (manager not pinged)" : ""}`),
              { disabled: Boolean(this.busy), tip: "Send only this card's notes now" })))
          .when(Boolean(g.excerpt), (el) => el.child(this.body(t, `dd-x-${i}`, g.excerpt, [], 11, g.title)))
          .children(g.notes.map((x) => note(g, x))))))
      .child(h_flex().h(48).flex_none().px(16).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().text_size(11).text_color(t.dim).child("Send all sends every note as one batch."))
        .child(this.btn(t, "dd-close2", "Close", (cx) => { this.showDrafts = false; this.draftEdit = null; cx.notify(); }))
        .child(this.btn(t, "dd-send-all", this.busy === "send" ? "Sending…" : `Send all (${n})`, (cx) =>
          this.act("send", ["send"], cx, (r) => `Sent ${r.sent} note(s)`), { primary: true, disabled: Boolean(this.busy) || n === 0 })));
    return div().id("drafts-backdrop").absolute().inset_0().flex().items_center().justify_center().p(40).bg("#00000099")
      .on_click((_e, cx) => { this.showDrafts = false; this.draftEdit = null; cx.notify(); })
      .child(panel);
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
      .child(line('The buttons run `<command> answer KEY [TEXT]` (send now), `draft add KEY TEXT`, `draft edit NID TEXT`, `draft del NID`, `send` (every draft), `ok SENT` and `tell TEXT` (the Message button), each printing { "ok": true | false, "error": … }.'))
      .child(line(`Full description: ${appHome()}/mods/harness-overview/README.md`)));
  }

  render(cx) {
    const t = theme();
    const d = this.config === null ? null : this.data; // no config: no stale board either
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const keep = (x) => keepTask(this.taskFilter, x) && matches(words, x);
    const c = columns(d ?? {}, keep);
    this.view = d;
    const known = knownSessions(d);
    const blockedHere = c.blocked.filter((b) => keepTask(this.taskFilter, b) && matches(words, { ...b, tasks: [b.task], sessions: [b] }));
    const draftN = d?.draft?.length ?? 0;
    const mgr = d?.manager;

    const header = h_flex().h(44).flex_none().px(16).gap(10).items_center().border_b(1).border_color(t.border)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Harness"))
      .when(Boolean(mgr), (el) => el.child(this.sessionChip(t, "mgr", { address: mgr.address, status: mgr.status }))
        .child(this.btn(t, "msg-btn", "Message", (cx) => this.openMessage(cx), { disabled: Boolean(this.busy), tip: "Write to the manager now; the task you pick goes in front" })))
      .when(Boolean(d), (el) => el.child(div().flex_shrink_1().min_w(0).truncate().text_size(11).text_color(t.dim)
        .tooltip(`${d.source} (${d.target}) · last commit: ${d.commit?.subject ?? ""}${d.commit?.dirty ? ` + ${d.commit.dirty} uncommitted` : ""}`)
        .child(`${d.source} · commit ${d.commit?.age ?? "?"} ago · read ${ago(d.at)}`)))
      .when(Boolean(this.error), (el) => el.child(div().id("err").flex_shrink_1().min_w(0).truncate().text_size(11).text_color(t.blocked).tooltip(this.error)
        .child(d ? `refresh failed: ${this.error} (showing the last board)` : this.error)))
      .child(h_flex().id("filter").flex_none().w(260).h(28).px(8).gap(6).items_center().rounded(7).border(1).border_color(words.length ? t.accent : t.border).bg(t.chrome)
        .child(svg("mods/workspace-chrome/search.svg").size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12).text_color(t.foreground)))
      .when(Boolean(d), (el) => el.child(this.taskPicker(t, d)))
      .child(div().flex_1())
      .when(Boolean(d), (el) => el.child(this.btn(t, "drafts-btn", `Drafts (${draftN})`, (cx) => { this.showDrafts = true; this.taskMenu = false; cx.notify(); },
        { primary: draftN > 0, tip: "See, edit and send your saved drafts" })))
      .when(Boolean(this.config), (el) => el.child(this.btn(t, "refresh", this.loading ? "Reading…" : "Refresh", (cx) => this.load(cx), { disabled: this.loading })))
      .child(div().id("close").p(4).rounded(4).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Close (Esc)").on_click(() => this.dismiss()).child(svg("mods/workspace-chrome/x.svg").size(14)));

    const root = v_flex().relative().size_full().min_h(0).bg(t.background ?? t.chrome)
      // Esc in a dialog overlay is Herdr's `overlay.close`, a key binding that runs before key
      // handlers, so the page takes that action itself and closes the innermost thing first.
      // Tracking its own focus keeps the keyboard inside the page after a click on it.
      .track_focus(this.focus)
      .on_action("overlay.close", (_e, cx) => this.escape(cx))
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        this.escape(cx);
        cx.stop_propagation();
      })
      .child(header);
    if (this.config === null) return root.child(this.setup(t));
    if (!d) return root.child(div().p(24).text_color(t.dim).child(this.loading || this.config === undefined ? "Reading the harness…" : "No data"));

    const blockedRow = blockedHere.length === 0 ? [] : [v_flex().id("blocked").flex_none().gap(8).px(8).py(6).rounded(8).border(1).border_color(t.blocked).bg(t.blocked + "14")
      .child(div().text_size(11).font_semibold().text_color(t.blocked).child(`Blocked sessions ${blockedHere.length}`))
      .children(blockedHere.map((b) => {
        const key = sessionKey(b);
        const open = this.edit?.key === key;
        const notes = notesFor(d.draft, key);
        return v_flex().id(`bl-${b.address}`).gap(4)
          .child(h_flex().gap(4).items_center()
            .child(this.sessionChip(t, `bl-s-${b.address}`, { address: b.address, status: "blocked" }))
            .when(Boolean(b.task), (el) => el.child(this.chip(t, `bl-t-${b.address}`, b.task, t.accent)))
            .child(div().flex_1())
            .when(!open && notes.length === 0, (el) => el.child(this.btn(t, `bl-ask-${b.address}`, "Ask", (cx) => this.openEditor(key, b.address, cx),
              { disabled: Boolean(this.busy), tip: "Ask the manager about this session" }))))
          // Why it is blocked: its tab, what the dialog asks, its own harness notes.
          .when(Boolean(b.title), (el) => el.child(div().text_size(11.5).font_semibold().text_color(t.foreground).truncate().child(b.title)))
          .when(Boolean(b.kind || b.since || b.harness?.state), (el) => el.child(h_flex().flex_wrap().gap(4)
            .when(Boolean(b.kind), (el) => el.child(this.chip(t, `bl-k-${b.address}`, b.kind, t.blocked)))
            .when(Boolean(b.since), (el) => el.child(this.chip(t, `bl-a-${b.address}`, `asked ${ago(b.since)}`, t.dim, b.since)))
            .when(Boolean(b.harness?.state), (el) => el.child(this.chip(t, `bl-h-${b.address}`, `h.state ${b.harness.state}`, t.working)))))
          .when(Boolean(b.question), (el) => el.child(this.body(t, `bl-q-${b.address}`, b.question, known, 11.5, `${b.address} · ${b.title ?? "question"}`)))
          .when(Boolean(b.harness?.ask), (el) => el.child(this.body(t, `bl-ask-txt-${b.address}`, `ask: ${b.harness.ask}`, known, 11, `${b.address} · ask`)))
          .when(Boolean(b.harness?.next), (el) => el.child(div().text_color(t.dim).child(this.body(t, `bl-n-${b.address}`, `next: ${b.harness.next}`, known, 11, `${b.address} · next`))))
          .when((b.cards ?? []).length > 0, (el) => el.child(h_flex().flex_wrap().gap(4).items_center()
            .child(div().text_size(10.5).text_color(t.dim).child("on the board:"))
            .children([...b.cards.reduce((m, q) => m.set(q.split("|")[0], (m.get(q.split("|")[0]) ?? 0) + 1), new Map())].map(([col, n], k) => div().id(`bl-c-${b.address}-${k}`).px(5).py(1).rounded(4).border(1).border_color(t.border).text_size(10.5)
              .text_color(t.accent).cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Show the cards that name this session")
              .on_click((_e, cx) => { cx.stop_propagation(); this.query = b.address; this.input.set_value(b.address); cx.notify(); })
              .child(n > 1 ? `${col} ×${n}` : col)))))
          .when(open || notes.length > 0, (el) => el.child(this.askRow(t, `bl-${b.address}`, key, "Ask", b.address)));
      }))];
    // Needs-you cards you already asked or answered about: they wait on the harness now.
    const askedRow = c.asked.length === 0 ? [] : [v_flex().id("asked").flex_none().gap(8)
      .child(div().px(2).text_size(11).font_semibold().text_color(t.dim).child(`Asked or answered by you, waiting on the harness ${c.asked.length}`))
      .children(c.asked.map((i) => this.card(t, i)))];
    const acks = splitAcks(c.answered, this.acks);
    const ackToggle = this.btn(t, "acks", this.showAcks ? `Hide ACKs (${acks.acked.length})` : `ACKs (${acks.acked.length})`, (cx) => { this.showAcks = !this.showAcks; cx.notify(); },
      { tip: "Answers you ACKed: read, nothing sent" });
    const fyiToggle = this.btn(t, "fyi", this.showFyi ? `Hide FYI (${c.fyi.length})` : `FYI (${c.fyi.length})`, (cx) => { this.showFyi = !this.showFyi; cx.notify(); });

    return root.child(h_flex().id("body").flex_1().min_h(0).p(12).gap(10).items_stretch()
      .child(this.column(t, "needs", "Needs you", c.needs.length, t.blocked, c.needs.map((i) => this.card(t, i))))
      .child(this.column(t, "reviews", "Reviews", c.reviews.length, t.working, c.reviews.map((i) => this.card(t, i))))
      .child(this.column(t, "progress", "In progress", c.tasks.length + c.asked.length, t.ansi2 ?? t.accent,
        [...blockedRow, ...askedRow, ...c.tasks.map((x) => this.taskCard(t, x)), h_flex().id("fyi-row").child(fyiToggle), ...(this.showFyi ? c.fyi.map((i) => this.card(t, i)) : [])]))
      .child(this.column(t, "questions", "Questions", acks.open.length + c.waiting.length, t.done,
        [...acks.open.map((b) => this.batchCard(t, b, known)), ...c.waiting.map((b) => this.batchCard(t, b, known)),
          ...(acks.acked.length ? [...(acks.open.length + c.waiting.length ? [] : [div().p(4).text_size(12).text_color(t.dim).child("No open questions")]),
            h_flex().id("acks-row").child(ackToggle), ...(this.showAcks ? acks.acked.map((b) => this.batchCard(t, b, known, true)) : [])] : [])],
        { empty: "No open questions" })))
      .when(this.showDrafts, (el) => el.child(this.draftsDialog(t, d)))
      .when(Boolean(this.message), (el) => el.child(this.messageDialog(t, d)))
      .when(Boolean(this.reader), (el) => el.child(this.readerDialog(t)));
  }
}
