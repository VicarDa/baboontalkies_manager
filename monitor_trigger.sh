#!/bin/bash
echo "📊 监控定时触发器日志..."
echo "⏰ 当前时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "🕐 下次触发应该在: 12:50"
echo ""
echo "开始监控日志 (按 Ctrl+C 停止)..."
echo "============================================"

# 每5秒检查一次新日志
while true; do
  # 获取最近的日志
  NEW_LOGS=$(s logs --tail -n 20 2>&1 | grep -E "(DEBUG|定时触发|triggerName|autoScraper|⏰)" | tail -10)
  
  if [ ! -z "$NEW_LOGS" ]; then
    clear
    echo "📊 最新日志 ($(date '+%H:%M:%S')):"
    echo "============================================"
    echo "$NEW_LOGS"
    echo "============================================"
  fi
  
  sleep 5
done
