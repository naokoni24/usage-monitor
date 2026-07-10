#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aiusagemonitor.app"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_TEMPLATE="$PROJECT_DIR/scripts/launchd/${LABEL}.plist.template"
PLIST_DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node not found on PATH. Install Node.js (see README) before running this script." >&2
  exit 1
fi

# Logs go under ~/Library/Logs (never the project dir): if the project lives in
# a TCC-protected folder like ~/Desktop, launchd cannot open log files there and
# the service dies pre-spawn with EX_CONFIG.
LOG_DIR="$HOME/Library/Logs/ai-usage-monitor"
mkdir -p "$LOG_DIR"

sed \
  -e "s#__LABEL__#${LABEL}#g" \
  -e "s#__PROJECT_DIR__#${PROJECT_DIR}#g" \
  -e "s#__NODE_BIN__#${NODE_BIN}#g" \
  -e "s#__LOG_DIR__#${LOG_DIR}#g" \
  -e "s#__PATH_ENV__#${PATH}#g" \
  "$PLIST_TEMPLATE" > "$PLIST_DEST"

echo "Wrote $PLIST_DEST (logs: $LOG_DIR)"

# bootout is a no-op (with error) if not currently loaded - ignore failure.
launchctl bootout "gui/${UID_NUM}" "$PLIST_DEST" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DEST"
launchctl enable "gui/${UID_NUM}/${LABEL}"

echo "Installed and bootstrapped ${LABEL}."
echo "Run 'npm run service:start' to start it now, or it will start automatically on next login."
echo "Make sure you have already run 'npm run build' at least once."
