#!/bin/bash

set -euo pipefail

OFFICIAL_URL="${OFFICIAL_URL:-https://baboontalkies.pandada.world}"

echo "测试 manager 正式入口..."
echo ""

echo "1. 测试正式首页"
curl -s "${OFFICIAL_URL}/" | head -10
echo ""
echo "----------------------------------------"
echo ""

echo "2. 测试正式 health"
curl -s "${OFFICIAL_URL}/health"
echo ""
echo "----------------------------------------"
echo ""

echo "3. 测试正式 dashboard-data"
curl -s "${OFFICIAL_URL}/api/dashboard-data" | head -5
echo ""
echo "----------------------------------------"
echo ""

echo "4. 旧路径说明"
echo "旧的 /baboontalkies_manager 前缀仅用于历史兼容，正式入口不再要求该前缀。"
echo ""

echo "测试完成"
