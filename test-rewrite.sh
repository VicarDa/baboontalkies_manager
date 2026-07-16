#!/bin/bash

set -euo pipefail

BASE_URL="${BASE_URL:-https://baboontalkies.pandada.world}"

curl -fsS -o /dev/null -w "首页: %{http_code}\n" "${BASE_URL}/"
curl -fsS -o /dev/null -w "学员页: %{http_code}\n" "${BASE_URL}/students"
curl -fsS -o /dev/null -w "教师签到页: %{http_code}\n" "${BASE_URL}/teacher"
