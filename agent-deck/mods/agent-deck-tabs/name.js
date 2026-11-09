// agent-deck: what a tab is called in the tab bar. A tab nobody named, or one named only
// after its program ("Claude Code"), shows its agent's own title (Claude's session name,
// `/rename`), as the Agents list does. No imports, so node can test it (name.test.mjs).

// A copy of agent-deck-agents/title.js (a mod can't import another mod's files): change both.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// The title to show, or null when it says nothing.
export function liveTitle(title, program) {
  const raw = (title ?? "").trim();
  const live = clean(raw);
  if (!live || live === program?.name || live.toLowerCase() === program?.key) return null;
  if (/^[~/]|^[A-Za-z]:\\/.test(raw) || live.includes("@")) return null;
  return live;
}

// `lead` is the tab's main pane ({ title, program }): its agent, else the focused one.
export function tabName(tab, lead) {
  const prog = lead?.program?.name;
  const live = liveTitle(lead?.title, lead?.program);
  if (live && (!tab.named || tab.name === prog)) return live;
  return /^tb\d+$/.test(tab.name) ? prog ?? "Terminal" : tab.name;
}
