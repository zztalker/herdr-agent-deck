#!/usr/bin/env bash
# Install the herdr-resume:// link handler on this Mac.
#
# Builds "~/Applications/Agent Deck Resume Link.app": a background app macOS calls for
# herdr-resume:// links. It carries its own copy of agent_deck_resume.py (so the repo can
# move), runs it with the link and returns at once. Safe to run again: it rebuilds the app.
# Log: ~/Library/Logs/agent-deck-resume.log. Remove: delete the app.
set -euo pipefail

[[ "$(uname -s)" == Darwin ]] || { echo "resume link: macOS only, skipped"; exit 0; }
command -v python3 >/dev/null || { echo "resume link: python3 not found (xcode-select --install, or brew install python)" >&2; exit 1; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app="$HOME/Applications/Agent Deck Resume Link.app"
lsregister=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$HOME/Applications" "$HOME/Library/Logs"

# Apps macOS starts get a minimal PATH: add Herdr's ~/.local/bin and Homebrew.
cat > "$work/handler.applescript" <<'EOF'
on open location theURL
  set scriptPath to POSIX path of (path to me) & "Contents/Resources/agent_deck_resume.py"
  do shell script "export PATH=\"$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin\"; python3 -I " & quoted form of scriptPath & " " & quoted form of theURL & " >> \"$HOME/Library/Logs/agent-deck-resume.log\" 2>&1 &"
end open location

on run
  display dialog "Agent Deck Resume Link opens herdr-resume:// links in Herdr. There is nothing to do here." buttons {"OK"} default button 1 with title "Agent Deck Resume Link"
end run
EOF

rm -rf "$app"
osacompile -o "$app" "$work/handler.applescript"
cp "$here/agent_deck_resume.py" "$app/Contents/Resources/agent_deck_resume.py"

plist="$app/Contents/Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$plist"; }
pb "Set :CFBundleIdentifier com.github.zztalker.agent-deck.resume-link" 2>/dev/null || pb "Add :CFBundleIdentifier string com.github.zztalker.agent-deck.resume-link"
pb "Add :LSUIElement bool true"
pb "Add :CFBundleURLTypes array"
pb "Add :CFBundleURLTypes:0 dict"
pb "Add :CFBundleURLTypes:0:CFBundleURLName string Herdr resume link"
pb "Add :CFBundleURLTypes:0:CFBundleURLSchemes array"
pb "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string herdr-resume"

# Editing Info.plist breaks osacompile's signature: sign again, ad hoc.
codesign --force --deep --sign - "$app" >/dev/null 2>&1 || echo "resume link: codesign failed; the link may still work"
"$lsregister" -f "$app"

# Another herdr-resume handler (Martin Krcho's "Herdr Resume Link.app" takes the same links)
# may win instead; both open the session the same way.
others=$("$lsregister" -dump 2>/dev/null | grep -B30 'herdr-resume:' | grep -oE 'path: +.*\.app' | sed 's/path: *//' | sort -u | grep -v "Agent Deck Resume Link.app" || true)
[[ -z "$others" ]] || printf 'resume link: other handlers for herdr-resume:// are registered too:\n%s\n' "$others"
echo "resume link: installed $app"
