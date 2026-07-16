#!/bin/bash

set -euo pipefail

BASE_URL="${BASE_URL:-https://baboontalkies.pandada.world}"

echo "测试 Cloud Run 部署: ${BASE_URL}"
curl -fsS "${BASE_URL}/health"
echo
curl -fsS "${BASE_URL}/api/last-refresh-time"
echo
curl -fsS -o /dev/null -w "Dashboard: %{http_code}\n" "${BASE_URL}/students"
