# Yuekebao Grabber

一个基于 Playwright 的 MCP (Model Context Protocol) 服务器，用于自动化抓取约课宝课程管理系统的课表数据。

## 功能特性

- 🔐 **自动登录**: 支持邮箱密码登录，自动处理滑块验证码
- 🎯 **智能抓取**: 自动选择"全部老师"，批量提取指定时间段内的课程数据
- 📅 **时间过滤**: 只抓取当前时间后1.5个月内的课程安排
- 👨‍🏫 **多老师支持**: 识别多种老师状态，包括特殊状态老师（如Gel）
- 📊 **多格式导出**:
  - Excel文件导出（.xlsx格式）
  - MySQL数据库存储
- 🔄 **实时反馈**: 抓取过程中实时显示课程信息
- 🛠️ **MCP集成**: 作为MCP服务器运行，可与Claude Code等客户端集成

## 安装

```bash
npm install
```

## 使用方法

### 作为MCP服务器运行

```bash
npm start
```

### 测试运行

```bash
npm test
```

### 开发模式

```bash
npm run dev
```

### 检查Excel文件内容

```bash
node check-excel.js
```

## 可用工具

### `scrapeYuekebaoCourses`

抓取约课宝课程管理系统的课表数据

**参数:**
- `email` (string): 登录邮箱
- `password` (string): 登录密码
- `headless` (boolean, default: true): 是否以无头模式运行浏览器
- `timeout` (number, default: 30000): 页面加载超时时间（毫秒）

**返回数据格式:**
- 日期、时间、老师、学生、扣课数
- Excel文件保存到项目根目录
- 数据同步保存到MySQL数据库

## 数据库配置

项目连接到阿里云MySQL数据库，表结构：

```sql
CREATE TABLE course_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher VARCHAR(100),
  student VARCHAR(100),
  time_num INT,
  class_date DATE,
  class_start_time VARCHAR(10),
  class_end_time VARCHAR(10),
  week_period VARCHAR(50),
  create_time DATETIME
);
```

## 支持的老师

系统支持识别以下老师（包括特殊状态）：
- May, Angel, Anna Rose, Diana, Jake, Jenny
- Lou, Milena, Mumu, Pearly, Shai, Gel

## 技术特点

- **智能验证码处理**: 使用类人化鼠标移动算法解决滑块验证码
- **Layui组件支持**: 专门处理约课宝系统使用的Layui框架组件
- **多课程格式解析**: 处理同一时间段多个课程的复杂表格结构
- **数据完整性保证**: 确保日期、时间、老师、学生信息完整提取

## 项目文件

- `src/index.js`: 主程序文件，包含MCP服务器和抓取逻辑
- `run-test.js`: 测试脚本
- `check-excel.js`: Excel文件内容检查工具
- `package.json`: 项目配置和依赖

## 依赖项

- `@modelcontextprotocol/sdk`: MCP SDK
- `playwright`: 浏览器自动化库
- `mysql2`: MySQL数据库连接
- `xlsx`: Excel文件处理

## 许可证

MIT