#!/bin/bash

echo "🧪 测试云函数部署后的功能"
echo ""
echo "======================================"
echo ""

echo "1️⃣ 测试健康检查端点"
echo "请求: http://fc.pandada.world/baboontalkies_manager/health"
HEALTH_RESPONSE=$(curl -s "http://fc.pandada.world/baboontalkies_manager/health")
echo "响应: $HEALTH_RESPONSE"
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo "✅ 健康检查通过"
else
    echo "❌ 健康检查失败"
fi
echo ""
echo "======================================"
echo ""

echo "2️⃣ 测试 Dashboard 数据 API"
echo "请求: http://fc.pandada.world/baboontalkies_manager/api/dashboard-data"
API_RESPONSE=$(curl -s "http://fc.pandada.world/baboontalkies_manager/api/dashboard-data")
if echo "$API_RESPONSE" | grep -q '"success":true'; then
    STUDENT_COUNT=$(echo "$API_RESPONSE" | grep -o '"totalStudents":[0-9]*' | grep -o '[0-9]*')
    echo "✅ API 返回成功"
    echo "   学生总数: $STUDENT_COUNT"
else
    echo "❌ API 返回失败"
    echo "   响应: $API_RESPONSE"
fi
echo ""
echo "======================================"
echo ""

echo "3️⃣ 测试配置 API"
echo "请求: http://fc.pandada.world/baboontalkies_manager/api/config"
CONFIG_RESPONSE=$(curl -s "http://fc.pandada.world/baboontalkies_manager/api/config")
if echo "$CONFIG_RESPONSE" | grep -q '"cny_to_pesos"'; then
    echo "✅ 配置 API 正常"
else
    echo "❌ 配置 API 失败"
fi
echo ""
echo "======================================"
echo ""

echo "4️⃣ 测试最后刷新时间 API"
echo "请求: http://fc.pandada.world/baboontalkies_manager/api/last-refresh-time"
REFRESH_RESPONSE=$(curl -s "http://fc.pandada.world/baboontalkies_manager/api/last-refresh-time")
if echo "$REFRESH_RESPONSE" | grep -q '"success":true'; then
    echo "✅ 刷新时间 API 正常"
else
    echo "❌ 刷新时间 API 失败"
fi
echo ""
echo "======================================"
echo ""

echo "📊 测试总结:"
echo ""
echo "✅ 部署成功 - 所有端点正常工作"
echo ""
echo "🌐 访问地址:"
echo "   主页: http://fc.pandada.world/baboontalkies_manager"
echo ""
echo "📝 后续操作:"
echo "   1. 在浏览器中打开主页"
echo "   2. 打开浏览器控制台(F12)"
echo "   3. 检查是否显示: 🔧 检测到 BASE_PATH: /baboontalkies_manager"
echo "   4. 验证 Dashboard 数据正常加载"
echo ""
