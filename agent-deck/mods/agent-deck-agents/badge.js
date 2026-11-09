// agent-deck: a session's rail cell from its labels (`hc label t7 task=… role=…`): the first
// letter of `task`, then the first letter of `role` (either place left empty when that label
// is missing), colored by its first letter (one of 26 colors). No task or role: null, and the
// program's icon shows. No imports, so node can test it (badge.test.mjs).

// One color per letter, A to Z: the 26 picked to be as far apart as the eye sees color (OKLab),
// each keeping white text at 4.5:1 contrast or better, ordered so neighbouring letters differ.
export const BADGE_COLORS = [
  "#d71f75", "#10819e", "#b249ac", "#636109", "#57428d", "#d71908", "#0e6ee6",
  "#814a61", "#176c5f", "#8d15ab", "#9c672d", "#5601ae", "#890024", "#075ea9",
  "#a50371", "#1e8526", "#914de6", "#673c14", "#5941da", "#b55967", "#084e6c",
  "#732064", "#0e5715", "#7868a9", "#9b3b08", "#032ebb",
];

const first = (s) => (typeof s === "string" ? s.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "" : "");

export function labelBadge(labels) {
  const text = first(labels?.task) + first(labels?.role);
  if (!text) return null;
  // A-Z by position; a digit or another script's letter by its code.
  const c = text.codePointAt(0);
  return { text, color: BADGE_COLORS[c >= 65 && c <= 90 ? c - 65 : c % BADGE_COLORS.length] };
}
