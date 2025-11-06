#!/bin/bash
echo "正在获取最近的日志..."
timeout 15 s logs --tail -n 100 2>&1 | grep -E "(定时触发|抓取|错误|失败|成功|课程会话|会员卡|数据库)" | tail -50
