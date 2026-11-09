// agent-deck: a terminal's labels (`hc label t7 role=reviewer`) in its pane header, as
// a `name value` chip like the Overview's. No imports, so node can test it (labels.test.mjs).

// Herdr's own labels: never shown. Same rule as agent-deck-overview/labels.js
// (a mod can't import another mod's files).
const reserved = (k) => k === "where" || k.startsWith("herdr.");

// The labels a person or an agent set, as [name, value] pairs sorted by name.
export function headerLabels(labels) {
  return Object.entries(labels ?? {})
    .filter(([k, v]) => v !== "" && !reserved(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
