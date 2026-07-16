# 自动部署指南

manager 的正式部署目标是 Google Cloud Run，构建配置位于 `cloudbuild.yaml`。

## 手动部署

Windows 下使用 cmd：

```bat
cmd /c npm run deploy:gcloud
```

该命令会构建镜像、推送到 Artifact Registry，并将新 revision 部署到 `asia-east1` 的 `baboontalkies-manager` 服务。

## 自动部署

在 Google Cloud Build 中为 GitHub 仓库配置触发器：

- 分支：`master`
- 配置文件：`cloudbuild.yaml`
- 项目：`project-59ee4a6b-1c4d-4d7b-a37`
- 区域：`asia-east1`

触发器使用提交内容构建；只有新 revision 健康检查通过后才会承接流量。

## 验收

```bash
curl -s https://baboontalkies.pandada.world/health
curl -s https://baboontalkies.pandada.world/api/last-refresh-time
```
