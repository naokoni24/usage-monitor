#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aiusagemonitor.app"
UID_NUM="$(id -u)"

launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || echo "Already stopped."
echo "Stopped ${LABEL} (it will not restart until 'npm run service:start' or the next login/install)."
