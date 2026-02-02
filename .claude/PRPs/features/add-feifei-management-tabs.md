# Feature: 集成 feifei-vue 管理功能 - 教师/课节/教材/标签管理

## Feature Description

将 feifei-vue 项目中的四个管理功能模块迁移到 baboontalkies_manager 的 Dashboard 中，以原生 HTML + JavaScript 的形式实现。这四个功能模块分别是：

1. **教师管理** - 管理教师信息、标签、签到配置等
2. **课节管理** - 以周视图形式展示教师排课情况
3. **教材管理** - 管理教材信息（标题、作者、ISBN等）
4. **标签管理** - 树形结构管理标签分类

**重要说明**：数据库表已存在于 `feifei` 数据库中，由 feifei-midway 后端项目维护，本项目只需连接该数据库进行读写操作。

## User Story

作为系统管理员
我希望在 baboontalkies_manager 中管理教师、课节、教材和标签数据
以便集中化管理所有教学相关资源，提升工作效率

## Problem Statement

当前 baboontalkies_manager 只有学员数据、老师课时统计、工资计算和系统设置四个 Tab。feifei-vue 项目中有更完善的教师管理、课节管理、教材管理和标签管理功能，但需要单独部署和维护。需要将这些功能集成到现有的 Dashboard 中。

## Solution Statement

### 核心方案：连接 feifei 数据库 + 四个新增 Tab

**Step 1: 数据库连接 - 连接已有的 feifei 数据库**
- 新增 feifei 数据库连接配置
- 复用已有表结构：
  - `base_user_teacher` - 教师表
  - `base_user_label` - 标签表
  - `base_user_classsession` - 课节表
  - `base_user_textbook` - 教材表
  - `base_user_signinconfig` - 签到配置表

**Step 2: API 层 - 新增 RESTful 端点**
- `/api/feifei/teachers/*` - 教师 CRUD
- `/api/feifei/class-sessions/*` - 课节查询
- `/api/feifei/textbooks/*` - 教材 CRUD
- `/api/feifei/labels/*` - 标签 CRUD

**Step 3: 前端层 - 新增 Tab 页面**
- 在 dashboard.html 中新增四个 Tab
- 使用原生 JavaScript 实现功能
- 保持现有 UI 风格一致性

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**:
- 数据库连接（新增 feifei 数据库连接）
- 后端 API（src/index.js）
- 前端 UI（dashboard.html）

**Dependencies**:
- MySQL 数据库（feifei）
- Express.js API
- 现有的 Tab 切换机制

---

## CONTEXT REFERENCES

### 数据库信息（feifei 数据库）

**连接配置** (来自 feifei-midway/src/config/config.default.ts):
```javascript
{
  type: 'mysql',
  host: 'htemysqlhahaha.mysql.rds.aliyuncs.com',
  port: 3306,
  username: 'xidajian',
  password: 'Hte123456',
  database: 'feifei'
}
```

### 已有数据表结构

**1. base_user_teacher (教师表)**
```sql
- id (bigint, 自增主键)
- uid (bigint, 教师UID, 索引)
- name (varchar, 姓名)
- mobile (varchar, 手机号)
- email (varchar, 邮箱)
- accountStatus (int, 账号状态)
- isdel (int, 是否删除)
- teacherLabels (json, 旧标签)
- teacherLabels2 (json, 新标签 - 实际使用这个)
- description (varchar, 备注)
- introduce (varchar(1024), 简介)
- logo (varchar, 头像)
- createTime (datetime)
- updateTime (datetime)
```

**2. base_user_label (标签表)**
```sql
- id (bigint, 自增主键)
- name (varchar, 标签名称)
- orderNum (int, 排序号, 默认0)
- remark (varchar, 备注)
- parentId (bigint, 父标签ID)
- createTime (datetime)
- updateTime (datetime)
```

**3. base_user_classsession (课节表)**
```sql
- id (bigint, 自增主键)
- className (varchar, 课节名称)
- courseId (bigint, 课程ID)
- courseName (varchar, 课程名称)
- classBtime (int, 课节开始时间, Unix时间戳)
- classEtime (int, 课节结束时间, Unix时间戳)
- classStatus (int, 课节状态)
- teacherUid (bigint, 教师UID)
- teacherName (varchar, 教师名称)
- createTime (datetime)
- updateTime (datetime)
```

**4. base_user_textbook (教材表)**
```sql
- id (bigint, 自增主键)
- title (varchar, 教材标题)
- author (varchar, 作者)
- isbn (varchar, ISBN)
- publisher (varchar, 出版社)
- yearPublished (varchar, 出版年份)
- description (text, 描述)
- isAvailable (boolean, 是否可用, 默认true)
- classId (bigint, 课节ID)
- courseId (bigint, 课程ID)
- createTime (datetime)
- updateTime (datetime)
```

**5. base_user_signinconfig (签到配置表)**
```sql
- id (bigint, 自增主键)
- name (varchar, 配置名称)
- signInStartTime (int, 课前最早签到分钟数, 默认120)
- signInEndTime (int, 课前最晚签到分钟数, 默认0)
- teacherUid (bigint, 教师UID)
- isActive (boolean, 是否启用)
- description (text, 描述)
- createTime (datetime)
- updateTime (datetime)
```

### 关联表（课节-学生关联）

**base_user_studentclassrecord (学生课节记录表)**
```sql
- id (bigint)
- classId (bigint, 课节ID)
- studId (bigint, 学生UID)
- stId (varchar, 学生ID)
```

**base_user_student (学生表)**
```sql
- studentUid (bigint, 学生UID)
- studentName (varchar, 学生姓名)
```

### Relevant Codebase Files (Target Project)

**现有 Tab 结构** (dashboard.html):
- lines 1349-1354: Tab 导航按钮
- lines 1357-1422: 学员数据 Tab
- lines 1651-1681: Tab 切换 JavaScript 逻辑

**现有数据库连接** (src/index.js):
- 使用 mysql2 库连接数据库
- 需要新增 feifei 数据库连接函数

### Source Files (feifei-midway)

**后端实体和控制器**:
- `feifei-midway/src/modules/base/entity/user/teacher.ts` - 教师实体
- `feifei-midway/src/modules/base/entity/user/Label.ts` - 标签实体
- `feifei-midway/src/modules/base/entity/user/ClassSession.ts` - 课节实体
- `feifei-midway/src/modules/base/entity/user/Textbook.ts` - 教材实体
- `feifei-midway/src/modules/base/entity/user/SignInConfig.ts` - 签到配置实体
- `feifei-midway/src/modules/base/controller/admin/user/teacher.ts` - 教师控制器
- `feifei-midway/src/modules/base/controller/admin/user/ClassSession.ts` - 课节控制器
- `feifei-midway/src/modules/base/service/user/ClassSession.ts` - 课节服务（teacherlist方法）

---

## IMPLEMENTATION PLAN

### Phase 1: 数据库连接配置

**Tasks:**
- 在 src/index.js 中添加 feifei 数据库连接函数
- 测试连接是否正常

### Phase 2: 后端 API 开发

**Tasks:**
- 实现标签管理 CRUD API
- 实现教师管理 CRUD API（含签到配置）
- 实现课节管理查询 API
- 实现教材管理 CRUD API

### Phase 3: 前端 Tab 结构搭建

**Tasks:**
- 在 dashboard.html 添加四个新的 Tab 按钮
- 创建四个 Tab 内容区域的 HTML 结构
- 更新 Tab 切换逻辑

### Phase 4: 前端功能实现

**Tasks:**
- 标签管理：树形列表、CRUD 弹窗
- 教师管理：列表、搜索筛选、编辑、签到配置
- 课节管理：周视图、教师选择器
- 教材管理：列表、CRUD、分页

---

## STEP-BY-STEP TASKS

### TASK 1: ADD src/index.js - feifei 数据库连接

**目标位置**: 在现有 getDbConnection 方法附近添加

- **IMPLEMENT**: 添加 feifei 数据库连接函数
  ```javascript
  // feifei 数据库连接配置
  getFeifeiDbConnection() {
    return mysql.createConnection({
      host: 'htemysqlhahaha.mysql.rds.aliyuncs.com',
      port: 3306,
      user: 'xidajian',
      password: 'Hte123456',
      database: 'feifei',
      charset: 'utf8mb4'
    });
  }
  ```

- **PATTERN**: 与现有的 getDbConnection 方法保持一致的风格
- **GOTCHA**: 确保连接使用完后正确关闭 `await connection.end()`
- **VALIDATE**: `node --check src/index.js`

### TASK 2: ADD src/index.js - 标签管理 API

**目标位置**: 在现有 API 端点后添加

- **IMPLEMENT**: 获取标签列表
  ```javascript
  // === feifei 标签管理 API ===
  this.app.get('/api/feifei/labels', async (req, res) => {
    try {
      const connection = await this.getFeifeiDbConnection();
      const [rows] = await connection.execute(
        `SELECT id, name, parentId, orderNum, remark, createTime
         FROM base_user_label
         ORDER BY orderNum, id`
      );
      await connection.end();
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('获取标签列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **IMPLEMENT**: 新增标签
  ```javascript
  this.app.post('/api/feifei/labels', async (req, res) => {
    try {
      const { name, parentId, orderNum, remark } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: '标签名称不能为空' });
      }
      const connection = await this.getFeifeiDbConnection();
      const [result] = await connection.execute(
        'INSERT INTO base_user_label (name, parentId, orderNum, remark) VALUES (?, ?, ?, ?)',
        [name, parentId || null, orderNum || 0, remark || null]
      );
      await connection.end();
      res.json({ success: true, id: result.insertId });
    } catch (error) {
      console.error('新增标签失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **IMPLEMENT**: 更新标签
  ```javascript
  this.app.put('/api/feifei/labels/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, parentId, orderNum, remark } = req.body;
      const connection = await this.getFeifeiDbConnection();
      await connection.execute(
        'UPDATE base_user_label SET name = ?, parentId = ?, orderNum = ?, remark = ? WHERE id = ?',
        [name, parentId || null, orderNum || 0, remark || null, id]
      );
      await connection.end();
      res.json({ success: true });
    } catch (error) {
      console.error('更新标签失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **IMPLEMENT**: 删除标签
  ```javascript
  this.app.delete('/api/feifei/labels/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const connection = await this.getFeifeiDbConnection();
      // 检查是否有子标签
      const [children] = await connection.execute(
        'SELECT COUNT(*) as count FROM base_user_label WHERE parentId = ?', [id]
      );
      if (children[0].count > 0) {
        await connection.end();
        return res.status(400).json({ success: false, error: '该标签下有子标签，无法删除' });
      }
      await connection.execute('DELETE FROM base_user_label WHERE id = ?', [id]);
      await connection.end();
      res.json({ success: true });
    } catch (error) {
      console.error('删除标签失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **VALIDATE**: `node --check src/index.js`

### TASK 3: ADD src/index.js - 教师管理 API

- **IMPLEMENT**: 获取教师列表（含近30日和未来30日课节数统计）
  ```javascript
  // === feifei 教师管理 API ===
  this.app.get('/api/feifei/teachers', async (req, res) => {
    try {
      const { keyWord, hasClass, description, labelName } = req.query;
      const connection = await this.getFeifeiDbConnection();

      // 计算时间范围
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
      const thirtyDaysLater = now + 30 * 24 * 60 * 60;

      let sql = `
        SELECT
          t.id, t.uid, t.name, t.mobile, t.email, t.description,
          t.teacherLabels2, t.logo, t.createTime,
          COUNT(CASE WHEN c.classBtime >= ? AND c.classBtime <= ? THEN 1 END) as old30,
          COUNT(CASE WHEN c.classBtime > ? AND c.classBtime <= ? THEN 1 END) as new30
        FROM base_user_teacher t
        LEFT JOIN base_user_classsession c ON t.uid = c.teacherUid
        WHERE (t.isdel IS NULL OR t.isdel = 0)
      `;
      const params = [thirtyDaysAgo, now, now, thirtyDaysLater];

      if (keyWord) {
        sql += ' AND t.name LIKE ?';
        params.push(`%${keyWord}%`);
      }
      if (description) {
        sql += ' AND t.description LIKE ?';
        params.push(`%${description}%`);
      }
      if (labelName) {
        sql += ' AND JSON_CONTAINS(t.teacherLabels2, ?)';
        params.push(JSON.stringify(labelName));
      }

      sql += ' GROUP BY t.id ORDER BY t.createTime DESC';

      let [teachers] = await connection.execute(sql, params);

      // 如果筛选"未来30日有课"
      if (hasClass === '1') {
        teachers = teachers.filter(t => t.new30 > 0);
      }

      await connection.end();
      res.json({ success: true, data: teachers });
    } catch (error) {
      console.error('获取教师列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **IMPLEMENT**: 更新教师
  ```javascript
  this.app.put('/api/feifei/teachers/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      const { name, description, teacherLabels2 } = req.body;
      const connection = await this.getFeifeiDbConnection();

      await connection.execute(
        'UPDATE base_user_teacher SET name = ?, description = ?, teacherLabels2 = ? WHERE uid = ?',
        [name, description || null, JSON.stringify(teacherLabels2 || []), uid]
      );

      await connection.end();
      res.json({ success: true });
    } catch (error) {
      console.error('更新教师失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **IMPLEMENT**: 获取教师可选标签列表（用于教师编辑弹窗）
  ```javascript
  // 获取教师可选标签（parentId = '6' 的标签）
  this.app.get('/api/feifei/teacher-label-options', async (req, res) => {
    try {
      const connection = await this.getFeifeiDbConnection();
      const [rows] = await connection.execute(
        `SELECT id, name FROM base_user_label WHERE parentId = '6' ORDER BY orderNum, id`
      );
      await connection.end();
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('获取教师标签选项失败:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **IMPLEMENT**: 签到配置 API
  ```javascript
  this.app.get('/api/feifei/teachers/:uid/signin-config', async (req, res) => {
    try {
      const { uid } = req.params;
      const connection = await this.getFeifeiDbConnection();
      const [rows] = await connection.execute(
        'SELECT id, signInStartTime, signInEndTime FROM base_user_signinconfig WHERE teacherUid = ?',
        [uid]
      );
      await connection.end();
      res.json({ success: true, data: rows[0] || { signInStartTime: 120, signInEndTime: 0 } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  this.app.post('/api/feifei/teachers/:uid/signin-config', async (req, res) => {
    try {
      const { uid } = req.params;
      const { signInStartTime, signInEndTime } = req.body;
      const connection = await this.getFeifeiDbConnection();

      // 检查是否已存在
      const [existing] = await connection.execute(
        'SELECT id FROM base_user_signinconfig WHERE teacherUid = ?', [uid]
      );

      if (existing.length > 0) {
        await connection.execute(
          'UPDATE base_user_signinconfig SET signInStartTime = ?, signInEndTime = ? WHERE teacherUid = ?',
          [signInStartTime || 120, signInEndTime || 0, uid]
        );
      } else {
        await connection.execute(
          'INSERT INTO base_user_signinconfig (teacherUid, signInStartTime, signInEndTime) VALUES (?, ?, ?)',
          [uid, signInStartTime || 120, signInEndTime || 0]
        );
      }

      await connection.end();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **VALIDATE**: `node --check src/index.js`

### TASK 4: ADD src/index.js - 课节管理 API

- **IMPLEMENT**: 获取有课的教师列表
  ```javascript
  // === feifei 课节管理 API ===
  this.app.get('/api/feifei/class-sessions/teachers', async (req, res) => {
    try {
      const { startTime, endTime } = req.query;
      const connection = await this.getFeifeiDbConnection();

      const sql = `
        SELECT DISTINCT cs.teacherUid, t.name as teacherName
        FROM base_user_classsession cs
        LEFT JOIN base_user_teacher t ON cs.teacherUid = t.uid
        WHERE cs.classBtime >= ? AND cs.classBtime <= ?
        ORDER BY t.createTime DESC
      `;

      const [rows] = await connection.execute(sql, [startTime, endTime]);
      await connection.end();
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **IMPLEMENT**: 获取课节列表（含学生信息）
  ```javascript
  this.app.get('/api/feifei/class-sessions', async (req, res) => {
    try {
      const { teacherUid, startTime, endTime } = req.query;
      const connection = await this.getFeifeiDbConnection();

      const sql = `
        SELECT
          cs.id, cs.className, cs.classBtime, cs.classEtime,
          cs.teacherUid, cs.teacherName,
          scr.studId, scr.stId, s.studentName
        FROM base_user_classsession cs
        LEFT JOIN base_user_studentclassrecord scr ON cs.id = scr.classId
        LEFT JOIN base_user_student s ON scr.studId = s.studentUid
        WHERE cs.teacherUid = ? AND cs.classBtime >= ? AND cs.classBtime <= ?
        ORDER BY cs.classBtime
      `;

      const [rows] = await connection.execute(sql, [teacherUid, startTime, endTime]);
      await connection.end();
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **VALIDATE**: `node --check src/index.js`

### TASK 5: ADD src/index.js - 教材管理 API

- **IMPLEMENT**: 教材 CRUD API
  ```javascript
  // === feifei 教材管理 API ===
  this.app.get('/api/feifei/textbooks', async (req, res) => {
    try {
      const { keyWord, page = 1, size = 20 } = req.query;
      const connection = await this.getFeifeiDbConnection();

      let sql = 'SELECT * FROM base_user_textbook WHERE 1=1';
      const params = [];

      if (keyWord) {
        sql += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
        params.push(`%${keyWord}%`, `%${keyWord}%`, `%${keyWord}%`);
      }

      // 获取总数
      const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
      const [countResult] = await connection.execute(countSql, params);
      const total = countResult[0].total;

      // 分页
      const offset = (parseInt(page) - 1) * parseInt(size);
      sql += ' ORDER BY createTime DESC LIMIT ? OFFSET ?';
      params.push(parseInt(size), offset);

      const [rows] = await connection.execute(sql, params);
      await connection.end();

      res.json({
        success: true,
        data: rows,
        pagination: { page: parseInt(page), size: parseInt(size), total }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  this.app.post('/api/feifei/textbooks', async (req, res) => {
    try {
      const { title, author, isbn, publisher, yearPublished, description, isAvailable } = req.body;
      if (!title) {
        return res.status(400).json({ success: false, error: '教材标题不能为空' });
      }
      const connection = await this.getFeifeiDbConnection();
      const [result] = await connection.execute(
        `INSERT INTO base_user_textbook (title, author, isbn, publisher, yearPublished, description, isAvailable)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, author, isbn, publisher, yearPublished, description, isAvailable !== false ? 1 : 0]
      );
      await connection.end();
      res.json({ success: true, id: result.insertId });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  this.app.put('/api/feifei/textbooks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, author, isbn, publisher, yearPublished, description, isAvailable } = req.body;
      const connection = await this.getFeifeiDbConnection();
      await connection.execute(
        `UPDATE base_user_textbook SET title = ?, author = ?, isbn = ?, publisher = ?,
         yearPublished = ?, description = ?, isAvailable = ? WHERE id = ?`,
        [title, author, isbn, publisher, yearPublished, description, isAvailable ? 1 : 0, id]
      );
      await connection.end();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  this.app.delete('/api/feifei/textbooks/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const connection = await this.getFeifeiDbConnection();
      await connection.execute('DELETE FROM base_user_textbook WHERE id = ?', [id]);
      await connection.end();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  ```

- **VALIDATE**: `node --check src/index.js`

### TASK 6: UPDATE dashboard.html - 添加新 Tab 按钮

**目标行号**: 1349-1355

- **IMPLEMENT**: 在现有 Tab 按钮后添加四个新 Tab
  ```html
  <!-- Tab 导航 -->
  <div class="tabs">
      <button class="tab active" data-tab="students">📚 学员数据</button>
      <button class="tab" data-tab="teachers">👨‍🏫 老师数据</button>
      <button class="tab" data-tab="salary">💰 工资计算</button>
      <button class="tab" data-tab="settings">⚙️ 系统设置</button>
      <!-- 新增 feifei 功能 Tab -->
      <button class="tab" data-tab="feifei-teachers">🧑‍🏫 教师管理</button>
      <button class="tab" data-tab="feifei-sessions">📅 课节管理</button>
      <button class="tab" data-tab="feifei-textbooks">📖 教材管理</button>
      <button class="tab" data-tab="feifei-labels">🏷️ 标签管理</button>
  </div>
  ```

- **VALIDATE**: 浏览器刷新确认 Tab 按钮显示

### TASK 7-11: ADD dashboard.html - 各 Tab 内容和 JavaScript

参考之前 PRP 中的 TASK 7-12 实现，主要内容包括：

1. **标签管理 Tab** (TASK 7-8)
   - 左侧树形标签列表
   - 右侧标签详情表格
   - CRUD 弹窗

2. **教师管理 Tab** (TASK 9)
   - 教师列表表格（含 old30、new30 统计）
   - 搜索筛选（姓名、标签、未来有课）
   - 编辑弹窗
   - 签到配置弹窗

3. **课节管理 Tab** (TASK 10)
   - 教师选择器
   - 周视图网格（周日-周六，06:00-23:30）
   - 过往14天和未来30天分列显示
   - 绿色背景表示教师可用时段

4. **教材管理 Tab** (TASK 11)
   - 教材列表表格
   - CRUD 弹窗
   - 分页功能

5. **Tab 切换逻辑更新** (TASK 12)
   - 在 setupTabs 中添加各 Tab 的初始化加载逻辑

---

## TESTING STRATEGY

### API 测试

```bash
# 启动服务
npm run dashboard-http

# 测试标签 API
curl http://localhost:3000/api/feifei/labels | jq '.'

# 测试教师 API
curl "http://localhost:3000/api/feifei/teachers?hasClass=1" | jq '.'

# 测试课节 API（需要先获取教师 UID）
curl "http://localhost:3000/api/feifei/class-sessions/teachers?startTime=1704067200&endTime=1706745600" | jq '.'

# 测试教材 API
curl http://localhost:3000/api/feifei/textbooks | jq '.'
```

### UI 验证

**手动测试步骤**:

1. 浏览器访问 `http://localhost:3000`
2. 点击 "🏷️ 标签管理" Tab，测试 CRUD
3. 点击 "🧑‍🏫 教师管理" Tab，测试搜索、编辑、签到配置
4. 点击 "📅 课节管理" Tab，选择教师查看周视图
5. 点击 "📖 教材管理" Tab，测试 CRUD 和分页

---

## VALIDATION COMMANDS

### Level 1: 语法验证

```bash
node --check src/index.js
```

### Level 2: 数据库连接测试

```bash
# 在 Node.js 中测试连接
node -e "
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'htemysqlhahaha.mysql.rds.aliyuncs.com',
    port: 3306,
    user: 'xidajian',
    password: 'Hte123456',
    database: 'feifei'
  });
  const [rows] = await conn.execute('SELECT COUNT(*) as count FROM base_user_label');
  console.log('标签数量:', rows[0].count);
  await conn.end();
})();
"
```

### Level 3: API 功能测试

```bash
npm run dashboard-http
# 在另一终端测试各 API 端点
```

---

## ACCEPTANCE CRITERIA

- [ ] feifei 数据库连接配置正确
- [ ] 标签管理功能：
  - [ ] 树形标签列表显示
  - [ ] 新增/编辑/删除标签
  - [ ] parentId 关联正确
- [ ] 教师管理功能：
  - [ ] 教师列表显示（含 old30、new30）
  - [ ] 搜索和标签筛选
  - [ ] 编辑教师（name, description, teacherLabels2）
  - [ ] 签到配置功能
- [ ] 课节管理功能：
  - [ ] 教师选择器
  - [ ] 周视图正确显示
  - [ ] 学生信息正确关联
- [ ] 教材管理功能：
  - [ ] 教材列表显示
  - [ ] CRUD 操作
  - [ ] 分页功能
- [ ] UI 风格与现有页面一致
- [ ] 所有语法检查通过

---

## COMPLETION CHECKLIST

- [ ] feifei 数据库连接函数添加
- [ ] 标签管理 API 实现
- [ ] 教师管理 API 实现（含签到配置）
- [ ] 课节管理 API 实现
- [ ] 教材管理 API 实现
- [ ] Tab 按钮添加
- [ ] 标签管理 Tab 内容和功能
- [ ] 教师管理 Tab 内容和功能
- [ ] 课节管理 Tab 内容和功能
- [ ] 教材管理 Tab 内容和功能
- [ ] Tab 切换逻辑更新
- [ ] 所有测试通过

---

## NOTES

### 设计决策

**为什么连接现有数据库而不是新建表？**
- feifei-midway 后端已经在维护这些数据
- 避免数据重复和同步问题
- 复用已有的数据结构

**字段命名注意**
- feifei 数据库使用驼峰命名（如 `parentId`, `teacherLabels2`）
- 与现有 baboontalkies_manager 的下划线命名不同（如 `course_type`）
- API 返回时保持原始字段名

**教师标签字段**
- 实际使用 `teacherLabels2` 字段（JSON 数组）
- `teacherLabels` 是旧字段，已弃用
- 教师标签选项来源：`base_user_label` 表中 `parentId = '6'` 的记录
- 在教师编辑弹窗中，需要从标签表获取教师可选标签列表

**课节视图"教师空闲"显示**
- 当某个课节时间段内没有关联学生（`stId` 为空）时，显示绿色背景
- 表示该时间段教师可用，可以安排新学生
- 这是 feifei-vue 中的现有功能，需要保留

**教师管理功能限制**
- 不支持新增教师（教师数据由 ClassIn 系统同步）
- 只支持编辑现有教师的标签、备注等信息

### 潜在风险

**数据库访问权限**
- 需要确保 baboontalkies_manager 部署环境可以访问阿里云 RDS
- 可能需要配置 RDS 白名单

**并发写入**
- feifei-midway 和 baboontalkies_manager 可能同时写入
- 由于是简单的 CRUD 操作，冲突风险较低

### 未来优化方向

1. 添加数据缓存减少数据库查询
2. 实现 WebSocket 实时数据同步
3. 添加操作日志记录

<!-- EOF -->
