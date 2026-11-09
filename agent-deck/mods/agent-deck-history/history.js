// agent-deck: past Claude Code sessions on every machine, for the History dialog.
// No imports, so node can test it (history.test.mjs).
//
// The approach (an index of transcripts kept on each machine, `claude --resume` to reopen,
// herdr-resume:// links) follows Martin Krcho's Herdr setup; this is its own implementation.

// Runs on each machine through `exec("sh", ["-c", SCAN], { on })`. Prints
//   row<TAB>id<TAB>"last time"<TAB>"first folder"<TAB>"title"   (fields 3-5 are JSON strings)
// for every titled transcript in ~/.claude/projects (the /rename title wins over Claude's own;
// headless Agent SDK runs are left out), then live<TAB>id for each session whose process runs.
// ~/.cache/agent-deck-history/index.tsv keeps one row per transcript with its change time and
// size, so only new or changed transcripts are read again; deleted ones drop out. Each row read
// is appended to the index at once, so a run cut short (exec's time limit) keeps its progress;
// the tidy-up at the end keeps the last row of each transcript that still exists.
export const SCAN = String.raw`export LC_ALL=C
T=$(printf '\t')
d="$HOME/.claude/projects"; c="$HOME/.cache/agent-deck-history"; i="$c/index.tsv"
mkdir -p "$c" && touch "$i" || exit 1
set -- "$d"/*/*.jsonl
if [ -f "$1" ]; then
  n="$i.$$"
  { stat -c "%n$T%Y.%s" "$@" 2>/dev/null || stat -f "%N$T%m.%z" "$@"; } > "$n.stat"
  awk -F'\t' -v idx="$i" -v todo="$n.todo" '
    BEGIN { while ((getline l < idx) > 0) { split(l, f, "\t"); known[f[1] "\t" f[2]] = 1 }
            printf "" > todo }
    !(($1 "\t" $2) in known) { print $1 "\t" $2 > todo }' "$n.stat"
  while IFS="$T" read -r f key; do
    r=$(grep -oE '"(customTitle|aiTitle|cwd|timestamp|entrypoint)":"([^"\\]|\\.)*"' "$f" | awk -v id="$(basename "$f" .jsonl)" '
      /^"entrypoint":"sdk-/ { sdk = 1; next }
      /^"entrypoint"/ { next }
      /^"cwd"/ { if (cwd == "") cwd = substr($0, 7); next }
      /^"timestamp"/ { ts = substr($0, 13); next }
      /^"customTitle"/ { custom = substr($0, 15); next }
      /^"aiTitle"/ { ai = substr($0, 11) }
      END { title = custom != "" ? custom : ai
            if (!sdk && title != "" && cwd != "") printf "%s\t%s\t%s\t%s", id, ts, cwd, title }')
    printf '%s\t%s\t%s\n' "$f" "$key" "$r" >> "$i"
  done < "$n.todo"
  awk -F'\t' -v files="$n.stat" '
    BEGIN { while ((getline l < files) > 0) { split(l, f, "\t"); want[f[1] "\t" f[2]] = 1 } }
    (($1 "\t" $2) in want) { row[$1 "\t" $2] = $0 }
    END { for (k in row) print row[k] }' "$i" > "$n" && mv "$n" "$i"
  rm -f "$n.stat" "$n.todo"
else
  : > "$i"
fi
awk -F'\t' 'NF >= 6 && $3 != "" { print "row\t" $3 "\t" $4 "\t" $5 "\t" $6 }' "$i"
for f in "$HOME"/.claude/sessions/*.json; do
  [ -f "$f" ] && kill -0 "$(basename "$f" .json)" 2>/dev/null || continue
  id=$(grep -oE '"sessionId":"[0-9a-f-]{36}"' "$f" | head -1 | cut -d'"' -f4)
  [ -n "$id" ] && printf 'live\t%s\n' "$id"
done
exit 0`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const json = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
const str = (v) => (typeof v === "string" && v !== "" ? v : null);

// { rows: [{id, at, cwd, title, machine}], live: Set of ids } from SCAN's output.
export function parseScan(out, machine) {
  const rows = [];
  const live = new Set();
  for (const line of (out ?? "").split("\n")) {
    const f = line.split("\t");
    if (f[0] === "live" && UUID.test(f[1] ?? "")) live.add(f[1]);
    if (f[0] !== "row" || f.length !== 5 || !UUID.test(f[1])) continue;
    const cwd = str(json(f[3]));
    const title = str(json(f[4]));
    if (!cwd || !title) continue;
    const at = Date.parse(json(f[2]) ?? "");
    rows.push({ id: f[1], at: Number.isNaN(at) ? null : at, cwd, title, machine });
  }
  return { rows, live };
}

// A herdr-resume://<machine|local>/<id> link or a bare session id: { machine, id }, else null.
// machine: null = this computer, undefined = any machine (a bare id names none).
const LINK = /^herdr-resume:\/\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/([^/?#]+)\/?(?:[?#].*)?$/i;
export function parseLink(query) {
  const s = (query ?? "").trim();
  const m = LINK.exec(s);
  const id = (m ? m[2] : s).toLowerCase();
  if (!UUID.test(id)) return null;
  return { machine: m ? (m[1].toLowerCase() === "local" ? null : m[1]) : undefined, id };
}

const newest = (a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity);

// Sessions matching what was typed, newest first: every word in the title, folder or machine
// (`local` for this computer), any case. A pasted link or id finds that session only.
export function search(rows, query, limit = 50) {
  const link = parseLink(query);
  if (link) return rows.filter((r) => r.id === link.id && (link.machine === undefined || r.machine === link.machine)).sort(newest);
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return rows
    .filter((r) => {
      const text = `${r.title} ${r.cwd} ${r.machine ?? "local"}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .sort(newest)
    .slice(0, limit);
}

export const recent = (rows, n = 8) => [...rows].sort(newest).slice(0, n);

export const shortPath = (p) => (p ?? "").replace(/^\/(root|Users\/[^/]+|home\/[^/]+)(?=\/|$)/, "~");

export const resumeLink = (r) => `herdr-resume://${r.machine ?? "local"}/${r.id}`;

// --- reopening -----------------------------------------------------------------------

// Shell snippets run on the session's machine. Claude Code keeps ~/.claude/sessions/<pid>.json
// ({pid, sessionId, …}) while a session runs; a crash can leave one behind, so a pid only
// counts when a terminal runs it now.
// Each session file, then for a running one the same session under its parent's pid: a local
// terminal's program is Herdr's shell wrapper (`fish -lic 'command claude; exec fish'`), claude
// its child. A copy lives in resume-link/agent_deck_resume.py: change both.
export const SESSIONS = String.raw`for f in "$HOME"/.claude/sessions/*.json; do [ -f "$f" ] || continue
cat "$f"; echo
p=$(basename "$f" .json); id=$(grep -oE '"sessionId" *: *"[0-9a-f-]{36}"' "$f" | head -1 | cut -d'"' -f4)
pp=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
[ -n "$id" ] && [ -n "$pp" ] && echo "{\"pid\":$pp,\"sessionId\":\"$id\"}"
done; exit 0`;
// The folder if it still exists, else its nearest existing parent (a deleted worktree, say):
// `claude --resume <id>` finds the session from any folder. The folder comes in as $1.
export const NEAREST = String.raw`d="$1"; while [ ! -d "$d" ]; do d=$(dirname "$d"); done; printf %s "$d"`;

// The pids SESSIONS lists for this session.
export function sessionPids(out, id) {
  const pids = new Set();
  for (const line of (out ?? "").split("\n")) {
    const d = json(line);
    if (d?.sessionId === id && Number.isInteger(d.pid)) pids.add(d.pid);
  }
  return pids;
}

// The Herdr command that reopens the row in `folder`: a new tab in a space on its machine
// (the one in that folder first), else a new space there. The tab is left unnamed, so it shows
// the session's live title and follows a later /rename.
export function openPlan(spaces, row, folder) {
  const argv = ["claude", "--resume", row.id];
  const here = spaces.filter((s) => (s.machine ?? null) === (row.machine ?? null));
  const space = here.find((s) => s.folder === folder) ?? here[0];
  if (space) return { command: "tab.new", args: { space: space.id, folder, argv } };
  return { command: "space.new", args: { ...(row.machine ? { machine: row.machine } : {}), folder, argv } };
}

// --- full-text search -----------------------------------------------------------------

// On each machine, with the text as $1: the transcripts the index lists (titled, not SDK runs)
// whose conversation contains it, literally and in any case (`grep -F -i`), one per line:
//   id<TAB>up to 400 characters of the first matching line, around the match.
// Only user and assistant lines count (tool output included): not the instructions attachment
// injected into every session, nor api-request-blob lines (a copy of the whole request).
// Reads the index SCAN keeps, so run SCAN first.
export const FULLTEXT = String.raw`export LC_ALL=C
i="$HOME/.cache/agent-deck-history/index.tsv"; [ -f "$i" ] || exit 0
P="$1"; export P
awk -F'\t' 'NF >= 6 && $3 != "" { print $1 }' "$i" | while IFS= read -r f; do
  [ -f "$f" ] || continue
  # Drop the big blob lines first: matching first and filtering after reads every matching
  # blob (21 s on one 987 MB transcript here, 2 s this way); -m1 then stops at the first hit.
  l=$(grep -v -F -e '"type":"attachment"' -e '"type":"api-request-blob"' "$f" | grep -F -e '"type":"user"' -e '"type":"assistant"' | grep -m1 -i -F -- "$P")
  [ -n "$l" ] || continue
  s=$(printf '%s' "$l" | awk '{ p = tolower(ENVIRON["P"]); k = index(tolower($0), p); a = k > 150 ? k - 150 : 1; print substr($0, a, 400) }')
  printf '%s\t%s\n' "$(basename "$f" .jsonl)" "$s"
done
exit 0`;

// FULLTEXT's output: Map id -> the raw text around the match (the first line for an id wins).
export function parseHits(out) {
  const hits = new Map();
  for (const line of (out ?? "").split("\n")) {
    const tab = line.indexOf("\t");
    const id = tab < 0 ? line : line.slice(0, tab);
    if (UUID.test(id) && !hits.has(id)) hits.set(id, tab < 0 ? "" : line.slice(tab + 1));
  }
  return hits;
}

const ESC = { n: " ", r: " ", t: " ", b: "", f: "", '"': '"', "\\": "\\", "/": "/" };
// JSON escapes as text, in one pass (so an escaped backslash stays one backslash).
const unescape = (s) => s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_m, c) => (c.length === 5 ? String.fromCharCode(parseInt(c.slice(1), 16)) : ESC[c] ?? c));

// The matched line, shortened for a card: about `width` characters on each side of the
// match, cut at a word, `…` where it was cut. { before, match, after }; no match found: the start.
export function snippet(raw, query, width = 60) {
  const text = unescape(raw ?? "").replace(/\s+/g, " ").trim();
  const q = (query ?? "").trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) {
    const cut = text.length > width * 2;
    return { before: cut ? text.slice(0, width * 2).replace(/\s+\S*$/, "") + "…" : text, match: "", after: "" };
  }
  let before = text.slice(Math.max(0, at - width), at);
  if (at > width) before = "…" + before.replace(/^\S*\s/, "");
  const end = at + q.length;
  let after = text.slice(end, end + width);
  if (end + width < text.length) after = after.replace(/\s+\S*$/, "") + "…";
  return { before, match: text.slice(at, end), after };
}
