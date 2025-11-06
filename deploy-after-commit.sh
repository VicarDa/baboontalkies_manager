#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 自动部署脚本"
echo "================================"
echo ""

# 检查是否有未提交的更改
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  检测到未提交的更改${NC}"
    echo ""
    git status -s
    echo ""

    # 询问是否要提交
    read -p "是否要提交这些更改? (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        read -p "请输入提交信息: " COMMIT_MSG

        if [ -z "$COMMIT_MSG" ]; then
            COMMIT_MSG="更新代码"
        fi

        echo ""
        echo "📝 添加文件..."
        git add .

        echo "💾 提交更改..."
        git commit -m "$COMMIT_MSG"

        echo "⬆️  推送到远程仓库..."
        git push

        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ 推送失败${NC}"
            exit 1
        fi

        echo -e "${GREEN}✅ 代码已推送到 Gitee${NC}"
    else
        echo -e "${YELLOW}⏭️  跳过提交，仅部署${NC}"
    fi
else
    echo -e "${GREEN}✅ 工作目录干净，没有未提交的更改${NC}"
fi

echo ""
echo "================================"
echo "🔄 开始部署到阿里云函数计算..."
echo "================================"
echo ""

# 部署到阿里云
s deploy -y

if [ $? -eq 0 ]; then
    echo ""
    echo "================================"
    echo -e "${GREEN}🎉 部署成功！${NC}"
    echo "================================"
    echo ""

    # 显示部署信息
    echo "📊 部署信息:"
    s info | head -20

    echo ""
    echo "🌐 访问地址:"
    echo "  主页: http://fc.pandada.world/baboontalkies_manager"
    echo "  健康检查: http://fc.pandada.world/baboontalkies_manager/health"
    echo ""

    # 测试健康检查
    echo "🔍 测试健康检查..."
    HEALTH_RESPONSE=$(curl -s "http://fc.pandada.world/baboontalkies_manager/health")

    if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
        echo -e "${GREEN}✅ 健康检查通过${NC}"
        echo "   响应: $HEALTH_RESPONSE"
    else
        echo -e "${YELLOW}⚠️  健康检查响应异常${NC}"
        echo "   响应: $HEALTH_RESPONSE"
    fi

    echo ""
    echo "📝 查看日志: s logs --tail -n 20"
    echo ""
else
    echo ""
    echo -e "${RED}❌ 部署失败${NC}"
    echo "请检查错误信息并重试"
    exit 1
fi
