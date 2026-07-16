# Current Deployment

`baboontalkies_manager` 当前正式部署目标为 Google Cloud Run。

## 正式入口

- 正式域名: `https://baboontalkies.pandada.world`
- 兼容域名: `https://console.woowisland.com`
- Cloud Run 服务: `baboontalkies-manager`
- Google Cloud 项目: `project-59ee4a6b-1c4d-4d7b-a37`
- 区域: `asia-east1`
- 直连地址: `https://baboontalkies-manager-627990150052.asia-east1.run.app`

## 部署

Windows 下通过 cmd 执行：

```bat
cmd /c npm run deploy:gcloud
```

Cloud Run 构建使用根目录 `Dockerfile` 复用已验证的 Python/Playwright 运行时基座，避免重新生成无法导入的超大 Python 层。修改 `src/python/requirements-marker.txt` 时，构建会明确失败；此时需要先刷新并验证运行时基座。

## 验收

```bash
curl -s https://baboontalkies.pandada.world/health
curl -s https://baboontalkies.pandada.world/api/last-refresh-time
curl -s https://console.woowisland.com/health
```
