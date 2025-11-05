#!/bin/bash

# 测试自定义域名访问

echo "🔍 测试自定义域名访问..."
echo ""

echo "1️⃣ 测试健康检查 (自定义域名):"
curl -s "http://fc.pandada.world/baboontalkies_manager/health" | jq . || echo "❌ 失败"
echo ""

echo "2️⃣ 测试健康检查 (系统URL):"
curl -s "https://baboontager-mcp-cpjvwkqddf.cn-hangzhou.fcapp.run/health" | jq . || echo "❌ 失败"
echo ""

echo "3️⃣ DNS解析检查:"
dig fc.pandada.world +short
echo ""

echo "4️⃣ 路径测试 (带路径):"
curl -I "http://fc.pandada.world/baboontalkies_manager/" 2>&1 | grep "HTTP\|Location"
echo ""

echo "5️⃣ 路径测试 (不带路径):"
curl -I "http://fc.pandada.world/" 2>&1 | grep "HTTP\|Location"
