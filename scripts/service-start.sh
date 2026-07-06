#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aiusagemonitor.app"
UID_NUM="$(id -u)"
PLIST_DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [ ! -f "$PLIST_DEST" ]; then
  echo "Not installed yet. Run 'npm run service:install' first." >&2
  exit 1
fi

launchctl bootstrap "gui/${UID_NUM}" "$PLIST_DEST" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}"
echo "Started ${LABEL}."
