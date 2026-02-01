# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

约课宝数据管理系统 - 用于抓取和管理在线课程预约平台数据的 MCP 服务器，集成 Web Dashboard 进行数据可视化和管理。

## Key Commands

```bash
# 本地开发
npm run dashboard-http          # 启动 HTTP 服务器 (默认端口 3000)
PORT=5001 npm run dashboard-http # 指定端口启动

# Google Cloud Run 部署
gcloud run deploy baboontalkies-manager \
  --source . \
  --region asia-east1 \
  --platform managed \
  --allow-unauthenticated

# 或通过 Cloud Build 自动部署（推荐）
gcloud builds submit --config cloudbuild.yaml

# 查看日志
gcloud run logs read baboontalkies-manager --region asia-east1 --limit 50

# 测试
npm test                        # 运行完整抓取测试
```

## Architecture

### Core Files

- **src/index.js** - 主服务器，包含 Express API 和 Playwright 爬虫逻辑
- **dashboard.html** - 前端单页应用，包含所有 CSS 和 JavaScript
- **Dockerfile** - Docker 容器构建配置
- **cloudbuild.yaml** - Google Cloud Build 部署配置
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

## Deployment (Google Cloud Run)

应用部署在 Google Cloud Run，数据库使用阿里云 RDS（跨云架构）。

**部署配置**：
```yaml
# cloudbuild.yaml 关键配置
region: asia-east1 (台湾)
platform: managed
memory: 2Gi
cpu: 1
timeout: 900s
port: 9000
```

**自动部署**：
- 通过 Cloud Build 触发器自动部署
- 或手动执行：`gcloud builds submit --config cloudbuild.yaml`

**访问地址**：
- Cloud Run 自动分配的 URL（通过 gcloud run services describe 查看）

**跨云连接**：
- 云函数：Google Cloud Run（台湾区域）
- 数据库：阿里云 RDS（杭州区域）
- 连接方式：公网访问（需确保 RDS 白名单配置正确）

## Data Scraping

数据抓取范围：
- **往前**: 3周
- **往后**: 3个月

抓取流程: 登录 → 滑块验证码 → 课程数据 → 会员卡数据 → 保存数据库

## Development Notes

- 用中文交互
- 不自动 push 或 commit 代码
- 数据库中禁用外键
- 部署到 Google Cloud Run：`gcloud builds submit --config cloudbuild.yaml`