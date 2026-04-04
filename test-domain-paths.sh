#!/bin/bash

set -euo pipefail

OFFICIAL_URL="${OFFICIAL_URL:-https://baboontalkies.pandada.world}"
DIRECT_URL="${DIRECT_URL:-https://baboontalkies-manager-627990150052.asia-east1.run.app}"

echo "测试 manager 当前正式路径配置..."
echo ""

echo "1. 测试正式首页"
curl -s -o /dev/null -w "状态码: %{http_code}\n" "${OFFICIAL_URL}/"
echo ""

echo "2. 测试正式健康检查"
curl -s "${OFFICIAL_URL}/health"
echo ""
echo ""

echo "3. 测试正式 materials 页面"
curl -s -o /dev/null -w "状态码: %{http_code}\n" "${OFFICIAL_URL}/materials"
echo ""

echo "4. 测试 Cloud Run 直连首页"
curl -s -o /dev/null -w "状态码: %{http_code}\n" "${DIRECT_URL}/"
echo ""

echo "5. 旧阿里云入口说明"
echo "http://fc.pandada.world/baboontalkies_manager 已废弃，不再作为路径测试目标。"
echo ""

echo "测试完成"
