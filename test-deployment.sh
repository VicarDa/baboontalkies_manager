#!/bin/bash

DIRECT_URL="https://baboontalkies-manager-627990150052.asia-east1.run.app"
OFFICIAL_URL="https://console.woowisland.com"

echo "测试 Cloud Run 部署后的功能"
echo ""
echo "======================================"
echo ""

echo "1. 测试健康检查端点"
echo "请求: ${DIRECT_URL}/health"
HEALTH_RESPONSE=$(curl -s "${DIRECT_URL}/health")
echo "响应: $HEALTH_RESPONSE"
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo "通过"
else
    echo "失败"
fi
echo ""
echo "======================================"
echo ""

echo "2. 测试 Dashboard 数据 API"
echo "请求: ${OFFICIAL_URL}/api/dashboard-data"
API_RESPONSE=$(curl -s "${OFFICIAL_URL}/api/dashboard-data")
if echo "$API_RESPONSE" | grep -q '"success":true'; then
    STUDENT_COUNT=$(echo "$API_RESPONSE" | grep -o '"totalStudents":[0-9]*' | grep -o '[0-9]*')
    echo "API 返回成功"
    echo "  学生总数: $STUDENT_COUNT"
else
    echo "API 返回失败"
    echo "  响应: $API_RESPONSE"
fi
echo ""
echo "======================================"
echo ""

echo "3. 测试配置 API"
echo "请求: ${OFFICIAL_URL}/api/config"
CONFIG_RESPONSE=$(curl -s "${OFFICIAL_URL}/api/config")
if echo "$CONFIG_RESPONSE" | grep -q '"cny_to_pesos"'; then
    echo "配置 API 正常"
else
    echo "配置 API 失败"
fi
echo ""
echo "======================================"
echo ""

echo "4. 测试最后刷新时间 API"
echo "请求: ${OFFICIAL_URL}/api/last-refresh-time"
REFRESH_RESPONSE=$(curl -s "${OFFICIAL_URL}/api/last-refresh-time")
if echo "$REFRESH_RESPONSE" | grep -q '"success":true'; then
    echo "刷新时间 API 正常"
else
    echo "刷新时间 API 失败"
fi
echo ""
echo "======================================"
echo ""

echo "Cloud Run 验收地址如下:"
echo ""
echo "访问地址:"
echo "  正式域名: ${OFFICIAL_URL}"
echo "  直连地址: ${DIRECT_URL}"
echo ""
echo "旧入口 http://fc.pandada.world/baboontalkies_manager 已废弃，不再作为验收地址"
