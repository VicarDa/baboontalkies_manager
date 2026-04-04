# 刷新触发配置指南

## 当前正式入口

- 正式域名: `https://baboontalkies.pandada.world`
- Cloud Run 服务: `baboontalkies-manager`
- 区域: `asia-east1`

## 当前常用触发接口

### 1. 刷新 manager 数据

```bash
curl -X POST https://baboontalkies.pandada.world/api/refresh-data
```

### 2. 查看最近刷新时间

```bash
curl -s https://baboontalkies.pandada.world/api/last-refresh-time
```

### 3. 触发远程抓取服务

```bash
curl -X POST https://baboontalkies.pandada.world/api/trigger-remote-scrape
```

## 远程抓取链路

- 后端默认会调用 `REMOTE_SCRAPER_URL`
- 当前代码默认值为:
  `https://s4.s100.vip:3868/trigger-scrape`

## 历史入口说明

- `http://fc.pandada.world/baboontalkies_manager` 是历史阿里云入口，现已废弃。
- 不要再把旧地址当作 trigger 验证入口。
