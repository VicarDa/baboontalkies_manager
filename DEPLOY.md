# Google Cloud Run 部署指南

## 部署目标

- Google Cloud 项目：`project-59ee4a6b-1c4d-4d7b-a37`
- Cloud Run 服务：`baboontalkies-manager`
- 区域：`asia-east1`
- 端口：`9000`
- 正式域名：`https://baboontalkies.pandada.world`

## 前置条件

```bat
gcloud auth login
gcloud config set project project-59ee4a6b-1c4d-4d7b-a37
```

## 部署

Windows 下使用 cmd：

```bat
cmd /c npm run deploy:gcloud
```

构建流程使用根目录 `Dockerfile`、Artifact Registry 和 `cloudbuild.yaml`。Python 依赖清单变化时，构建会停止并要求先刷新运行时基座。

## 查看状态

```bat
gcloud run services describe baboontalkies-manager --region asia-east1
gcloud run revisions list --service baboontalkies-manager --region asia-east1
```

## 验收

```bash
curl -s https://baboontalkies.pandada.world/health
curl -s https://console.woowisland.com/health
```
