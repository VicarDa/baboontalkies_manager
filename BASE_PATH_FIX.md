# BASE_PATH 自动检测功能说明

## 问题描述

当应用部署到阿里云函数计算并使用自定义域名路径(如 `http://fc.pandada.world/baboontalkies_manager`)时,前端的 API 调用路径不正确,导致 404 错误。

**错误示例:**
- 请求: `http://fc.pandada.world/api/dashboard-data`
- 正确应该是: `http://fc.pandada.world/baboontalkies_manager/api/dashboard-data`

## 解决方案

在 `dashboard.html` 中添加自动 BASE_PATH 检测功能,使应用能够:
- **云函数环境**: 自动检测并使用 `/baboontalkies_manager` 前缀
- **本地开发环境**: 不使用任何前缀

## 实现细节

### 1. BASE_PATH 自动检测逻辑

```javascript
// 自动检测 BASE_PATH
const BASE_PATH = (() => {
    const path = window.location.pathname;
    // 如果路径包含 /baboontalkies_manager，则使用它作为 BASE_PATH
    if (path.includes('/baboontalkies_manager')) {
        return '/baboontalkies_manager';
    }
    // 否则使用空字符串（本地开发环境）
    return '';
})();

console.log('🔧 检测到 BASE_PATH:', BASE_PATH || '(空 - 本地开发)');
```

### 2. 所有 API 调用已更新

已更新的 API 端点:
1. `/api/dashboard-data` → `${BASE_PATH}/api/dashboard-data`
2. `/api/refresh-data` → `${BASE_PATH}/api/refresh-data`
3. `/api/last-refresh-time` → `${BASE_PATH}/api/last-refresh-time`
4. `/api/config` (GET/POST) → `${BASE_PATH}/api/config`
5. `/api/teachers-list` → `${BASE_PATH}/api/teachers-list`
6. `/api/salary-calculate` → `${BASE_PATH}/api/salary-calculate`
7. `/api/student-schedule/:name` → `${BASE_PATH}/api/student-schedule/:name`

### 3. 后端路径重写中间件

后端 (`src/index.js`) 已配置路径重写中间件:

```javascript
const basePath = process.env.BASE_PATH || '';

if (basePath) {
  this.app.use((req, res, next) => {
    if (req.path.startsWith(basePath)) {
      req.url = req.url.substring(basePath.length) || '/';
      console.log(`📝 路径重写: ${basePath}${req.path} → ${req.url}`);
    }
    next();
  });
}
```

## 环境配置

### 云函数环境变量 (s.yaml)

```yaml
environmentVariables:
  NODE_ENV: production
  PORT: "9000"
  HTTPS: "false"
  BASE_PATH: "/baboontalkies_manager"
```

### 日志配置

```yaml
logConfig: auto
```

## 访问路径

### 云函数自定义域名
- 主页: `http://fc.pandada.world/baboontalkies_manager`
- 健康检查: `http://fc.pandada.world/baboontalkies_manager/health`
- API: `http://fc.pandada.world/baboontalkies_manager/api/dashboard-data`

### 本地开发
- 主页: `http://localhost:3000`
- 健康检查: `http://localhost:3000/health`
- API: `http://localhost:3000/api/dashboard-data`

## 兼容性

- ✅ 云函数环境(带路径前缀)
- ✅ 本地开发环境(无路径前缀)
- ✅ 所有 API 端点
- ✅ 静态资源(HTML/CSS/JS)
- ✅ 日志服务配置

## 测试方法

1. **本地测试:**
   ```bash
   npm run dashboard
   # 访问 http://localhost:3000
   # 浏览器控制台应显示: 🔧 检测到 BASE_PATH: (空 - 本地开发)
   ```

2. **云函数测试:**
   ```bash
   # 提交代码到 Gitee，等待自动部署完成后
   curl http://fc.pandada.world/baboontalkies_manager/health
   # 应返回: {"status":"ok","timestamp":"..."}

   curl http://fc.pandada.world/baboontalkies_manager/api/dashboard-data
   # 应返回完整的学生数据 JSON
   ```

3. **浏览器测试:**
   - 访问: `http://fc.pandada.world/baboontalkies_manager`
   - 打开浏览器控制台(F12)
   - 应该看到: `🔧 检测到 BASE_PATH: /baboontalkies_manager`
   - 检查 Network 标签页,所有 API 请求应该使用正确的路径

## 部署步骤

1. 提交代码到 Gitee:
   ```bash
   git add dashboard.html s.yaml
   git commit -m "添加 BASE_PATH 自动检测和日志配置"
   git push
   ```

2. 等待云函数自动部署(约 2-3 分钟)

3. 验证部署结果:
   - 访问自定义域名
   - 检查浏览器控制台日志
   - 测试各项功能

## 故障排查

### 问题: 仍然出现 404 错误

**检查项:**
1. 浏览器控制台是否显示正确的 BASE_PATH
2. Network 标签中的请求 URL 是否正确
3. 云函数日志中是否有路径重写日志

### 问题: 日志不显示

**解决方案:**
1. 确认已添加日志服务权限 (`AliyunLogFullAccess`)
2. 检查 `s.yaml` 中是否包含 `logConfig: auto`
3. 等待部署完成后,在阿里云控制台查看日志

### 问题: 本地开发无法访问

**检查项:**
1. 确认 BASE_PATH 检测返回空字符串
2. 检查 `src/index.js` 中是否正确处理空 basePath
3. 确认本地没有设置 `BASE_PATH` 环境变量

## 更新历史

- 2025-11-06: 添加 BASE_PATH 自动检测功能
- 2025-11-06: 更新所有 API 调用以使用 BASE_PATH
- 2025-11-06: 添加日志服务配置
