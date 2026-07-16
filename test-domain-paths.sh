#!/bin/bash

set -euo pipefail

BASE_URL="${BASE_URL:-https://baboontalkies.pandada.world}"

curl -fsS -o /dev/null -w "首页: %{http_code}\n" "${BASE_URL}/"
curl -fsS -o /dev/null -w "健康检查: %{http_code}\n" "${BASE_URL}/health"
curl -fsS -o /dev/null -w "教材页面: %{http_code}\n" "${BASE_URL}/materials"
curl -fsS "${BASE_URL}/api/last-refresh-time"
echo
