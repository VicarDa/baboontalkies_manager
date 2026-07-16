#!/bin/bash

set -euo pipefail

PROJECT_ID="project-59ee4a6b-1c4d-4d7b-a37"
SERVICE="baboontalkies-manager"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "未安装 Google Cloud CLI"
  exit 1
fi

echo "开始监听 ${SERVICE} 的 Cloud Run 日志..."
gcloud beta logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE}" \
  --project "$PROJECT_ID"
