#!/bin/bash

# 检查阿里云函数当前配置
# 需要先配置 s config add

echo "🔍 检查云函数配置..."
echo ""

# 检查 s 工具是否安装
if ! command -v s &> /dev/null; then
    echo "❌ 错误: Serverless Devs 工具未安装"
    echo "请先执行: npm install -g @serverless-devs/s"
    exit 1
fi

# 检查配置
echo "📋 当前 Serverless Devs 配置:"
s config get -a default

echo ""
echo "📦 即将部署的函数配置:"
echo "  地域: cn-hangzhou"
echo "  函数名: baboontalkies_manager-mcp"
echo "  运行环境: custom.debian10"
echo "  内存: 2048 MB"
echo "  超时: 900 秒"
echo ""

# 询问是否继续
read -p "是否继续部署? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 开始部署..."
    s deploy
else
    echo "❌ 已取消部署"
fi
