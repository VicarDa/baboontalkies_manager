#!/bin/bash

echo "🔍 开始监控定时触发器日志..."
echo "⏰ 当前时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "🎯 等待下一次定时触发 (每10分钟的整点: XX:00, XX:10, XX:20, XX:30, XX:40, XX:50)"
echo ""

LAST_LOG=""
CHECK_COUNT=0

while true; do
  ((CHECK_COUNT++))
  
  # 获取最新日志
  CURRENT_LOG=$(s logs --tail -n 50 2>&1 | grep -E "(DEBUG|定时触发|triggerName|FC Invoke.*RequestId: t-)" | tail -20)
  
  # 如果有新日志且与上次不同
  if [ ! -z "$CURRENT_LOG" ] && [ "$CURRENT_LOG" != "$LAST_LOG" ]; then
    echo "========================================"
    echo "📊 新日志检测到! ($(date '+%H:%M:%S'))"
    echo "========================================"
    echo "$CURRENT_LOG"
    echo ""
    
    # 检查是否有定时触发
    if echo "$CURRENT_LOG" | grep -q "RequestId: t-"; then
      echo "✅ 检测到定时触发器调用!"
      
      # 检查是否有DEBUG日志
      if echo "$CURRENT_LOG" | grep -q "DEBUG"; then
        echo "✅ 找到DEBUG日志,正在提取关键信息..."
        echo "$CURRENT_LOG" | grep "DEBUG"
        echo ""
        echo "💡 可以开始分析了!"
        break
      else
        echo "⚠️  定时触发了,但还没看到DEBUG日志,继续等待..."
      fi
    fi
    
    LAST_LOG="$CURRENT_LOG"
  fi
  
  # 每10次检查显示一次进度
  if [ $((CHECK_COUNT % 10)) -eq 0 ]; then
    echo "⏳ 检查中... (第 $CHECK_COUNT 次, $(date '+%H:%M:%S'))"
  fi
  
  sleep 3
done

echo ""
echo "🎉 监控完成!已捕获到所需日志。"
