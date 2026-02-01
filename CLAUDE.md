# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

约课宝数据管理系统 - 用于抓取和管理在线课程预约平台数据的 MCP 服务器，集成 Web Dashboard 进行数据可视化和管理。

## Key Commands

```bash
# 本地开发
npm run dashboard-http          # 启动 HTTP 服务器 (默认端口 3000)
PORT=5001 npm run dashboard-http # 指定端口启动

# 阿里云部署
s deploy -y                     # 部署到阿里云 FC
s info                          # 查看部署信息
s logs --tail -n 50             # 查看日志

# 测试
npm test                        # 运行完整抓取测试
```

## Architecture

### Core Files

- **src/index.js** - 主服务器，包含 Express API 和 Playwright 爬虫逻辑
- **dashboard.html** - 前端单页应用，包含所有 CSS 和 JavaScript
- **s.yaml** - 阿里云 Serverless Devs 部署配置
- **index.mjs** - 云函数入口点

### Database Tables (MySQL)

- `yuekebao_classtime` - 课程时间表数据
- `yuekebao_student_cardnum` - 学员会员卡数据
- `yuekebao_config` - 系统配置（汇率等）

### API Endpoints

| 端点 | 描述 |
|------|------|
| `/api/dashboard-data` | 获取仪表板汇总数据 |
| `/api/teacher-stats` | 老师课时统计 |
| `/api/student-schedule/:name` | 学员排课日历 |
| `/api/config` | 汇率配置 (GET/POST) |
| `/api/last-refresh-time` | 最后刷新时间和数据范围 |
| `/api/refresh-data` | 触发数据刷新 (POST) |
| `/health` | 健康检查 |

### Dashboard Tabs

1. **学员数据** - 学员课时统计表格，支持排序、筛选、点击查看排课日历
2. **老师数据** - 按老师或日期分组的课时统计
3. **工资计算** - 根据课时和汇率计算工资
4. **系统设置** - 汇率配置、老师管理

## Deployment (Alibaba Cloud FC)

**注意**: GitHub/Gitee 提交不会自动部署，需手动执行 `s deploy -y`

```yaml
# s.yaml 关键配置
runtime: custom.debian10
memory: 4096 MB
timeout: 900s
BASE_PATH: /baboontalkies_manager
```

访问地址: `http://fc.pandada.world/baboontalkies_manager`

## Data Scraping

数据抓取范围：
- **往前**: 3周
- **往后**: 3个月

抓取流程: 登录 → 滑块验证码 → 课程数据 → 会员卡数据 → 保存数据库

## Development Notes

- 用中文交互
- 不自动 push 或 commit 代码
- 数据库中禁用外键
- 输入"部署"执行: `git add . && git commit -m "自动提交" && s deploy -y`