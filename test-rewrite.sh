#!/bin/bash

echo "🔧 测试路径重写配置..."
echo ""
echo "等待配置生效..."
sleep 5
echo ""

echo "1️⃣ 测试: /baboontalkies_manager"
echo "预期: 返回 Dashboard 首页 HTML"
curl -s "http://fc.pandada.world/baboontalkies_manager" | head -10
echo ""
echo "----------------------------------------"
echo ""

echo "2️⃣ 测试: /baboontalkies_manager/"
echo "预期: 返回 Dashboard 首页 HTML"
curl -s "http://fc.pandada.world/baboontalkies_manager/" | head -10
echo ""
echo "----------------------------------------"
echo ""

echo "3️⃣ 测试: /baboontalkies_manager/health"
echo "预期: 返回 {\"status\":\"ok\"...}"
curl -s "http://fc.pandada.world/baboontalkies_manager/health"
echo ""
echo "----------------------------------------"
echo ""

echo "4️⃣ 测试: /baboontalkies_manager/api/dashboard-data"
echo "预期: 返回 JSON 数据"
curl -s "http://fc.pandada.world/baboontalkies_manager/api/dashboard-data" | head -5
echo ""
echo "----------------------------------------"
echo ""

echo "✅ 测试完成!"
echo ""
echo "如果所有测试都返回正确结果,说明路径重写配置成功!"
