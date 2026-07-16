# 自动抓取配置

manager 运行在 Google Cloud Run：

- 服务：`baboontalkies-manager`
- 区域：`asia-east1`
- 正式入口：`https://baboontalkies.pandada.world`

## 检查服务

```bash
curl -s https://baboontalkies.pandada.world/health
curl -s https://baboontalkies.pandada.world/api/last-refresh-time
```

## 手动触发

```bash
curl -X POST https://baboontalkies.pandada.world/api/refresh-data
curl -X POST https://baboontalkies.pandada.world/api/trigger-remote-scrape
```

自动任务异常时，先检查 Cloud Run revision 状态和 Cloud Logging。
