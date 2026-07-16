#!/bin/bash

set -euo pipefail

PROJECT_ID="project-59ee4a6b-1c4d-4d7b-a37"
REGION="asia-east1"
SERVICE="baboontalkies-manager"
OFFICIAL_URL="https://baboontalkies.pandada.world"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "未安装 Google Cloud CLI"
  exit 1
fi

if [[ -n $(git status --short) ]]; then
  echo "警告：当前工作区有未提交修改，本次会部署当前工作区内容。"
fi

gcloud builds submit \
  --config cloudbuild.yaml \
  --project "$PROJECT_ID" \
  .

gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format='value(status.latestReadyRevisionName,status.traffic[0].percent)'

curl -fsS "$OFFICIAL_URL/health"
echo
