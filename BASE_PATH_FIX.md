# BASE_PATH 兼容说明

## 当前结论

- 正式 manager 入口已经不再要求 `/baboontalkies_manager` 路径前缀。
- 正式访问地址应使用:
  - `https://baboontalkies.pandada.world`
  - `https://baboontalkies-manager-627990150052.asia-east1.run.app`

## 为什么仓库里还保留 BASE_PATH 逻辑

- 历史上阿里云函数计算入口使用过 `/baboontalkies_manager` 前缀。
- 为了兼容旧书签、旧脚本和旧页面，前端仍会识别该前缀。
- 当前代码还额外加入了旧入口自动跳转，会把:
  - `fc.pandada.world`
  - `/baboontalkies_manager/*`
  自动重定向到正式入口。

## 推荐验证方式

1. 访问正式首页:
   `https://baboontalkies.pandada.world`
2. 验证健康检查:
   `curl -s https://baboontalkies.pandada.world/health`
3. 验证数据接口:
   `curl -s https://baboontalkies.pandada.world/api/dashboard-data`

## 历史入口说明

- `http://fc.pandada.world/baboontalkies_manager` 已废弃。
- 文档、脚本或截图里若再出现该地址，只能作为历史背景参考。
