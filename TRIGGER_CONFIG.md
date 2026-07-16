# 抓取触发配置

正式服务：`https://baboontalkies.pandada.world`

## 手动刷新

```bash
curl -X POST https://baboontalkies.pandada.world/api/refresh-data
```

## 触发远程抓取

```bash
curl -X POST https://baboontalkies.pandada.world/api/trigger-remote-scrape
```

## 查看最后刷新时间

```bash
curl -s https://baboontalkies.pandada.world/api/last-refresh-time
```

如需定时执行，使用 Google Cloud Scheduler 调用相应 HTTPS 端点，并在 Cloud Logging 中检查结果。
