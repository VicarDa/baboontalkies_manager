# Current Deployment

`baboontalkies_manager` 当前正式入口已经统一到 Google Cloud Run。

## 当前正式入口

- 正式自定义域名: `https://console.woowisland.com`
- Cloud Run 直连地址: `https://baboontalkies-manager-627990150052.asia-east1.run.app`
- Cloud Run 区域: `asia-east1`

## 当前状态

- `https://console.woowisland.com` 当前已经指向 `baboontalkies_manager`
- 根路径会重定向到 `/students`
- `/teacher` 会由 `baboontalkies_manager` 处理

## 遗留入口

- `http://fc.pandada.world/baboontalkies_manager` 是历史阿里云函数计算入口
- 该入口不再视为正式生产入口，后续排查、验收、联调都不应再以它为准

## 推荐验收命令

```bash
curl -s https://console.woowisland.com/health
curl -s https://console.woowisland.com/api/last-refresh-time
curl -s https://baboontalkies-manager-627990150052.asia-east1.run.app/health
curl -s https://baboontalkies-manager-627990150052.asia-east1.run.app/api/last-refresh-time
```

## 说明

- 如果需要查看 Cloud Run 控制面信息，先在本机登录 `gcloud`
- 如果要彻底下线老的阿里云入口，需要到阿里云函数计算/自定义域名配置中移除对应映射
