#!/bin/bash

echo "🔍 测试域名路径配置..."
echo ""

echo "1️⃣ 测试: http://fc.pandada.world/baboontalkies_manager"
curl -s -o /dev/null -w "状态码: %{http_code}\n" "http://fc.pandada.world/baboontalkies_manager"
echo ""

echo "2️⃣ 测试: http://fc.pandada.world/baboontalkies_manager/"
curl -s -o /dev/null -w "状态码: %{http_code}\n" "http://fc.pandada.world/baboontalkies_manager/"
echo ""

echo "3️⃣ 测试: http://fc.pandada.world/baboontalkies_manager/health"
curl -s "http://fc.pandada.world/baboontalkies_manager/health"
echo ""
echo ""

echo "4️⃣ 测试: http://fc.pandada.world/health"
curl -s "http://fc.pandada.world/health"
echo ""
echo ""

echo "5️⃣ 测试: http://fc.pandada.world/"
curl -s -o /dev/null -w "状态码: %{http_code}\n" "http://fc.pandada.world/"
echo ""

echo "✅ 测试完成"
