// agent-deck: a herdr-resume:// link for a running Claude Code agent (Copy link on its card).
// A copy of agent-deck-overview/resume.js (a mod can't import another mod's files): change both.
// Herdr doesn't know an agent's session id: Claude Code keeps ~/.claude/sessions/<pid>.json
// ({pid, sessionId, …}) while it runs, so the link comes from the pid of the terminal's
// program. The link format is Martin Krcho's (agent-deck-history, resume-link/ in the repo).
// No imports, so node can test it (resume.test.mjs).

// On the agent's machine, with the terminal program's pid as $1: the pid whose session file it
// reads, that file, then `found` when the session's transcript exists (none before the first
// message: a link would reach nothing). Locally that program is Herdr's shell wrapper
// (`fish -lic 'command claude; exec fish'`), so a direct child's file counts too.
export const SESSION_OF = String.raw`s="$HOME/.claude/sessions"
if [ ! -f "$s/$1.json" ]; then
  for c in $(ps -A -o pid= -o ppid= 2>/dev/null | awk -v p="$1" '$2==p{print $1}'); do
    [ -f "$s/$c.json" ] && set -- "$c" && break
  done
fi
f="$s/$1.json"; [ -f "$f" ] || exit 0
echo "$1"; cat "$f"; echo
id=$(grep -oE '"sessionId":"[0-9a-f-]{36}"' "$f" | head -1 | cut -d'"' -f4)
[ -n "$id" ] || exit 0
for t in "$HOME"/.claude/projects/*/"$id".jsonl; do [ -f "$t" ] && echo found && break; done
exit 0`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The session id from SESSION_OF's output, when the file is the pid's it was read for (a
// crash can leave a stale one) and its transcript exists.
export function sessionFrom(out) {
  const [used, file, found] = (out ?? "").split("\n");
  let d;
  try { d = JSON.parse(file); } catch { return null; }
  return /^\d+$/.test(used) && d?.pid === Number(used) && UUID.test(d?.sessionId ?? "") && found === "found" ? d.sessionId : null;
}

export const resumeLink = (machine, id) => `herdr-resume://${machine ?? "local"}/${id}`;
export const machineOf = (address) => (address.includes("/") ? address.slice(0, address.lastIndexOf("/")) : null);
