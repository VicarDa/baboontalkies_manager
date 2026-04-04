#!/bin/bash

set -euo pipefail

OFFICIAL_URL="${OFFICIAL_URL:-https://baboontalkies.pandada.world}"
DIRECT_URL="${DIRECT_URL:-https://baboontalkies-manager-627990150052.asia-east1.run.app}"

echo "测试 manager 正式入口..."
echo ""

echo "1. 自定义域名健康检查"
curl -s "${OFFICIAL_URL}/health" | jq . || echo "自定义域名健康检查失败"
echo ""

echo "2. Cloud Run 直连健康检查"
curl -s "${DIRECT_URL}/health" | jq . || echo "Cloud Run 直连健康检查失败"
echo ""

echo "3. 自定义域名数据刷新时间"
curl -s "${OFFICIAL_URL}/api/last-refresh-time" | jq . || echo "获取刷新时间失败"
echo ""

echo "4. Cloud Run 直连数据刷新时间"
curl -s "${DIRECT_URL}/api/last-refresh-time" | jq . || echo "获取刷新时间失败"
echo ""

echo "5. 旧阿里云入口说明"
echo "http://fc.pandada.world/baboontalkies_manager 已废弃，不再作为验收地址。"
