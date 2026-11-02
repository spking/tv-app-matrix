// Site configuration — the only file you normally need to edit besides the CSVs.
window.MATRIX_CONFIG = {
  title: "Matrix",
  subtitle: "", // optional line under the title

  // One entry per sheet tab. `gid` is the number after "gid=" in the tab's URL;
  // it's only used by the refresh workflow (.github/workflows/refresh-data.yml).
  sheets: [
    { name: "Matrix", file: "data/matrix.csv", gid: "0" },
  ],

  headerRows: 1,     // rows at the top treated as column headers
  stickyColumns: 1,  // leftmost columns that stay visible while scrolling sideways

  // Cell values (case-insensitive, trimmed) that get a colour badge.
  // Change these to match the vocabulary used in your matrix.
  status: {
    yes:     ["yes", "y", "✓", "✔", "true", "supported", "full", "done"],
    partial: ["partial", "limited", "some", "~", "wip", "in progress"],
    no:      ["no", "n", "✗", "✘", "false", "unsupported", "none", "n/a"],
    unknown: ["?", "tbd", "unknown", "tbc"],
  },
};
