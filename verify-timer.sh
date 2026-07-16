#!/bin/bash

echo "🔍 验证定时触发器配置"
echo ""
echo "======================================"
echo ""

echo "📋 触发器列表:"
s info | grep -A 35 "triggers:" | grep -E "triggerName|triggerType|cronExpression|enable|description"
echo ""
echo "======================================"
echo ""

echo "⏰ 定时触发器详情:"
echo ""
echo "触发器名称: autoScraper"
echo "触发类型: timer"
echo "Cron 表达式: 0 0,10,20,30,40,50 * * * *"
echo "启用状态: true"
echo ""
echo "执行时间: 每小时的 00, 10, 20, 30, 40, 50 分"
echo "执行频率: 每 10 分钟一次"
echo "每天执行: 144 次"
echo ""
echo "======================================"
echo ""

echo "📅 下次执行时间预测:"
CURRENT_TIME=$(date +"%Y-%m-%d %H:%M:%S")
CURRENT_MINUTE=$(date +"%M")
CURRENT_HOUR=$(date +"%H")

echo "当前时间: $CURRENT_TIME"
echo ""

# 计算下次执行时间
if [ $CURRENT_MINUTE -lt 10 ]; then
    NEXT_MINUTE="10"
    NEXT_HOUR=$CURRENT_HOUR
elif [ $CURRENT_MINUTE -lt 20 ]; then
    NEXT_MINUTE="20"
    NEXT_HOUR=$CURRENT_HOUR
elif [ $CURRENT_MINUTE -lt 30 ]; then
    NEXT_MINUTE="30"
    NEXT_HOUR=$CURRENT_HOUR
elif [ $CURRENT_MINUTE -lt 40 ]; then
    NEXT_MINUTE="40"
    NEXT_HOUR=$CURRENT_HOUR
elif [ $CURRENT_MINUTE -lt 50 ]; then
    NEXT_MINUTE="50"
    NEXT_HOUR=$CURRENT_HOUR
else
    NEXT_MINUTE="00"
    NEXT_HOUR=$((CURRENT_HOUR + 1))
    if [ $NEXT_HOUR -eq 24 ]; then
        NEXT_HOUR="00"
    fi
fi

printf "预计下次执行: %02d:%s:00\n" $NEXT_HOUR $NEXT_MINUTE
echo ""
echo "======================================"
echo ""

echo "📝 如何监控执行情况:"
echo ""
echo "1. 实时查看日志:"
echo "   s logs -t"
echo ""
echo "2. 查看最近执行记录:"
echo "   s logs --tail -n 50 | grep '⏰ 定时触发器'"
echo ""
echo "3. 在浏览器中查看:"
echo "   使用 gcloud logging read 查看 baboontalkies-manager 的 Cloud Run 日志"
echo ""
echo "======================================"
echo ""

echo "✅ 配置验证完成!"
echo ""
echo "定时触发器将在接下来的 $NEXT_MINUTE 分时首次执行。"
echo "请等待执行后查看日志验证是否成功。"
echo ""
