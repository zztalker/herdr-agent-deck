// agent-deck: an agent's own title (Claude's chat name, `/rename`) when it says something: not
// the program's name, a path or user@host. Claude puts a status glyph in front ("✳ Fix login"),
// so it's stripped, but the path test reads the raw title (the strip would eat a leading ~ or /).
// agent-deck-tabs/name.js has a copy for the tab bar (a mod can't import another mod's
// files): change both. No imports, so node can test it (title.test.mjs).

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// The title to show, or null when it says nothing.
export function liveTitle(title, program) {
  const raw = (title ?? "").trim();
  const live = clean(raw);
  if (!live || live === program?.name || live.toLowerCase() === program?.key) return null;
  if (/^[~/]|^[A-Za-z]:\\/.test(raw) || live.includes("@")) return null;
  return live;
}
