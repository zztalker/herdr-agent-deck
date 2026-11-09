// agent-deck: the 10 task colors for the label editor's color row. A copy of the palettes in
// agent-deck-agents/badge.js (a mod can't import another mod's files): change both;
// edit.test.mjs checks they match. No imports, so node can test it.

export const COLOR_NAMES = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "grey"];

// One palette per appearance (`settings().dark`). Every color keeps its letters at 4.5:1 or
// better and stands out from that appearance's sidebar.
const W = "#ffffff", D = "#1b1e24";
export const PALETTES = {
  dark: {
    red: { bg: "#bb0916", fg: W },
    orange: { bg: "#fa8a0b", fg: D },
    yellow: { bg: "#f7d710", fg: D },
    green: { bg: "#06791f", fg: W },
    teal: { bg: "#2dd8d3", fg: D },
    blue: { bg: "#085dc7", fg: W },
    purple: { bg: "#7f36bc", fg: W },
    pink: { bg: "#ff96d3", fg: D },
    brown: { bg: "#71462e", fg: W },
    grey: { bg: "#b2b8bf", fg: D },
  },
  light: {
    red: { bg: "#bb0916", fg: W },
    orange: { bg: "#f1840b", fg: D },
    yellow: { bg: "#e1c41a", fg: D },
    green: { bg: "#06791f", fg: W },
    teal: { bg: "#05cbc6", fg: D },
    blue: { bg: "#085dc7", fg: W },
    purple: { bg: "#7f36bc", fg: W },
    pink: { bg: "#fb80ca", fg: D },
    brown: { bg: "#71462e", fg: W },
    grey: { bg: "#9a9fa6", fg: D },
  },
};
