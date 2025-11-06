# 阿里云函数计算触发器配置指南

## 当前触发器配置

目前工程已配置 **HTTP 触发器**,用于接收 Web 请求。

```yaml
triggers:
  - triggerName: httpTrigger
    triggerType: http
    description: "HTTP触发器 - Dashboard访问"
    qualifier: LATEST
    triggerConfig:
      authType: anonymous      # 匿名访问,无需鉴权
      disableURLInternet: false  # 启用公网访问
      methods:
        - GET
        - POST
        - PUT
        - DELETE
```

**访问地址:**
- 公网: https://baboontager-mcp-cpjvwkqddf.cn-hangzhou.fcapp.run
- 自定义域名: http://fc.pandada.world/baboontalkies_manager

---

## 常用触发器类型

### 1. 定时触发器 (Timer Trigger)

**用途:** 定期自动执行任务(如每天自动抓取数据)

**配置方法 A: 在 s.yaml 中添加**

```yaml
resources:
  baboontalkies_manager:
    component: fc3
    props:
      # ... 其他配置 ...

      triggers:
        # 保留现有的 HTTP 触发器
        - triggerName: httpTrigger
          triggerType: http
          description: "HTTP触发器 - Dashboard访问"
          qualifier: LATEST
          triggerConfig:
            authType: anonymous
            disableURLInternet: false
            methods:
              - GET
              - POST
              - PUT
              - DELETE

        # 新增定时触发器
        - triggerName: timerTrigger
          triggerType: timer
          description: "定时触发器 - 每天凌晨2点抓取数据"
          qualifier: LATEST
          triggerConfig:
            cronExpression: "0 0 2 * * *"  # Cron 表达式
            enable: true
            payload: '{"action":"auto-scrape"}'  # 传递给函数的参数
```

**Cron 表达式格式:** `秒 分 时 日 月 星期`

**常用示例:**
```bash
# 每天凌晨2点执行
0 0 2 * * *

# 每小时执行一次
0 0 * * * *

# 每30分钟执行一次
0 */30 * * * *

# 每周一上午9点执行
0 0 9 * * MON

# 每月1号凌晨3点执行
0 0 3 1 * *

# 工作日(周一到周五)早上8点执行
0 0 8 * * MON-FRI
```

**配置方法 B: 通过控制台配置**

1. 登录阿里云函数计算控制台
2. 进入函数 `baboontalkies_manager-mcp`
3. 点击"触发器"标签
4. 点击"创建触发器"
5. 选择触发器类型: **定时触发器**
6. 填写配置:
   - 触发器名称: `dailyScraper`
   - Cron 表达式: `0 0 2 * * *`
   - 触发消息: `{"action":"auto-scrape"}`
7. 点击"确定"

**在代码中处理定时触发:**

修改 `index.mjs`:

```javascript
// 检测触发来源
if (event && event.triggerName === 'timerTrigger') {
  console.log('⏰ 定时触发器触发:', event.payload);

  // 执行数据抓取
  const result = await server.scrapeYuekebaoCourses();

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      message: '定时抓取完成',
      result: result
    })
  };
}
```

---

### 2. OSS 触发器

**用途:** 当 OSS 存储桶有文件上传/删除时自动触发

```yaml
triggers:
  - triggerName: ossTrigger
    triggerType: oss
    description: "OSS触发器 - 文件上传时处理"
    qualifier: LATEST
    triggerConfig:
      bucketName: "your-bucket-name"
      events:
        - oss:ObjectCreated:*  # 文件创建事件
        - oss:ObjectRemoved:*  # 文件删除事件
      filter:
        prefix: "uploads/"     # 只监听 uploads/ 目录
        suffix: ".xlsx"        # 只监听 Excel 文件
```

---

### 3. MNS 主题触发器

**用途:** 消息队列触发

```yaml
triggers:
  - triggerName: mnsTrigger
    triggerType: mns_topic
    description: "MNS主题触发器"
    qualifier: LATEST
    triggerConfig:
      topicName: "your-topic-name"
      region: "cn-hangzhou"
      notifyContentFormat: "JSON"
      notifyStrategy: "BACKOFF_RETRY"
```

---

### 4. 表格存储触发器

**用途:** 表格存储数据变更时触发

```yaml
triggers:
  - triggerName: tableStoreTrigger
    triggerType: tablestore
    description: "表格存储触发器"
    qualifier: LATEST
    triggerConfig:
      instanceName: "your-instance-name"
      tableName: "your-table-name"
```

---

### 5. CDN 事件触发器

**用途:** CDN 刷新完成时触发

```yaml
triggers:
  - triggerName: cdnTrigger
    triggerType: cdn_events
    description: "CDN事件触发器"
    qualifier: LATEST
    triggerConfig:
      eventName: "LogFileCreated"
      eventVersion: "1.0.0"
      notes: "CDN日志创建时触发"
```

---

## 针对本项目的推荐配置

### 场景 1: 定时自动抓取数据

**需求:** 每天凌晨2点自动抓取约课宝数据

**配置步骤:**

1. **更新 s.yaml:**

```yaml
triggers:
  - triggerName: httpTrigger
    triggerType: http
    description: "HTTP触发器 - Dashboard访问"
    qualifier: LATEST
    triggerConfig:
      authType: anonymous
      disableURLInternet: false
      methods:
        - GET
        - POST
        - PUT
        - DELETE

  - triggerName: dailyScraper
    triggerType: timer
    description: "每天凌晨2点自动抓取数据"
    qualifier: LATEST
    triggerConfig:
      cronExpression: "0 0 2 * * *"
      enable: true
      payload: '{"action":"daily-scrape"}'
```

2. **更新 index.mjs 处理定时触发:**

```javascript
export const handler = async (event, context) => {
  console.log('📥 收到请求:', JSON.stringify(event));

  // 检测是否为定时触发器
  if (event && event.triggerName === 'dailyScraper') {
    console.log('⏰ 定时任务触发 - 开始自动抓取数据');

    try {
      const server = new YuekebaoGrabberServer();
      const result = await server.scrapeYuekebaoCourses({
        email: process.env.YUEKEBAO_EMAIL || '3kkg7a7k4d66@qq.com',
        password: process.env.YUEKEBAO_PASSWORD || 'flyegg'
      });

      console.log('✅ 定时抓取完成:', result);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: '定时抓取完成',
          timestamp: new Date().toISOString(),
          result: result
        })
      };
    } catch (error) {
      console.error('❌ 定时抓取失败:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: error.message
        })
      };
    }
  }

  // HTTP 请求处理 (现有逻辑)
  // ...
};
```

3. **部署:**

```bash
s deploy -y
```

---

### 场景 2: 手动触发 + 定时触发

**需求:**
- 通过 Dashboard 手动刷新数据
- 每天自动抓取一次

**这是最推荐的配置!**

在 `s.yaml` 中保持 HTTP 触发器,然后添加定时触发器。两者互不干扰:
- HTTP 触发器处理 Web 访问和手动刷新
- 定时触发器处理自动抓取

---

## 触发器管理命令

### 查看触发器

```bash
# 查看所有触发器
s info

# 只查看触发器信息
s info | grep -A 30 "triggers:"
```

### 部署触发器

```bash
# 部署所有配置(包括触发器)
s deploy -y

# 只部署触发器(不部署代码)
s deploy trigger -y
```

### 删除触发器

**方法 1: 从 s.yaml 中删除后重新部署**

```bash
# 编辑 s.yaml,删除不需要的触发器配置
# 然后执行
s deploy -y
```

**方法 2: 通过控制台删除**

1. 登录阿里云函数计算控制台
2. 进入函数 → 触发器标签
3. 找到要删除的触发器
4. 点击"删除"

---

## 注意事项

### 1. 触发器数量限制

- 每个函数最多支持 **10 个触发器**
- HTTP 触发器每个函数只能有 **1 个**

### 2. 定时触发器时区

- Cron 表达式使用 **UTC+8 (北京时间)**
- 凌晨2点就是 `0 0 2 * * *`,不需要转换

### 3. 触发器事件对象

不同触发器传递的 `event` 对象格式不同:

**HTTP 触发器:**
```json
{
  "body": "...",
  "headers": {...},
  "httpMethod": "GET",
  "path": "/api/dashboard-data",
  "queryParameters": {...}
}
```

**定时触发器:**
```json
{
  "triggerName": "timerTrigger",
  "triggerTime": "2025-11-06T02:00:00Z",
  "message": "{\"action\":\"auto-scrape\"}"
}
```

### 4. 函数超时时间

如果定时任务需要长时间运行(如数据抓取),确保设置足够的超时时间:

```yaml
timeout: 900  # 15分钟
```

### 5. 并发控制

如果不希望多个触发器同时执行,设置:

```yaml
instanceConcurrency: 1  # 单实例
```

---

## 快速开始 - 添加定时抓取

如果你想立即添加每天自动抓取功能,按以下步骤操作:

1. **编辑 s.yaml,在 triggers 部分添加:**

```yaml
triggers:
  - triggerName: httpTrigger
    triggerType: http
    description: "HTTP触发器 - Dashboard访问"
    qualifier: LATEST
    triggerConfig:
      authType: anonymous
      disableURLInternet: false
      methods:
        - GET
        - POST
        - PUT
        - DELETE

  - triggerName: dailyScraper
    triggerType: timer
    description: "每天凌晨2点自动抓取"
    qualifier: LATEST
    triggerConfig:
      cronExpression: "0 0 2 * * *"
      enable: true
      payload: '{"action":"daily-scrape"}'
```

2. **部署:**

```bash
s deploy -y
```

3. **验证:**

```bash
# 查看触发器是否创建成功
s info | grep -A 30 "triggers:"
```

完成! 现在系统会在每天凌晨2点自动抓取数据。

---

## 常见问题

**Q: 定时触发器会替代 HTTP 触发器吗?**

A: 不会。可以同时配置多个触发器,它们各自独立工作。

**Q: 如何测试定时触发器?**

A: 可以临时修改 Cron 表达式为几分钟后执行,部署后观察日志:

```yaml
cronExpression: "0 */5 * * * *"  # 每5分钟执行一次(测试用)
```

测试完成后改回正常的时间表达式。

**Q: 定时触发器执行失败怎么办?**

A: 查看函数日志:

```bash
s logs --tail -n 50
```

检查错误信息并修复代码。

**Q: 能否手动触发定时任务?**

A: 可以通过控制台"测试函数"功能手动触发,或者在代码中添加一个 API 端点来手动调用抓取函数。

---

## 参考资料

- [阿里云函数计算触发器官方文档](https://help.aliyun.com/document_detail/53102.html)
- [Cron 表达式生成器](https://crontab.guru/)
- [Serverless Devs 触发器配置](https://docs.serverless-devs.com/fc/yaml/triggers)
