#!/usr/bin/env bash
set -euo pipefail

LABEL="com.aiusagemonitor.app"
UID_NUM="$(id -u)"

launchctl print "gui/${UID_NUM}/${LABEL}" 2>&1 || echo "${LABEL} is not loaded."
