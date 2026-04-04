#!/bin/bash

for i in {1..20}; do
  sleep 30
  echo "[$i/20] 检查时间: $(date '+%H:%M:%S')"
  
  # 检查是否到了整10分钟
  MINUTE=$(date '+%M')
  if [ "$MINUTE" = "50" ] || [ "$MINUTE" = "00" ] || [ "$MINUTE" = "10" ] || [ "$MINUTE" = "20" ] || [ "$MINUTE" = "30" ] || [ "$MINUTE" = "40" ]; then
    echo "⏰ 到达触发时间点: $MINUTE 分"
    echo "等待5秒让日志更新..."
    sleep 5
    echo "正在检查日志..."
    break
  fi
done
