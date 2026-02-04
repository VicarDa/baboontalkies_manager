# Feature: Dashboard 课节管理列表页面

## Feature Description

在 baboontalkies_manager 的 dashboard.html 中实现"课节管理"Tab 的列表展示功能。新列表需要展示：老师、学生、学生手机号（中间3位隐藏）、是否签到、课节开始时间、老师首次进入、学生首次进入、老师最后离开、课节反馈、录屏、操作等字段。

点击列表项展示详情弹窗，包含：
- 近7节课时间tab切换（点击可切换显示对应课节内容）
- 选中课节的教材列表（Material）
- 课节截图（Class Screen - 黑板图片）
- 录屏链接（Class Record）
- 课后反馈（Feedback - 分为 Trial Class 和 Regular Class 两种类型）

**数据来源**: ClassIn 系统同步的课节数据，存储在 feifei 数据库中。

## User Story

作为系统管理员
我希望在课节管理页面以列表形式查看所有课节记录
以便快速查看每节课的上课情况、签到状态、反馈信息等详细数据

## Problem Statement

当前"课节管理"Tab 页面显示"功能开发中"的占位符。管理员需要一个能够快速浏览所有课节详细信息的列表页面，包括签到状态、进出时间、反馈等关键数据。

## Solution Statement

### 核心方案：在 dashboard.html 中实现课节列表

**Step 1: 后端 API 扩展**
- 新增 `/api/feifei/class-session-list` 分页列表接口
- 新增 `/api/feifei/class-session-detail` 详情接口
- 新增 `/api/feifei/textbooks-by-class` 教材查询接口

**Step 2: 前端列表实现**
- 替换占位符为表格列表
- 实现筛选功能（教师、学生、时间范围、签到状态）
- 实现分页

**Step 3: 详情弹窗实现**
- 实现近7节课tab切换
- 展示教材、截图、录屏、反馈

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium-High
**Primary Systems Affected**:
- 前端页面: `baboontalkies_manager/dashboard.html`
- 后端 API: `baboontalkies_manager/src/index.js`

**Dependencies**:
- feifei 数据库连接
- 现有 CSS 样式系统

---

## CONTEXT REFERENCES

### Relevant Codebase Files

**需要修改的文件**:
- `baboontalkies_manager/dashboard.html` (lines 1792-1802) - 课节管理 Tab 内容区域
- `baboontalkies_manager/src/index.js` (lines 4588-4642) - 现有课节管理 API

**参考文件（代码模式）**:
- `baboontalkies_manager/dashboard.html` (lines 1807-1889) - 教材管理 Tab 的表格和弹窗结构
- `baboontalkies_manager/dashboard.html` (lines 1462-1582) - 学员数据表格结构
- `baboontalkies_manager/src/index.js` (lines 530-650) - API 分页查询模式

### 后端数据结构

**需要用到的数据库表**:

```sql
-- 学生上课记录表
base_user_studentclassrecord (a):
- id, classId, courseId, studId
- studentEnterTime  -- 学生首次进入
- studentLeaveTime  -- 学生离开时间
- classFeedback     -- 课节反馈 (JSON)

-- 课节信息表
base_user_classsession (b):
- id, className, classBtime, classEtime
- teacherUid, teacherName, courseName
- teacherjongTime    -- 教师首次进入
- teacherLeaveTime   -- 教师最后离开
- blackboardImage    -- 黑板截图 (JSON 数组)
- classRecord        -- 录屏信息 (JSON)

-- 学生信息表
base_user_student (c):
- studentUid, studentName, mobile

-- 教师签到表
base_user_teacherattendance (e):
- teacherUid, classId, courseId
- isPresent, signInTime

-- 教材表
base_user_textbook:
- id, title, classId, courseId
```

**关键 SQL 查询（参考 StudentClassRecord 控制器）**:
```sql
SELECT
  a.*,
  b.teacherjongTime as teacherjongTime,
  b.teacherLeaveTime as teacherLeaveTime,
  b.blackboardImage as blackboardImage,
  b.teacherName as teacherName,
  b.courseName as courseName,
  CONCAT(SUBSTRING(c.mobile, 1, 3), '****', SUBSTRING(c.mobile, 8, 4)) as mobile,
  b.className as className,
  b.classRecord as classRecord,
  c.studentName as studentName,
  b.classBtime as startTimestamp,
  b.classEtime as endTimestamp,
  e.signInTime as signInTime,
  COALESCE(e.isPresent, 0) as isPresent
FROM base_user_studentclassrecord a
LEFT JOIN base_user_classsession b ON a.classId = b.id AND a.courseId = b.courseId
LEFT JOIN base_user_student c ON a.studId = c.studentUid
LEFT JOIN base_user_teacherattendance e ON b.id = e.classId AND b.teacherUid = e.teacherUid AND e.courseId = b.courseId
WHERE b.classBtime BETWEEN ? AND ?
ORDER BY b.classBtime DESC
LIMIT ?, ?
```

### Patterns to Follow

**表格结构模式** (from 教材管理 Tab):
```html
<div style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
    <table style="width: 100%; border-collapse: collapse;">
        <thead>
            <tr style="background: #f5f5f5;">
                <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">列标题</th>
                <!-- ... -->
            </tr>
        </thead>
        <tbody id="tableBody">
            <!-- 动态内容 -->
        </tbody>
    </table>
</div>
```

**弹窗模式** (from 教材编辑弹窗):
```html
<div id="modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
    <div style="background: white; padding: 30px; border-radius: 12px; width: 900px; max-width: 95%; max-height: 90vh; overflow-y: auto;">
        <!-- 弹窗内容 -->
    </div>
</div>
```

**API 请求模式**:
```javascript
async function loadData() {
    try {
        const response = await fetch(`${BASE_PATH}/api/endpoint?params`);
        const result = await response.json();
        if (result.success) {
            renderData(result.data);
        }
    } catch (error) {
        console.error('加载失败:', error);
    }
}
```

**时间戳格式化**:
```javascript
function formatTimestamp(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: 后端 API 开发

**Tasks:**
- 新增课节列表分页 API
- 新增课节详情 API（包含近7节课）
- 新增教材查询 API

### Phase 2: 前端列表实现

**Tasks:**
- 替换占位符为筛选表单和表格
- 实现表格渲染
- 实现分页功能

### Phase 3: 详情弹窗实现

**Tasks:**
- 创建详情弹窗 HTML 结构
- 实现近7节课 tab 切换
- 展示教材、截图、录屏、反馈

### Phase 4: 测试与优化

**Tasks:**
- 功能测试
- 边界条件处理
- 性能优化

---

## STEP-BY-STEP TASKS

### TASK 1: ADD src/index.js - 课节列表分页 API

**目标文件**: `baboontalkies_manager/src/index.js`

**位置**: 在现有的 `// === feifei 课节管理 API ===` 区块中添加

- **IMPLEMENT**: 新增 `/api/feifei/class-session-list` 分页接口

```javascript
// 获取课节列表（分页）
this.app.get('/api/feifei/class-session-list', async (req, res) => {
  let connection;
  try {
    const {
      page = 1,
      size = 20,
      teacherName,
      studentName,
      startTime,
      endTime,
      isPresent
    } = req.query;

    connection = await getFeifeiDbConnection();

    // 构建 WHERE 条件
    let whereClause = '1=1';
    const params = [];

    if (startTime && endTime) {
      whereClause += ' AND b.classBtime BETWEEN ? AND ?';
      params.push(parseInt(startTime), parseInt(endTime));
    }

    if (teacherName) {
      whereClause += ' AND b.teacherName LIKE ?';
      params.push(`%${teacherName}%`);
    }

    if (studentName) {
      whereClause += ' AND c.studentName LIKE ?';
      params.push(`%${studentName}%`);
    }

    if (isPresent !== undefined && isPresent !== '') {
      if (isPresent === '1') {
        whereClause += ' AND e.isPresent = 1';
      } else {
        whereClause += ' AND (e.isPresent IS NULL OR e.isPresent = 0)';
      }
    }

    // 查询总数
    const countSql = `
      SELECT COUNT(DISTINCT a.id) as total
      FROM base_user_studentclassrecord a
      LEFT JOIN base_user_classsession b ON a.classId = b.id AND a.courseId = b.courseId
      LEFT JOIN base_user_student c ON a.studId = c.studentUid
      LEFT JOIN base_user_teacherattendance e ON b.id = e.classId AND b.teacherUid = e.teacherUid AND e.courseId = b.courseId
      WHERE ${whereClause}
    `;
    const [countResult] = await connection.execute(countSql, params);
    const total = countResult[0].total;

    // 查询数据
    const offset = (parseInt(page) - 1) * parseInt(size);
    const dataSql = `
      SELECT
        a.id,
        a.classId,
        a.courseId,
        a.studId,
        a.studentEnterTime,
        a.studentLeaveTime,
        a.classFeedback,
        b.teacherjongTime,
        b.teacherLeaveTime,
        b.blackboardImage,
        b.teacherName,
        b.courseName,
        CONCAT(SUBSTRING(c.mobile, 1, 3), '****', SUBSTRING(c.mobile, 8, 4)) as mobile,
        b.className,
        b.classRecord,
        c.studentName,
        b.classBtime as startTimestamp,
        b.classEtime as endTimestamp,
        e.signInTime,
        COALESCE(e.isPresent, 0) as isPresent
      FROM base_user_studentclassrecord a
      LEFT JOIN base_user_classsession b ON a.classId = b.id AND a.courseId = b.courseId
      LEFT JOIN base_user_student c ON a.studId = c.studentUid
      LEFT JOIN base_user_teacherattendance e ON b.id = e.classId AND b.teacherUid = e.teacherUid AND e.courseId = b.courseId
      WHERE ${whereClause}
      ORDER BY b.classBtime DESC
      LIMIT ?, ?
    `;
    const [rows] = await connection.execute(dataSql, [...params, offset, parseInt(size)]);

    res.json({
      success: true,
      data: {
        list: rows,
        pagination: {
          page: parseInt(page),
          size: parseInt(size),
          total
        }
      }
    });
  } catch (error) {
    console.error('获取课节列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});
```

- **PATTERN**: 参考 `baboontalkies_manager/src/index.js` 中的 `/api/students` 分页接口
- **VALIDATE**: `curl "http://localhost:3000/api/feifei/class-session-list?page=1&size=10"`

### TASK 2: ADD src/index.js - 学生近7节课查询 API

**目标文件**: `baboontalkies_manager/src/index.js`

- **IMPLEMENT**: 新增 `/api/feifei/student-recent-sessions` 接口

```javascript
// 获取学生近7节课记录
this.app.get('/api/feifei/student-recent-sessions', async (req, res) => {
  let connection;
  try {
    const { studId, currentClassId } = req.query;

    if (!studId) {
      return res.status(400).json({ success: false, error: '缺少 studId 参数' });
    }

    connection = await getFeifeiDbConnection();

    const sql = `
      SELECT
        a.id,
        a.classId,
        a.courseId,
        a.studId,
        a.studentEnterTime,
        a.studentLeaveTime,
        a.classFeedback,
        b.teacherjongTime,
        b.teacherLeaveTime,
        b.blackboardImage,
        b.teacherName,
        b.courseName,
        b.className,
        b.classRecord,
        b.classBtime as startTimestamp,
        b.classEtime as endTimestamp
      FROM base_user_studentclassrecord a
      LEFT JOIN base_user_classsession b ON a.classId = b.id AND a.courseId = b.courseId
      WHERE a.studId = ?
        AND b.classBtime <= UNIX_TIMESTAMP()
      ORDER BY b.classBtime DESC
      LIMIT 7
    `;

    const [rows] = await connection.execute(sql, [studId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取学生近期课节失败:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});
```

- **VALIDATE**: `curl "http://localhost:3000/api/feifei/student-recent-sessions?studId=123456"`

### TASK 3: ADD src/index.js - 教材查询 API

**目标文件**: `baboontalkies_manager/src/index.js`

- **IMPLEMENT**: 新增 `/api/feifei/textbooks-by-class` 接口

```javascript
// 获取课节对应的教材
this.app.get('/api/feifei/textbooks-by-class', async (req, res) => {
  let connection;
  try {
    const { classId, courseId } = req.query;

    if (!classId || !courseId) {
      return res.status(400).json({ success: false, error: '缺少 classId 或 courseId 参数' });
    }

    connection = await getFeifeiDbConnection();

    const sql = `
      SELECT DISTINCT id, title, author, isbn, publisher
      FROM base_user_textbook
      WHERE classId = ? AND courseId = ?
      ORDER BY createTime
    `;

    const [rows] = await connection.execute(sql, [classId, courseId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取教材列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});
```

- **VALIDATE**: `curl "http://localhost:3000/api/feifei/textbooks-by-class?classId=123&courseId=456"`

### TASK 4: UPDATE dashboard.html - 替换课节管理 Tab 内容

**目标文件**: `baboontalkies_manager/dashboard.html`

**位置**: 找到 `<!-- feifei 课节管理 Tab 内容 -->` 区块（约第 1792-1802 行）

- **IMPLEMENT**: 替换为筛选表单和表格结构

```html
<!-- feifei 课节管理 Tab 内容 -->
<!-- ========================================== -->
<div class="tab-content" id="feifei-sessions-tab">
    <div style="padding: 20px;">
        <h3 style="margin-bottom: 20px; color: #333;">📅 课节管理</h3>

        <!-- 筛选表单 -->
        <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; align-items: flex-end;">
            <div>
                <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #666;">教师姓名</label>
                <input type="text" id="sessionFilterTeacher" placeholder="请输入教师姓名"
                       style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; width: 150px;">
            </div>
            <div>
                <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #666;">学生姓名</label>
                <input type="text" id="sessionFilterStudent" placeholder="请输入学生姓名"
                       style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; width: 150px;">
            </div>
            <div>
                <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #666;">签到状态</label>
                <select id="sessionFilterPresent" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; width: 120px;">
                    <option value="">全部</option>
                    <option value="1">已签到</option>
                    <option value="0">未签到</option>
                </select>
            </div>
            <div>
                <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #666;">课节时间范围</label>
                <input type="date" id="sessionFilterStartDate" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;">
                <span style="margin: 0 5px;">-</span>
                <input type="date" id="sessionFilterEndDate" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;">
            </div>
            <div>
                <button onclick="loadClassSessionList()" style="padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer;">查询</button>
                <button onclick="resetSessionFilters()" style="padding: 8px 16px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; margin-left: 5px;">重置</button>
            </div>
        </div>

        <!-- 课节列表表格 -->
        <div style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; min-width: 1200px;">
                    <thead>
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">老师</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">学生</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">学生手机号</th>
                            <th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">签到</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">课节开始时间</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">老师首次进入</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">学生首次进入</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">老师最后离开</th>
                            <th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">课节反馈</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">录屏</th>
                            <th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">操作</th>
                        </tr>
                    </thead>
                    <tbody id="classSessionTableBody">
                        <tr><td colspan="11" style="text-align: center; padding: 40px; color: #999;">加载中...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 分页 -->
        <div id="classSessionPagination" style="display: flex; justify-content: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; align-items: center;">
        </div>
    </div>
</div>
<!-- 结束 feifei 课节管理 Tab -->
```

- **PATTERN**: 参考教材管理 Tab 的表格结构
- **GOTCHA**: 表格需要水平滚动支持，因为列数较多
- **VALIDATE**: 刷新页面，切换到课节管理 Tab 应显示新结构

### TASK 5: ADD dashboard.html - 详情弹窗 HTML 结构

**目标文件**: `baboontalkies_manager/dashboard.html`

**位置**: 在 `<!-- 结束 feifei 课节管理 Tab -->` 之后添加

- **IMPLEMENT**: 添加详情弹窗 HTML

```html
<!-- 课节详情弹窗 -->
<div id="classSessionDetailModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center; overflow-y: auto;">
    <div style="background: white; padding: 30px; border-radius: 12px; width: 900px; max-width: 95%; max-height: 90vh; overflow-y: auto; margin: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0;">课节详情</h3>
            <button onclick="closeSessionDetailModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999;">&times;</button>
        </div>

        <!-- 近7节课 Tab 切换 -->
        <div id="recentSessionTabs" style="display: flex; gap: 5px; margin-bottom: 20px; flex-wrap: wrap;">
            <!-- 动态生成 -->
        </div>

        <!-- 详情内容 -->
        <div id="sessionDetailContent">
            <!-- Material 教材 -->
            <div style="margin-bottom: 24px;">
                <h4 style="font-size: 16px; font-weight: bold; margin-bottom: 12px;">Material</h4>
                <div id="sessionMaterials" style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <span style="color: #999;">暂无教材</span>
                </div>
            </div>

            <!-- Class Screen 课节截图 -->
            <div style="margin-bottom: 24px;">
                <h4 style="font-size: 16px; font-weight: bold; margin-bottom: 12px;">Class Screen:</h4>
                <div id="sessionScreenshots" style="display: flex; gap: 8px; flex-wrap: wrap; overflow-x: auto; padding-bottom: 10px;">
                    <span style="color: #999;">暂无截图</span>
                </div>
            </div>

            <!-- Class Record 录屏 -->
            <div style="margin-bottom: 24px;">
                <h4 style="font-size: 16px; font-weight: bold; margin-bottom: 12px;">Class Record:</h4>
                <div id="sessionRecords" style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <span style="color: #999;">暂无录屏</span>
                </div>
            </div>

            <!-- Feedback 反馈 -->
            <div style="margin-bottom: 24px;">
                <h4 style="font-size: 16px; font-weight: bold; margin-bottom: 12px;">Feedback</h4>
                <div id="sessionFeedbackType" style="margin-bottom: 12px;">
                    <label style="margin-right: 20px; cursor: pointer;">
                        <input type="radio" name="feedbackTypeDisplay" value="trial" disabled> Trial Class
                    </label>
                    <label style="cursor: pointer;">
                        <input type="radio" name="feedbackTypeDisplay" value="regular" disabled> Regular Class
                    </label>
                </div>
                <div id="sessionFeedbackContent">
                    <span style="color: #999;">暂无反馈</span>
                </div>
            </div>
        </div>

        <div style="text-align: right; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
            <button onclick="closeSessionDetailModal()" style="padding: 10px 24px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">关 闭</button>
        </div>
    </div>
</div>

<!-- 图片预览弹窗 -->
<div id="imagePreviewModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 1100; justify-content: center; align-items: center; cursor: pointer;" onclick="closeImagePreview()">
    <img id="previewImage" style="max-width: 95%; max-height: 95%; object-fit: contain;">
    <button style="position: absolute; top: 20px; right: 20px; background: none; border: none; color: white; font-size: 32px; cursor: pointer;">&times;</button>
</div>
```

- **PATTERN**: 参考教材编辑弹窗的结构
- **VALIDATE**: 页面刷新后弹窗元素存在（可在控制台检查 `document.getElementById('classSessionDetailModal')`）

### TASK 6: ADD dashboard.html - 课节列表 JavaScript 函数

**目标文件**: `baboontalkies_manager/dashboard.html`

**位置**: 在 `<script>` 标签内，`// ========== 课节管理 ==========` 区块位置

- **IMPLEMENT**: 添加课节列表相关函数

```javascript
// ========== 课节管理 - 列表模式 ==========

let classSessionCurrentPage = 1;
const classSessionPageSize = 20;
let currentSessionDetailData = null;
let recentSessionsList = [];
let currentSelectedSessionId = null;

// 初始化日期筛选默认值（最近30天）
function initSessionFilters() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    document.getElementById('sessionFilterStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('sessionFilterEndDate').value = now.toISOString().split('T')[0];
}

// 重置筛选条件
function resetSessionFilters() {
    document.getElementById('sessionFilterTeacher').value = '';
    document.getElementById('sessionFilterStudent').value = '';
    document.getElementById('sessionFilterPresent').value = '';
    initSessionFilters();
    classSessionCurrentPage = 1;
    loadClassSessionList();
}

// 加载课节列表
async function loadClassSessionList(page = 1) {
    classSessionCurrentPage = page;
    const tbody = document.getElementById('classSessionTableBody');
    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #999;">加载中...</td></tr>';
    showTabLoading('feifei-sessions-tab', '正在加载课节数据...');

    try {
        const teacherName = document.getElementById('sessionFilterTeacher').value.trim();
        const studentName = document.getElementById('sessionFilterStudent').value.trim();
        const isPresent = document.getElementById('sessionFilterPresent').value;
        const startDate = document.getElementById('sessionFilterStartDate').value;
        const endDate = document.getElementById('sessionFilterEndDate').value;

        let params = `page=${page}&size=${classSessionPageSize}`;

        if (teacherName) params += `&teacherName=${encodeURIComponent(teacherName)}`;
        if (studentName) params += `&studentName=${encodeURIComponent(studentName)}`;
        if (isPresent !== '') params += `&isPresent=${isPresent}`;
        if (startDate) params += `&startTime=${Math.floor(new Date(startDate).getTime() / 1000)}`;
        if (endDate) params += `&endTime=${Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000)}`;

        const response = await fetch(`${BASE_PATH}/api/feifei/class-session-list?${params}`);
        const result = await response.json();

        if (result.success) {
            renderClassSessionTable(result.data.list);
            renderSessionPagination(result.data.pagination);
        } else {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #d32f2f;">加载失败: ' + (result.error || '未知错误') + '</td></tr>';
        }
    } catch (error) {
        console.error('加载课节列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #d32f2f;">加载失败</td></tr>';
    } finally {
        hideTabLoading('feifei-sessions-tab');
    }
}

// 渲染课节表格
function renderClassSessionTable(list) {
    const tbody = document.getElementById('classSessionTableBody');

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; padding: 40px; color: #999;">暂无数据</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(row => `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px;">${row.teacherName || '-'}</td>
            <td style="padding: 12px;">${row.studentName || '-'}</td>
            <td style="padding: 12px;">${row.mobile || '-'}</td>
            <td style="padding: 12px; text-align: center;">
                ${row.isPresent == 1
                    ? '<span style="color: #34a853;">✓ 是</span>'
                    : '<span style="color: #d32f2f;">✗ 否</span>'}
            </td>
            <td style="padding: 12px;">${formatSessionTime(row.startTimestamp)}</td>
            <td style="padding: 12px;">${formatDateTimeStr(row.teacherjongTime)}</td>
            <td style="padding: 12px;">${formatDateTimeStr(row.studentEnterTime)}</td>
            <td style="padding: 12px;">${formatDateTimeStr(row.teacherLeaveTime)}</td>
            <td style="padding: 12px; text-align: center;">
                ${row.classFeedback
                    ? '<span style="color: #34a853;">有</span>'
                    : '<span style="color: #999;">无</span>'}
            </td>
            <td style="padding: 12px;">${renderRecordLinks(row.classRecord)}</td>
            <td style="padding: 12px; text-align: center;">
                <button onclick="openSessionDetail('${row.id}', '${row.studId}')"
                        style="padding: 6px 12px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    详情
                </button>
            </td>
        </tr>
    `).join('');
}

// 格式化时间戳
function formatSessionTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 格式化日期时间字符串
function formatDateTimeStr(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) return '-';
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 渲染录屏链接
function renderRecordLinks(classRecord) {
    if (!classRecord) return '-';

    try {
        const record = typeof classRecord === 'string' ? JSON.parse(classRecord) : classRecord;
        const fileList = record?.VodInfo?.FileList;
        if (!fileList || fileList.length === 0) return '-';

        return fileList.map((file, index) => {
            const url = file.Playset?.[0]?.Url || file.Url;
            if (!url) return '';
            return `<a href="${url}" target="_blank" style="color: #4285f4; text-decoration: none; margin-right: 8px;">录屏${index + 1}</a>`;
        }).filter(Boolean).join('') || '-';
    } catch (e) {
        return '-';
    }
}

// 渲染分页
function renderSessionPagination(pagination) {
    const container = document.getElementById('classSessionPagination');
    const { page, size, total } = pagination;
    const totalPages = Math.ceil(total / size);

    if (totalPages <= 1) {
        container.innerHTML = `<span style="color: #666;">共 ${total} 条记录</span>`;
        return;
    }

    let html = `<span style="color: #666; margin-right: 10px;">共 ${total} 条</span>`;

    // 上一页
    if (page > 1) {
        html += `<button onclick="loadClassSessionList(${page - 1})" style="padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">上一页</button>`;
    }

    // 页码
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    for (let i = startPage; i <= endPage; i++) {
        if (i === page) {
            html += `<button style="padding: 6px 12px; border: 1px solid #4285f4; background: #4285f4; color: white; border-radius: 4px; margin: 0 2px;">${i}</button>`;
        } else {
            html += `<button onclick="loadClassSessionList(${i})" style="padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer; margin: 0 2px;">${i}</button>`;
        }
    }

    // 下一页
    if (page < totalPages) {
        html += `<button onclick="loadClassSessionList(${page + 1})" style="padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">下一页</button>`;
    }

    html += `<span style="color: #666; margin-left: 10px;">共 ${totalPages} 页</span>`;

    container.innerHTML = html;
}
```

- **VALIDATE**: 刷新页面，切换到课节管理 Tab，应能加载列表数据

### TASK 7: ADD dashboard.html - 详情弹窗 JavaScript 函数

**目标文件**: `baboontalkies_manager/dashboard.html`

**位置**: 紧接 TASK 6 的代码之后

- **IMPLEMENT**: 添加详情弹窗相关函数

```javascript
// ========== 课节详情弹窗 ==========

// 打开详情弹窗
async function openSessionDetail(recordId, studId) {
    const modal = document.getElementById('classSessionDetailModal');
    modal.style.display = 'flex';

    // 重置内容
    document.getElementById('recentSessionTabs').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionMaterials').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionScreenshots').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionRecords').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionFeedbackContent').innerHTML = '<span style="color: #999;">加载中...</span>';

    try {
        // 加载该学生近7节课
        const response = await fetch(`${BASE_PATH}/api/feifei/student-recent-sessions?studId=${studId}`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            recentSessionsList = result.data;
            currentSelectedSessionId = recordId;

            renderRecentSessionTabs();
            await loadSessionDetailContent(recordId);
        } else {
            document.getElementById('recentSessionTabs').innerHTML = '<span style="color: #999;">暂无课节数据</span>';
        }
    } catch (error) {
        console.error('加载详情失败:', error);
        document.getElementById('recentSessionTabs').innerHTML = '<span style="color: #d32f2f;">加载失败</span>';
    }
}

// 渲染近7节课 Tab
function renderRecentSessionTabs() {
    const container = document.getElementById('recentSessionTabs');

    container.innerHTML = recentSessionsList.map(session => {
        const isActive = session.id == currentSelectedSessionId;
        const timeStr = formatSessionTime(session.startTimestamp);
        return `
            <button onclick="switchSessionTab('${session.id}')"
                    style="padding: 8px 16px; border: 1px solid ${isActive ? '#4285f4' : '#ddd'};
                           background: ${isActive ? '#4285f4' : 'white'};
                           color: ${isActive ? 'white' : '#333'};
                           border-radius: 6px; cursor: pointer; font-size: 13px;">
                ${timeStr}
            </button>
        `;
    }).join('');
}

// 切换课节 Tab
async function switchSessionTab(sessionId) {
    currentSelectedSessionId = sessionId;
    renderRecentSessionTabs();
    await loadSessionDetailContent(sessionId);
}

// 加载课节详情内容
async function loadSessionDetailContent(sessionId) {
    const session = recentSessionsList.find(s => s.id == sessionId);
    if (!session) return;

    currentSessionDetailData = session;

    // 加载教材
    loadSessionMaterials(session.classId, session.courseId);

    // 渲染截图
    renderSessionScreenshots(session.blackboardImage);

    // 渲染录屏
    renderSessionRecords(session.classRecord);

    // 渲染反馈
    renderSessionFeedback(session.classFeedback);
}

// 加载教材
async function loadSessionMaterials(classId, courseId) {
    const container = document.getElementById('sessionMaterials');

    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/textbooks-by-class?classId=${classId}&courseId=${courseId}`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            container.innerHTML = result.data.map(tb =>
                `<span style="padding: 8px 16px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px;">${tb.title}</span>`
            ).join('');
        } else {
            container.innerHTML = '<span style="color: #999;">暂无教材</span>';
        }
    } catch (error) {
        console.error('加载教材失败:', error);
        container.innerHTML = '<span style="color: #999;">加载失败</span>';
    }
}

// 渲染截图
function renderSessionScreenshots(blackboardImage) {
    const container = document.getElementById('sessionScreenshots');

    if (!blackboardImage || blackboardImage.length === 0) {
        container.innerHTML = '<span style="color: #999;">暂无截图</span>';
        return;
    }

    try {
        const images = typeof blackboardImage === 'string' ? JSON.parse(blackboardImage) : blackboardImage;

        if (!Array.isArray(images) || images.length === 0) {
            container.innerHTML = '<span style="color: #999;">暂无截图</span>';
            return;
        }

        container.innerHTML = images.map((img, index) => {
            const url = img.picUrl || img.Url || img.url || img;
            if (!url || typeof url !== 'string') return '';
            return `
                <img src="${url}"
                     alt="截图${index + 1}"
                     style="width: 100px; height: 60px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #eee;"
                     onclick="openImagePreview('${url}')"
                     onerror="this.style.display='none'">
            `;
        }).filter(Boolean).join('') || '<span style="color: #999;">暂无截图</span>';
    } catch (e) {
        container.innerHTML = '<span style="color: #999;">暂无截图</span>';
    }
}

// 渲染录屏
function renderSessionRecords(classRecord) {
    const container = document.getElementById('sessionRecords');

    if (!classRecord) {
        container.innerHTML = '<span style="color: #999;">暂无录屏</span>';
        return;
    }

    try {
        const record = typeof classRecord === 'string' ? JSON.parse(classRecord) : classRecord;
        const fileList = record?.VodInfo?.FileList;

        if (!fileList || fileList.length === 0) {
            container.innerHTML = '<span style="color: #999;">暂无录屏</span>';
            return;
        }

        container.innerHTML = fileList.map((file, index) => {
            const url = file.Playset?.[0]?.Url || file.Url;
            if (!url) return '';
            return `<a href="${url}" target="_blank" style="color: #4285f4; text-decoration: none; padding: 8px 16px; border: 1px solid #4285f4; border-radius: 6px;">录屏${index + 1}</a>`;
        }).filter(Boolean).join('') || '<span style="color: #999;">暂无录屏</span>';
    } catch (e) {
        container.innerHTML = '<span style="color: #999;">暂无录屏</span>';
    }
}

// 渲染反馈
function renderSessionFeedback(classFeedback) {
    const typeContainer = document.getElementById('sessionFeedbackType');
    const contentContainer = document.getElementById('sessionFeedbackContent');

    if (!classFeedback) {
        typeContainer.innerHTML = '';
        contentContainer.innerHTML = '<span style="color: #999;">暂无反馈</span>';
        return;
    }

    try {
        const feedback = typeof classFeedback === 'string' ? JSON.parse(classFeedback) : classFeedback;
        const feedbackType = feedback.feedbackType || 'trial';

        // 渲染类型选择（只读）
        typeContainer.innerHTML = `
            <label style="margin-right: 20px; cursor: default; ${feedbackType === 'trial' ? 'color: #4285f4;' : 'color: #999;'}">
                <input type="radio" name="feedbackTypeDisplay" value="trial" ${feedbackType === 'trial' ? 'checked' : ''} disabled style="margin-right: 5px;">
                Trial Class
            </label>
            <label style="cursor: default; ${feedbackType === 'regular' ? 'color: #4285f4;' : 'color: #999;'}">
                <input type="radio" name="feedbackTypeDisplay" value="regular" ${feedbackType === 'regular' ? 'checked' : ''} disabled style="margin-right: 5px;">
                Regular Class
            </label>
        `;

        // 根据类型渲染不同内容
        if (feedbackType === 'trial') {
            contentContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Evaluation</h5>
                        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; min-height: 80px; font-size: 13px; line-height: 1.6;">
                            ${feedback.Evaluation || '暂无'}
                        </div>
                    </div>
                    <div>
                        <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Suggestion for the next action</h5>
                        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; min-height: 80px; font-size: 13px; line-height: 1.6;">
                            ${feedback.regular || '暂无'}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Regular Class 反馈
            const doingWellHtml = feedback.doingWellList && feedback.doingWellList.length > 0
                ? `<div style="margin-bottom: 16px;">
                    <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Doing Well</h5>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8;">
                        ${feedback.doingWellList.map(item => `<li>${item.text || item}</li>`).join('')}
                    </ul>
                   </div>`
                : '';

            const needExerciseHtml = feedback.needExerciseList && feedback.needExerciseList.length > 0
                ? `<div>
                    <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Need Exercise</h5>
                    ${feedback.needExerciseList.map(item => `
                        <div style="background: #f9fafb; padding: 10px; border-radius: 6px; margin-bottom: 8px; font-size: 13px;">
                            <div><strong>You said:</strong> ${item.youSaid || '-'}</div>
                            <div><strong>Better say:</strong> ${item.betterSay || '-'}</div>
                        </div>
                    `).join('')}
                   </div>`
                : '';

            contentContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Key Content</h5>
                        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; min-height: 80px; font-size: 13px; line-height: 1.6;">
                            ${feedback.keyContent || '暂无'}
                        </div>
                    </div>
                    <div>
                        ${doingWellHtml}
                        ${needExerciseHtml}
                        ${!doingWellHtml && !needExerciseHtml ? '<span style="color: #999;">暂无详细内容</span>' : ''}
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error('解析反馈失败:', e);
        typeContainer.innerHTML = '';
        contentContainer.innerHTML = '<span style="color: #999;">暂无反馈</span>';
    }
}

// 关闭详情弹窗
function closeSessionDetailModal() {
    document.getElementById('classSessionDetailModal').style.display = 'none';
    currentSessionDetailData = null;
    recentSessionsList = [];
    currentSelectedSessionId = null;
}

// 图片预览
function openImagePreview(url) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    img.src = url;
    modal.style.display = 'flex';
}

function closeImagePreview() {
    document.getElementById('imagePreviewModal').style.display = 'none';
}
```

- **VALIDATE**: 点击列表中的"详情"按钮，应打开详情弹窗并正确显示内容

### TASK 8: UPDATE dashboard.html - Tab 切换时初始化加载

**目标文件**: `baboontalkies_manager/dashboard.html`

**位置**: 找到 `tabs.forEach(tab =>` 的 Tab 切换事件处理代码

- **IMPLEMENT**: 在课节管理 Tab 激活时初始化并加载数据

在 Tab 切换逻辑中，找到类似下面的代码块并添加课节管理的初始化：

```javascript
// 在 switchTab 函数或 Tab 点击事件中
if (targetTab === 'feifei-sessions-tab') {
    initSessionFilters();
    loadClassSessionList();
}
```

- **PATTERN**: 参考其他 Tab 的初始化逻辑
- **GOTCHA**: 确保只在首次切换到该 Tab 时或需要刷新时加载数据
- **VALIDATE**: 点击课节管理 Tab 应自动加载列表数据

### TASK 9: CLEANUP - 移除旧的周视图代码（可选）

**目标文件**: `baboontalkies_manager/dashboard.html`

- **IMPLEMENT**: 可选择保留或注释掉旧的周视图相关代码（`initWeekView`, `getWeekDates`, `updateWeekDisplay`, `changeWeek`, `loadFeifeiClassSessions` 等函数）

如果确定不再需要周视图功能，可以将这些函数注释掉或删除，以减少代码冗余。

- **GOTCHA**: 确保老师数据 Tab 中的"查看课程"弹窗如果使用了这些函数需要单独处理
- **VALIDATE**: 确保其他功能不受影响

---

## TESTING STRATEGY

### 手动测试步骤

1. **启动服务器**: `PORT=3000 npm run dashboard-http`
2. **访问**: http://localhost:3000

### 列表功能测试

- [ ] 课节管理 Tab 显示表格列表
- [ ] 列表包含所有必要字段
- [ ] 手机号中间已隐藏 (如 138****1234)
- [ ] 签到状态正确显示（是/否）
- [ ] 时间格式正确 (MM-DD HH:mm)
- [ ] 录屏链接可点击跳转
- [ ] 课节反馈显示有/无
- [ ] 分页功能正常

### 筛选功能测试

- [ ] 教师姓名筛选
- [ ] 学生姓名筛选
- [ ] 签到状态筛选
- [ ] 日期范围筛选
- [ ] 重置按钮

### 详情弹窗测试

- [ ] 点击详情按钮弹出弹窗
- [ ] 近7节课 Tab 显示正确
- [ ] Tab 切换后内容更新
- [ ] 教材列表正确显示
- [ ] 截图可预览（点击放大）
- [ ] 录屏链接可跳转
- [ ] Trial Class 反馈展示正确
- [ ] Regular Class 反馈展示正确
- [ ] 关闭按钮功能正常

---

## VALIDATION COMMANDS

### Level 1: 后端 API 验证

```bash
# 测试课节列表 API
curl "http://localhost:3000/api/feifei/class-session-list?page=1&size=10"

# 测试学生近期课节 API
curl "http://localhost:3000/api/feifei/student-recent-sessions?studId=123456"

# 测试教材查询 API
curl "http://localhost:3000/api/feifei/textbooks-by-class?classId=123&courseId=456"
```

### Level 2: 启动服务验证

```bash
cd baboontalkies_manager
PORT=3000 npm run dashboard-http
# 访问 http://localhost:3000
```

### Level 3: 控制台检查

在浏览器控制台执行：
```javascript
// 检查弹窗元素存在
console.log(document.getElementById('classSessionDetailModal'));

// 检查函数存在
console.log(typeof loadClassSessionList);
console.log(typeof openSessionDetail);
```

---

## ACCEPTANCE CRITERIA

- [ ] 课节管理 Tab 显示列表而非占位符
- [ ] 列表包含所有必要字段：老师、学生、学生手机号、签到、课节开始时间、老师首次进入、学生首次进入、老师最后离开、课节反馈、录屏、操作
- [ ] 学生手机号中间3位已隐藏
- [ ] 筛选功能正常工作
- [ ] 分页功能正常工作
- [ ] 点击列表项可展示详情弹窗
- [ ] 详情弹窗包含近7节课 Tab 切换
- [ ] 详情弹窗展示教材、截图、录屏、反馈
- [ ] Trial Class 和 Regular Class 两种反馈类型正确显示
- [ ] 页面样式与现有风格一致
- [ ] 所有 API 请求无报错

---

## COMPLETION CHECKLIST

- [ ] 后端 `/api/feifei/class-session-list` API 实现
- [ ] 后端 `/api/feifei/student-recent-sessions` API 实现
- [ ] 后端 `/api/feifei/textbooks-by-class` API 实现
- [ ] 前端表格 HTML 结构完成
- [ ] 前端筛选表单实现
- [ ] 前端表格渲染逻辑完成
- [ ] 前端分页功能完成
- [ ] 详情弹窗 HTML 结构完成
- [ ] 近7节课 Tab 切换实现
- [ ] 教材展示实现
- [ ] 截图展示和预览实现
- [ ] 录屏链接展示实现
- [ ] 反馈内容（Trial/Regular）展示实现
- [ ] Tab 切换初始化完成
- [ ] 所有测试通过

---

## NOTES

### 设计决策

**为什么新建 API 而不是复用现有 feifei-backend 的接口？**
- dashboard.html 是独立部署的单页应用
- 需要简化的 REST API，不依赖 cool-admin 框架
- 减少跨域和认证复杂性

**为什么近7节课基于学生而不是教师？**
- 用户需求是查看"这个学生"的历史课节
- 便于追踪单个学生的学习进度

**反馈类型的处理**
- Trial Class: 展示 Evaluation 和 Suggestion
- Regular Class: 展示 Key Content、Doing Well、Need Exercise

### 潜在风险

**性能考虑**
- 大数据量时分页是必要的
- 详情弹窗额外请求教材可能有延迟

**数据一致性**
- JSON 字段（blackboardImage, classRecord, classFeedback）需要做好空值和解析错误处理

### 未来优化方向

1. 添加导出 Excel 功能
2. 添加批量操作功能
3. 添加更多筛选条件（课程名等）
4. 移动端适配优化

<!-- EOF -->
