#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aiusagemonitor.app"
UID_NUM="$(id -u)"
PLIST_DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
rm -f "$PLIST_DEST"

echo "Uninstalled ${LABEL} and removed ${PLIST_DEST}."
