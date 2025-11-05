# 阿里云函数计算 (FunctionAI) 部署指南

## 一、前置准备

### 1. 安装 Serverless Devs 工具

```bash
npm install -g @serverless-devs/s
```

### 2. 配置阿里云账号

```bash
s config add
```

按提示输入:
- AccountID: 你的阿里云账号ID
- AccessKeyID: 访问密钥ID
- AccessKeySecret: 访问密钥Secret
- 配置别名: 输入 `default`

> 💡 AccessKey 可在阿里云控制台 -> AccessKey管理 获取

## 二、部署步骤

### 方式1: 使用 Serverless Devs 自动部署 (推荐)

```bash
# 1. 在项目目录下执行部署
s deploy

# 2. 部署完成后会显示函数的访问地址
# 示例: https://xxxxx.cn-hangzhou.fc.aliyuncs.com
```

### 方式2: 手动在阿里云控制台配置

1. **进入函数计算控制台**
   - 打开你创建的 `baboontalkies_manager-mcp` 函数

2. **配置基本信息**
   - 运行环境: `Custom Runtime` (自定义运行时)
   - 系统镜像: `Debian 10`
   - 内存: `2048 MB`
   - 超时时间: `900 秒`
   - 磁盘空间: `10240 MB`

3. **配置启动命令**
   - 启动文件: `bootstrap`
   - 或命令: `node index.mjs`

4. **配置环境变量**
   ```
   NODE_ENV=production
   PORT=9000
   HTTPS=false
   ```

5. **上传代码**
   - 方式A: 压缩整个项目目录(排除 node_modules),上传 zip 文件
   - 方式B: 使用 OSS 存储代码包
   - 方式C: 使用容器镜像方式

6. **配置 HTTP 触发器**
   - 触发器类型: HTTP 触发器
   - 认证方式: anonymous (匿名访问)
   - 请求方式: GET, POST, PUT, DELETE

## 三、需要上传的文件列表

```
baboontalkies_manager/
├── src/
│   └── index.js           # 核心业务代码
├── ssl/                   # SSL证书目录(可选,云函数用HTTP)
├── dashboard.html         # Dashboard前端页面
├── index.mjs              # 云函数入口文件(新增)
├── bootstrap              # 自定义运行时启动脚本(新增)
├── s.yaml                 # Serverless Devs配置(新增)
├── package.json           # npm依赖配置
├── package-lock.json      # 依赖锁定文件
└── README.md              # 说明文档
```

> ⚠️ **不要上传**: node_modules, .git, check_mysql_data.py, *.xlsx, .DS_Store

## 四、打包代码

如果需要手动打包上传:

```bash
# 创建部署包(排除不必要的文件)
zip -r deploy.zip \
  src/ \
  ssl/ \
  dashboard.html \
  index.mjs \
  bootstrap \
  package.json \
  package-lock.json \
  -x "*.git*" "node_modules/*" "*.xlsx" "*.py" "*.DS_Store"
```

## 五、访问应用

部署完成后:

1. **获取函数URL**
   - 在函数详情页 -> 触发器管理 -> 复制 HTTP 触发器的公网访问地址
   - 格式: `https://xxxxx.cn-hangzhou.fc.aliyuncs.com`

2. **访问 Dashboard**
   - 浏览器打开函数URL
   - 或访问: `函数URL/api/dashboard-data` 查看API数据

3. **主要接口**
   - `/` - Dashboard主页
   - `/api/dashboard-data` - 仪表板数据
   - `/api/config` - 汇率配置(GET/POST)
   - `/api/student-schedule/:studentName` - 学生排课日历
   - `/health` - 健康检查

## 六、常见问题

### 1. 函数启动失败: "no such file or directory"
**原因**: 启动命令配置错误
**解决**:
- 检查 s.yaml 中的 `customRuntimeConfig.command` 是否为 `node`
- 确保 `bootstrap` 文件有执行权限: `chmod +x bootstrap`

### 2. Playwright 浏览器启动失败
**原因**: 缺少系统依赖
**解决**:
- 使用 FunctionAI 选择带 Playwright 的运行时
- 或在 bootstrap 中添加: `playwright install chromium --with-deps`

### 3. 内存不足 (OOM)
**原因**: Playwright 需要较多内存
**解决**:
- 调整函数内存到 2048MB 或更高
- 在 s.yaml 中修改 `memorySize: 2048`

### 4. 数据库连接失败
**原因**: VPC 网络配置或数据库白名单
**解决**:
- 在函数配置中添加 VPC 配置,与数据库在同一VPC
- 或在数据库白名单中添加函数的公网IP

### 5. 超时错误
**原因**: 爬虫操作耗时较长
**解决**:
- 增加函数超时时间到 900 秒
- 在 s.yaml 中设置 `timeout: 900`

## 七、监控和日志

### 查看日志
```bash
# 实时查看函数日志
s logs -t

# 查看最近日志
s logs
```

### 在控制台查看
- 函数详情页 -> 调用日志
- 查看函数执行情况、错误信息、性能指标

## 八、更新代码

```bash
# 修改代码后重新部署
s deploy

# 仅更新函数代码(不更新配置)
s deploy --type code
```

## 九、环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| NODE_ENV | 运行环境 | production |
| PORT | 服务端口 | 9000 |
| HTTPS | 是否使用HTTPS | false |
| FC_SERVER_PORT | FC内部端口 | 由平台设置 |

## 十、性能优化建议

1. **预留实例**: 设置预留实例避免冷启动
2. **单实例并发**: 设置为1,避免资源竞争
3. **异步调用**: 数据抓取操作使用异步调用
4. **缓存优化**: 利用磁盘空间缓存浏览器数据

---

## 技术支持

如遇问题,请检查:
1. 函数日志: 查看详细错误信息
2. 配置文件: 确保 s.yaml 配置正确
3. 依赖安装: 确保 node_modules 正确安装
4. 网络连接: 确保可访问目标网站和数据库

更多信息请参考:
- [阿里云函数计算文档](https://help.aliyun.com/product/50980.html)
- [Serverless Devs文档](https://www.serverless-devs.com/)
