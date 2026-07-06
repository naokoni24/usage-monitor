#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aiusagemonitor.app"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_TEMPLATE="$PROJECT_DIR/scripts/launchd/${LABEL}.plist.template"
PLIST_DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

NPM_BIN="$(command -v npm || true)"
if [ -z "$NPM_BIN" ]; then
  echo "npm not found on PATH. Install Node.js (see README) before running this script." >&2
  exit 1
fi

mkdir -p "$PROJECT_DIR/logs"

sed \
  -e "s#__LABEL__#${LABEL}#g" \
  -e "s#__PROJECT_DIR__#${PROJECT_DIR}#g" \
  -e "s#__NPM_BIN__#${NPM_BIN}#g" \
  -e "s#__PATH_ENV__#${PATH}#g" \
  "$PLIST_TEMPLATE" > "$PLIST_DEST"

echo "Wrote $PLIST_DEST"

# bootout is a no-op (with error) if not currently loaded - ignore failure.
launchctl bootout "gui/${UID_NUM}" "$PLIST_DEST" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DEST"
launchctl enable "gui/${UID_NUM}/${LABEL}"

echo "Installed and bootstrapped ${LABEL}."
echo "Run 'npm run service:start' to start it now, or it will start automatically on next login."
echo "Make sure you have already run 'npm run build' at least once."
