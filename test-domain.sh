#!/bin/bash

set -euo pipefail

OFFICIAL_URL="${OFFICIAL_URL:-https://baboontalkies.pandada.world}"
DIRECT_URL="${DIRECT_URL:-https://baboontalkies-manager-627990150052.asia-east1.run.app}"

echo "正式域名:"
curl -fsS "${OFFICIAL_URL}/health"
echo

echo "Cloud Run 直连:"
curl -fsS "${DIRECT_URL}/health"
echo

curl -fsS "${OFFICIAL_URL}/api/last-refresh-time"
echo
