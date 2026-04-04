# 自动抓取配置说明

## 当前正式入口

- 正式域名: `https://baboontalkies.pandada.world`
- Cloud Run 直连: `https://baboontalkies-manager-627990150052.asia-east1.run.app`
- Cloud Run 服务: `baboontalkies-manager`
- 区域: `asia-east1`

## 历史入口说明

- `http://fc.pandada.world/baboontalkies_manager` 已退为历史阿里云入口。
- 该地址不再作为数据刷新、验收或日常排障入口。
- 如果仍看到旧地址，只能视为历史资料，不能代表当前线上环境。

## 建议检查项

1. 检查服务健康状态:
   `curl -s https://baboontalkies.pandada.world/health`
2. 检查最近刷新时间:
   `curl -s https://baboontalkies.pandada.world/api/last-refresh-time`
3. 手动触发刷新:
   `curl -X POST https://baboontalkies.pandada.world/api/refresh-data`

## 备注

- 如果刷新失败，优先检查 Cloud Run 日志，而不是旧阿里云函数日志。
- 如果需要排查远程抓取链路，再检查 `REMOTE_SCRAPER_URL` 指向的本地抓取服务是否可用。
