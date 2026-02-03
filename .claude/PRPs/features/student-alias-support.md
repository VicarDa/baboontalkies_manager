# Feature: 学生别名支持

## Feature Description

在学员数据页面增加"编辑"按钮，支持为学生配置别名。系统会将不同名字视为同一个学生，在老师课程日历视图等所有显示学生的地方统一显示，解决 ClassIn 和约课宝中同一学生使用不同名字的问题。

## User Story

As a 管理员
I want to 为学生配置别名（可以是 ClassIn 或约课宝中使用的不同名字）
So that 系统在对比数据时能正确识别同一个学生，准确统计课程和差异

## Problem Statement

1. 同一个学生在 ClassIn 和约课宝中可能使用不同的名字
2. 当前系统按名字完全匹配，导致无法正确对比同一学生的课程数据
3. 日历视图中显示为两个不同的学生，造成数据差异的误报

## Solution Statement

1. 创建新表 `yuekebao_student_aliases` 存储学生别名配置
2. 在学员数据页面表格中添加"编辑"按钮
3. 创建学生编辑模态框，支持配置别名
4. 修改 `/api/teacher-schedule-compare` API 返回学生别名映射
5. 修改 `renderTeacherCalendarView` 函数使用学生别名映射统一名字

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: src/index.js, dashboard.html
**Dependencies**: 无新增依赖

---

## CONTEXT REFERENCES

### Relevant Codebase Files

- `dashboard.html` (行 1445-1463) - 学员数据表格 HTML
- `dashboard.html` (行 2969-3090) - renderTable 函数（学员表格渲染）
- `dashboard.html` (行 5087-5236) - renderTeacherCalendarView 函数（日历视图）
- `src/index.js` (行 4107-4142) - GET /api/students 学生列表 API
- `src/index.js` (行 4656-4682) - 老师别名映射的实现（作为参考模式）
- `src/index.js` (行 3894-3934) - GET /api/teachers（参考别名返回模式）

### New Files to Create

无需创建新文件，所有修改在现有文件中进行

### Patterns to Follow

**老师别名实现模式**（参考）:

数据库存储:
```sql
-- 老师别名存在 yuekebao_teacher_salary.aliases 字段
-- JSON 数组格式: '["别名1", "别名2"]'
```

API 返回别名映射:
```javascript
// 构建别名映射表：alias -> mainName
const aliasMap = {};
teacherAliases.forEach(t => {
  const aliases = JSON.parse(t.aliases);
  aliases.forEach(alias => {
    aliasMap[alias] = t.teacher_name;
  });
});
```

前端使用:
```javascript
const getNormalizedName = (name) => aliasMap[name] || name;
```

---

## IMPLEMENTATION PLAN

### Phase 1: 数据库层

创建学生别名表存储配置

### Phase 2: API 层

创建学生别名 CRUD API，修改课程对比 API 返回学生别名映射

### Phase 3: 前端界面

在学员表格添加编辑按钮，创建编辑模态框，修改日历视图使用别名

---

## STEP-BY-STEP TASKS

### Task 1: CREATE 学生别名数据库表

**IMPLEMENT**: 创建 `yuekebao_student_aliases` 表

**SQL**:
```sql
CREATE TABLE IF NOT EXISTS yuekebao_student_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_name VARCHAR(255) NOT NULL COMMENT '学生主名字',
  aliases TEXT DEFAULT NULL COMMENT '学生别名，JSON数组格式',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_student_name (student_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**VALIDATE**: 执行 SQL 后检查表结构

---

### Task 2: ADD GET /api/student-aliases API

**文件**: `src/index.js`
**位置**: 在 `/api/students` API 附近添加

**IMPLEMENT**: 获取学生别名配置列表

```javascript
// API接口：获取学生别名配置列表
this.app.get('/api/student-aliases', async (req, res) => {
  let connection;
  try {
    connection = await getDbConnection();
    const [rows] = await connection.execute(
      `SELECT student_name, aliases FROM yuekebao_student_aliases ORDER BY student_name`
    );

    // 解析 aliases JSON
    rows.forEach(r => {
      try {
        r.aliases = r.aliases ? JSON.parse(r.aliases) : [];
      } catch (e) {
        r.aliases = [];
      }
    });

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('获取学生别名列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});
```

**VALIDATE**: `curl http://localhost:9000/api/student-aliases`

---

### Task 3: ADD POST /api/student-aliases API

**文件**: `src/index.js`

**IMPLEMENT**: 添加或更新学生别名

```javascript
// API接口：添加或更新学生别名
this.app.post('/api/student-aliases', async (req, res) => {
  let connection;
  try {
    const { student_name, aliases } = req.body;

    if (!student_name) {
      return res.status(400).json({ success: false, error: '学生名字不能为空' });
    }

    connection = await getDbConnection();
    const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;

    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
    await connection.execute(
      `INSERT INTO yuekebao_student_aliases (student_name, aliases)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE aliases = VALUES(aliases), update_time = CURRENT_TIMESTAMP`,
      [student_name, aliasesJson]
    );

    res.json({ success: true, message: '保存成功' });
  } catch (error) {
    console.error('保存学生别名失败:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) await connection.end();
  }
});
```

**VALIDATE**: 测试添加学生别名

---

### Task 4: UPDATE /api/teacher-schedule-compare API

**文件**: `src/index.js`
**位置**: 行 4656-4682 附近（老师别名映射后面）

**IMPLEMENT**: 添加学生别名映射到返回数据

在返回数据前添加:
```javascript
// 获取学生别名映射
const [studentAliases] = await connection.execute(`
  SELECT student_name, aliases FROM yuekebao_student_aliases WHERE aliases IS NOT NULL AND aliases != ''
`);

// 构建学生别名映射表：alias -> mainName
const studentAliasMap = {};
studentAliases.forEach(s => {
  try {
    const aliases = JSON.parse(s.aliases);
    if (Array.isArray(aliases)) {
      aliases.forEach(alias => {
        studentAliasMap[alias] = s.student_name;
      });
    }
  } catch (e) {}
});
```

修改返回数据:
```javascript
res.json({
  success: true,
  data: {
    yuekebao: yuekebaoData,
    classin: classinData,
    teachers: allTeachers.map(t => t.teacher),
    aliasMap: aliasMap,
    studentAliasMap: studentAliasMap  // 新增
  }
});
```

**VALIDATE**: `curl "http://localhost:9000/api/teacher-schedule-compare?startTime=1738281600&endTime=1738886400" | jq '.data.studentAliasMap'`

---

### Task 5: UPDATE 学员数据表格 HTML

**文件**: `dashboard.html`
**位置**: 行 1448-1455 表头

**IMPLEMENT**: 在表头添加"操作"列

**查找**:
```html
<th class="class-column" data-column="nextClass" data-type="text">之后课节</th>
```

**替换为**:
```html
<th class="class-column" data-column="nextClass" data-type="text">之后课节</th>
<th style="width: 60px; text-align: center;">操作</th>
```

同时更新 colspan 从 6 到 7（在 "没有找到数据" 的行）

**VALIDATE**: 刷新页面检查表头

---

### Task 6: UPDATE renderTable 函数

**文件**: `dashboard.html`
**位置**: 行 3060-3090 的 map 循环中

**IMPLEMENT**: 在表格行末尾添加编辑按钮

在 `</td>` 最后一个后，`</tr>` 前添加:
```html
<td style="text-align: center;">
    <button onclick="editStudent('${(student.name || '').replace(/'/g, "\\'")}')"
            style="padding: 3px 8px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
        编辑
    </button>
</td>
```

**VALIDATE**: 刷新页面检查编辑按钮

---

### Task 7: ADD 学生编辑模态框和相关函数

**文件**: `dashboard.html`
**位置**: 在 `saveTeacherConfig` 函数附近添加

**IMPLEMENT**: 添加学生编辑相关的 JavaScript 函数

```javascript
// ========== 学生别名管理 ==========
let studentAliasesCache = {};

// 加载学生别名配置
async function loadStudentAliases() {
    try {
        const response = await fetch(`${BASE_PATH}/api/student-aliases`);
        const result = await response.json();
        if (result.success) {
            studentAliasesCache = {};
            result.data.forEach(item => {
                studentAliasesCache[item.student_name] = item.aliases || [];
            });
        }
    } catch (error) {
        console.error('加载学生别名失败:', error);
    }
}

// 编辑学生
function editStudent(studentName) {
    const aliases = studentAliasesCache[studentName] || [];
    showStudentModal(studentName, aliases);
}

// 显示学生编辑模态框
function showStudentModal(studentName, aliases) {
    const modal = document.createElement('div');
    modal.id = 'studentModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); display: flex; align-items: center;
        justify-content: center; z-index: 10001;
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; width: 400px; max-width: 90%;">
            <h3 style="margin: 0 0 20px 0; color: #333;">✏️ 编辑学生</h3>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">学生名字</label>
                <input type="text" id="modalStudentName" value="${studentName}"
                       readonly style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; background: #f5f5f5;">
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">学生别名</label>
                <input type="text" id="modalStudentAliases" value="${aliases.join(', ')}"
                       placeholder="多个别名用逗号分隔"
                       style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
                <small style="color: #999; font-size: 11px; display: block; margin-top: 4px;">用于匹配 ClassIn 或约课宝中使用的其他名字</small>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="closeStudentModal()"
                        style="padding: 10px 20px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">
                    取消
                </button>
                <button onclick="saveStudentAlias()"
                        style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    保存
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeStudentModal();
    });

    document.body.appendChild(modal);
}

// 关闭学生模态框
function closeStudentModal() {
    const modal = document.getElementById('studentModal');
    if (modal) modal.remove();
}

// 保存学生别名
async function saveStudentAlias() {
    const studentName = document.getElementById('modalStudentName').value.trim();
    const aliasesInput = document.getElementById('modalStudentAliases').value.trim();
    const aliases = aliasesInput ? aliasesInput.split(',').map(a => a.trim()).filter(a => a) : [];

    try {
        const response = await fetch(`${BASE_PATH}/api/student-aliases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_name: studentName, aliases: aliases })
        });

        const result = await response.json();

        if (result.success) {
            showToast('学生别名已保存', 'success');
            closeStudentModal();
            // 更新缓存
            studentAliasesCache[studentName] = aliases;
        } else {
            alert(result.error || '保存失败');
        }
    } catch (error) {
        console.error('保存学生别名失败:', error);
        alert('保存失败: ' + error.message);
    }
}
```

**VALIDATE**: 检查函数定义无语法错误

---

### Task 8: UPDATE 页面初始化加载学生别名

**文件**: `dashboard.html`
**位置**: 在 `fetchDashboardData` 函数调用附近

**IMPLEMENT**: 页面加载时获取学生别名

在 `fetchDashboardData()` 调用后添加:
```javascript
loadStudentAliases();
```

**VALIDATE**: 刷新页面，检查网络请求

---

### Task 9: UPDATE loadTeacherCalendarData 函数

**文件**: `dashboard.html`
**位置**: 调用 renderTeacherCalendarView 的地方

**IMPLEMENT**: 传递 studentAliasMap 参数

**查找**:
```javascript
renderTeacherCalendarView(result.data, dates, result.data.aliasMap || {});
```

**替换为**:
```javascript
renderTeacherCalendarView(result.data, dates, result.data.aliasMap || {}, result.data.studentAliasMap || {});
```

**VALIDATE**: 检查函数调用

---

### Task 10: UPDATE renderTeacherCalendarView 函数

**文件**: `dashboard.html`
**位置**: 行 5087

**IMPLEMENT**: 添加 studentAliasMap 参数并使用

**查找**:
```javascript
function renderTeacherCalendarView(data, dates, aliasMap = {}) {
    const tbody = document.getElementById('teacherCalendarBody');
    const { yuekebao, classin } = data;

    // 辅助函数：获取标准化的老师名字（通过别名映射）
    const getNormalizedTeacher = (name) => aliasMap[name] || name;
```

**替换为**:
```javascript
function renderTeacherCalendarView(data, dates, aliasMap = {}, studentAliasMap = {}) {
    const tbody = document.getElementById('teacherCalendarBody');
    const { yuekebao, classin } = data;

    // 辅助函数：获取标准化的老师名字（通过别名映射）
    const getNormalizedTeacher = (name) => aliasMap[name] || name;
    // 辅助函数：获取标准化的学生名字（通过别名映射）
    const getNormalizedStudent = (name) => studentAliasMap[name] || name;
```

**VALIDATE**: 检查函数签名

---

### Task 11: UPDATE ClassIn 数据中学生名字处理

**文件**: `dashboard.html`
**位置**: renderTeacherCalendarView 函数中 ClassIn 数据处理部分

**IMPLEMENT**: 使用学生别名映射

**查找** (约行 5103-5105):
```javascript
if (s.studentName) {
    classinMap[key].teachers[teacher].students.push(s.studentName);
}
```

**替换为**:
```javascript
if (s.studentName) {
    classinMap[key].teachers[teacher].students.push(getNormalizedStudent(s.studentName));
}
```

**VALIDATE**: 检查代码

---

### Task 12: UPDATE 约课宝数据中学生名字处理

**文件**: `dashboard.html`
**位置**: renderTeacherCalendarView 函数中约课宝数据处理部分

**IMPLEMENT**: 使用学生别名映射

**查找** (约行 5121-5123):
```javascript
if (s.student) {
    yuekebaoMap[key].teachers[teacher].students.push(s.student);
}
```

**替换为**:
```javascript
if (s.student) {
    yuekebaoMap[key].teachers[teacher].students.push(getNormalizedStudent(s.student));
}
```

**VALIDATE**: 检查代码

---

## TESTING STRATEGY

### Manual Tests

1. **创建学生别名**: 在学员数据页面点击编辑按钮，添加别名，保存
2. **别名对比**: 在老师课程日历视图中，确认不同名字的同一学生被正确合并
3. **数据匹配**: 确认黄色差异格子减少（因为学生名字统一了）

### Edge Cases

- 空别名数组
- 别名包含特殊字符
- 一个别名不应映射到多个学生

---

## VALIDATION COMMANDS

### Level 1: 语法检查

```bash
node --check /Users/panda/Documents/Apps/BaboonTalkies/baboontalkies_manager/src/index.js
```

### Level 2: 服务启动

```bash
cd /Users/panda/Documents/Apps/BaboonTalkies/baboontalkies_manager
PORT=9000 npm run dashboard-http
```

### Level 3: API 测试

```bash
# 获取学生别名列表
curl http://localhost:9000/api/student-aliases

# 添加学生别名
curl -X POST http://localhost:9000/api/student-aliases \
  -H "Content-Type: application/json" \
  -d '{"student_name":"测试学生","aliases":["别名1","别名2"]}'

# 检查课程对比 API 返回 studentAliasMap
curl "http://localhost:9000/api/teacher-schedule-compare?startTime=1738281600&endTime=1738886400" | jq '.data.studentAliasMap'
```

### Level 4: 手动验证

1. 打开 http://localhost:9000
2. 在学员数据 tab，找到一个学生，点击"编辑"
3. 添加别名，保存
4. 切换到老师数据 tab
5. 验证有别名的学生数据被正确合并

---

## ACCEPTANCE CRITERIA

- [ ] 数据库表 yuekebao_student_aliases 已创建
- [ ] GET /api/student-aliases 正常返回
- [ ] POST /api/student-aliases 可以保存别名
- [ ] 学员数据表格有"编辑"按钮
- [ ] 点击编辑可以配置学生别名
- [ ] /api/teacher-schedule-compare 返回 studentAliasMap
- [ ] 日历视图使用学生别名映射统一名字
- [ ] 不同名字的同一学生数据被正确合并对比
- [ ] 无 JavaScript 错误

---

## COMPLETION CHECKLIST

- [ ] Task 1: 创建数据库表 (需用户执行SQL)
- [x] Task 2: GET /api/student-aliases API
- [x] Task 3: POST /api/student-aliases API
- [x] Task 4: 更新 /api/teacher-schedule-compare 返回 studentAliasMap
- [x] Task 5: 更新学员表格表头
- [x] Task 6: 更新 renderTable 添加编辑按钮
- [x] Task 7: 添加学生编辑模态框和函数
- [x] Task 8: 页面初始化加载学生别名
- [x] Task 9: 更新 loadTeacherCalendarData
- [x] Task 10: 更新 renderTeacherCalendarView 函数签名
- [x] Task 11: 更新 ClassIn 学生名字处理
- [x] Task 12: 更新约课宝学生名字处理
- [ ] 所有验证命令执行成功
- [ ] 手动测试确认功能正常

---

## NOTES

### 设计决策

1. **独立表存储**: 使用单独的 `yuekebao_student_aliases` 表而非在 `yuekebao_student_cardnum` 添加字段，因为后者按课程卡记录学生，同一学生可能有多条记录
2. **UPSERT 模式**: 使用 `INSERT ... ON DUPLICATE KEY UPDATE` 简化添加/更新逻辑
3. **与老师别名一致**: 前端实现模式与老师别名保持一致，便于维护

### 数据流

```
数据库 (yuekebao_student_aliases)
    ↓
API 解析 JSON → 返回 studentAliasMap
    ↓
前端 getNormalizedStudent() 统一名字
    ↓
日历视图正确合并显示
```

### 示例

假设配置了学生"小明"的别名为 ["Ming", "明明"]:

- ClassIn 数据: studentName = "Ming"
- 约课宝数据: student = "小明"
- studentAliasMap = { "Ming": "小明", "明明": "小明" }
- 渲染时两者都被映射为 "小明"，可以正确对比

<!-- EOF -->
