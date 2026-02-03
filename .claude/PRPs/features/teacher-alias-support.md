# Feature: 老师别名支持

## Feature Description

在系统设置的老师配置管理中增加"老师别名"功能。一个老师可以有多个别名，系统会将这些不同名字视为同一个人。这样可以解决 ClassIn 和约课宝中同一老师使用不同名字的问题，在日历视图对比时能正确匹配数据。

## User Story

As a 管理员
I want to 为老师配置别名（可以是 ClassIn 或约课宝中使用的不同名字）
So that 系统在对比数据时能正确识别同一个老师，即使他们在不同平台使用不同的名字

## Problem Statement

1. 同一个老师在 ClassIn 和约课宝中可能使用不同的名字（如 "Pearly" vs "黄墨炎"）
2. 当前系统按名字完全匹配，导致无法正确对比同一老师的课程数据
3. 日历视图中显示为两个不同的老师，无法准确统计和对比

## Solution Statement

1. 在 `yuekebao_teacher_salary` 表中添加 `aliases` 字段存储别名（JSON 数组格式）
2. 修改老师配置管理界面，支持添加/编辑/显示别名
3. 修改日历视图的数据处理逻辑，将别名映射到主名字后再进行对比
4. API 返回别名映射表，前端在渲染前先统一名字

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: src/index.js, dashboard.html
**Dependencies**: 无新增依赖

---

## CONTEXT REFERENCES

### Relevant Codebase Files

- `src/index.js` (行 3894-3925) - GET /api/teachers 获取老师列表
- `src/index.js` (行 3927-3980) - POST /api/teachers 添加老师
- `src/index.js` (行 3982-4049) - PUT /api/teachers/:name 更新老师
- `src/index.js` (行 4565-4661) - GET /api/teacher-schedule-compare 课程对比 API
- `dashboard.html` (行 1628-1648) - 老师配置管理表格 HTML
- `dashboard.html` (行 5328-5400) - showTeacherModal 函数（添加/编辑老师弹窗）
- `dashboard.html` (行 5408-5452) - saveTeacher 函数
- `dashboard.html` (行 5086-5232) - renderTeacherCalendarView 日历渲染函数
- `dashboard.html` (行 5260-5313) - loadTeachersConfig 和 renderTeachersTable 函数

### New Files to Create

无需创建新文件，所有修改在现有文件中进行

### Patterns to Follow

**数据库字段设计**：
- 使用 JSON 字符串存储数组类型数据（MySQL TEXT 字段存储 JSON）
- 示例：`aliases = '["黄墨炎", "Pearl"]'`

**API 响应格式**（参考现有模式）：
```javascript
res.json({
  success: true,
  teachers: [...],
  aliasMap: { '黄墨炎': 'Pearly', 'Pearl': 'Pearly' }
});
```

**表单输入样式**（参考现有 modal）：
```html
<input type="text" id="modalTeacherAliases" placeholder="多个别名用逗号分隔"
       style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;">
```

---

## IMPLEMENTATION PLAN

### Phase 1: 数据库层

修改数据库表结构，添加 aliases 字段

### Phase 2: API 层

更新 CRUD API 支持别名字段，并在课程对比 API 中返回别名映射

### Phase 3: 前端界面

更新老师配置管理界面和日历视图的数据处理逻辑

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE 数据库表结构

**文件**: 通过 API 执行 SQL

**IMPLEMENT**: 添加 aliases 字段到 yuekebao_teacher_salary 表

**SQL**:
```sql
ALTER TABLE yuekebao_teacher_salary
ADD COLUMN aliases TEXT DEFAULT NULL COMMENT '老师别名，JSON数组格式';
```

**VALIDATE**: 执行 SQL 后检查表结构

---

### Task 2: UPDATE GET /api/teachers API

**文件**: `src/index.js`
**位置**: 行 3894-3925

**IMPLEMENT**: 修改 SELECT 语句包含 aliases 字段

**查找**:
```javascript
const [teachers] = await connection.execute(
  `SELECT teacher_name, type, salary_per_class_time, salary_unit, salary_account
   FROM yuekebao_teacher_salary
   ORDER BY type, teacher_name`
);
```

**替换为**:
```javascript
const [teachers] = await connection.execute(
  `SELECT teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases
   FROM yuekebao_teacher_salary
   ORDER BY type, teacher_name`
);

// 解析 aliases JSON
teachers.forEach(t => {
  try {
    t.aliases = t.aliases ? JSON.parse(t.aliases) : [];
  } catch (e) {
    t.aliases = [];
  }
});
```

**VALIDATE**: `curl http://localhost:9000/api/teachers | jq '.teachers[0]'`

---

### Task 3: UPDATE POST /api/teachers API

**文件**: `src/index.js`
**位置**: 行 3927-3980

**IMPLEMENT**: 修改 INSERT 语句包含 aliases 字段

**查找**:
```javascript
const { teacher_name, type, salary_per_class_time, salary_unit, salary_account } = req.body;
```

**替换为**:
```javascript
const { teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases } = req.body;
```

**查找**:
```javascript
await connection.execute(
  `INSERT INTO yuekebao_teacher_salary (teacher_name, type, salary_per_class_time, salary_unit, salary_account)
   VALUES (?, ?, ?, ?, ?)`,
  [teacher_name, type, salary_per_class_time || 0, salary_unit || 'rmb', salary_account || '']
);
```

**替换为**:
```javascript
const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;
await connection.execute(
  `INSERT INTO yuekebao_teacher_salary (teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases)
   VALUES (?, ?, ?, ?, ?, ?)`,
  [teacher_name, type, salary_per_class_time || 0, salary_unit || 'rmb', salary_account || '', aliasesJson]
);
```

**VALIDATE**: 测试添加带别名的老师

---

### Task 4: UPDATE PUT /api/teachers/:name API

**文件**: `src/index.js`
**位置**: 行 3982-4049

**IMPLEMENT**: 修改 UPDATE 语句包含 aliases 字段

**查找**:
```javascript
const { teacher_name, type, salary_per_class_time, salary_unit, salary_account } = req.body;
```

**替换为**:
```javascript
const { teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases } = req.body;
```

并在 UPDATE SQL 中添加 aliases 字段：
```javascript
const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;
// 在 UPDATE 语句中加入 aliases = ?
```

**VALIDATE**: 测试更新老师别名

---

### Task 5: UPDATE GET /api/teacher-schedule-compare API

**文件**: `src/index.js`
**位置**: 行 4565-4661

**IMPLEMENT**: 返回别名映射表供前端使用

在返回数据前添加：
```javascript
// 获取所有老师的别名映射
const [teacherAliases] = await connection.execute(`
  SELECT teacher_name, aliases FROM yuekebao_teacher_salary WHERE aliases IS NOT NULL
`);

// 构建别名映射表：alias -> mainName
const aliasMap = {};
teacherAliases.forEach(t => {
  try {
    const aliases = JSON.parse(t.aliases);
    if (Array.isArray(aliases)) {
      aliases.forEach(alias => {
        aliasMap[alias] = t.teacher_name;
      });
    }
  } catch (e) {}
});

// 在返回数据中添加 aliasMap
res.json({
  success: true,
  data: {
    yuekebao: yuekebaoData,
    classin: classinData,
    teachers: allTeachers.map(t => t.teacher),
    aliasMap: aliasMap  // 新增
  }
});
```

**VALIDATE**: `curl "http://localhost:9000/api/teacher-schedule-compare?startTime=1738281600&endTime=1738886400" | jq '.data.aliasMap'`

---

### Task 6: UPDATE 老师配置表格显示

**文件**: `dashboard.html`
**位置**: 行 1631-1637 表头

**IMPLEMENT**: 在表头添加"老师别名"列

**查找**:
```html
<th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd; color: #333;">老师名字</th>
<th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd; width: 80px; color: #333;">类型</th>
```

**替换为**:
```html
<th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd; color: #333;">老师名字</th>
<th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd; color: #333;">别名</th>
<th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd; width: 80px; color: #333;">类型</th>
```

同时更新 colspan 为 7（原来是 6）

**VALIDATE**: 刷新页面检查表头

---

### Task 7: UPDATE renderTeachersTable 函数

**文件**: `dashboard.html`
**位置**: renderTeachersTable 函数内的 map 循环

**IMPLEMENT**: 在表格行中添加别名列

在 `<td>老师名字</td>` 后添加：
```html
<td style="padding: 10px; border-bottom: 1px solid #eee; color: #666; font-size: 12px;">
    ${teacher.aliases && teacher.aliases.length > 0 ? teacher.aliases.join(', ') : '-'}
</td>
```

**VALIDATE**: 刷新页面检查表格显示

---

### Task 8: UPDATE showTeacherModal 函数

**文件**: `dashboard.html`
**位置**: 行 5328-5400

**IMPLEMENT**: 在模态框中添加别名输入框

在"老师名字"输入框后添加：
```html
<div style="margin-bottom: 15px;">
    <label style="display: block; margin-bottom: 5px; font-weight: 500;">老师别名</label>
    <input type="text" id="modalTeacherAliases"
           value="${teacher?.aliases ? teacher.aliases.join(', ') : ''}"
           placeholder="多个别名用逗号分隔，如: 黄墨炎, Pearl"
           style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
    <small style="color: #999; font-size: 11px;">用于匹配 ClassIn 或约课宝中使用的其他名字</small>
</div>
```

**VALIDATE**: 点击编辑按钮检查模态框

---

### Task 9: UPDATE saveTeacher 函数

**文件**: `dashboard.html`
**位置**: 行 5408-5452

**IMPLEMENT**: 收集并发送别名数据

**查找**:
```javascript
const account = document.getElementById('modalTeacherAccount').value.trim();
```

**后面添加**:
```javascript
const aliasesInput = document.getElementById('modalTeacherAliases').value.trim();
const aliases = aliasesInput ? aliasesInput.split(',').map(a => a.trim()).filter(a => a) : [];
```

**查找**:
```javascript
body: JSON.stringify({
    teacher_name: name,
    type: type,
    salary_per_class_time: salary,
    salary_unit: unit,
    salary_account: account
})
```

**替换为**:
```javascript
body: JSON.stringify({
    teacher_name: name,
    type: type,
    salary_per_class_time: salary,
    salary_unit: unit,
    salary_account: account,
    aliases: aliases
})
```

**VALIDATE**: 测试添加/编辑老师时保存别名

---

### Task 10: UPDATE loadTeacherCalendarData 函数

**文件**: `dashboard.html`
**位置**: loadTeacherCalendarData 函数

**IMPLEMENT**: 将 aliasMap 传递给 renderTeacherCalendarView

**查找**:
```javascript
if (result.success) {
    renderTeacherCalendarView(result.data, dates);
}
```

**替换为**:
```javascript
if (result.success) {
    renderTeacherCalendarView(result.data, dates, result.data.aliasMap || {});
}
```

**VALIDATE**: 检查函数调用

---

### Task 11: UPDATE renderTeacherCalendarView 函数

**文件**: `dashboard.html`
**位置**: 行 5086-5232

**IMPLEMENT**: 使用别名映射统一老师名字

**查找**:
```javascript
function renderTeacherCalendarView(data, dates) {
```

**替换为**:
```javascript
function renderTeacherCalendarView(data, dates, aliasMap = {}) {
    // 辅助函数：获取标准化的老师名字
    const getNormalizedTeacher = (name) => aliasMap[name] || name;
```

**查找** (ClassIn 数据处理):
```javascript
const teacher = s.teacherName || '未知老师';
```

**替换为**:
```javascript
const teacher = getNormalizedTeacher(s.teacherName || '未知老师');
```

**查找** (约课宝数据处理):
```javascript
const teacher = s.teacher || '未知老师';
```

**替换为**:
```javascript
const teacher = getNormalizedTeacher(s.teacher || '未知老师');
```

**VALIDATE**: 刷新日历视图，检查别名老师的数据是否正确合并

---

## TESTING STRATEGY

### Manual Tests

1. **添加老师别名**: 在系统设置中编辑一个老师，添加别名，保存后刷新确认显示
2. **别名对比**: 在日历视图中选择有别名的老师，确认不同名字的数据被合并显示
3. **数据匹配**: 确认 ClassIn 中的名字通过别名映射后能与约课宝数据正确对比

### Edge Cases

- 空别名数组
- 别名包含特殊字符
- 别名与其他老师的主名字冲突
- 一个别名不应该映射到多个老师

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
# 测试获取老师列表（应包含 aliases 字段）
curl http://localhost:9000/api/teachers | jq '.teachers[0]'

# 测试课程对比 API（应包含 aliasMap）
curl "http://localhost:9000/api/teacher-schedule-compare?startTime=1738281600&endTime=1738886400" | jq '.data.aliasMap'
```

### Level 4: 手动验证

1. 打开 http://localhost:9000
2. 进入系统设置 → 老师配置管理
3. 编辑一个老师，添加别名
4. 切换到老师数据 tab
5. 验证别名老师的数据被正确合并

---

## ACCEPTANCE CRITERIA

- [ ] 数据库表包含 aliases 字段
- [ ] GET /api/teachers 返回解析后的 aliases 数组
- [ ] POST/PUT /api/teachers 支持保存 aliases
- [ ] 老师配置表格显示别名列
- [ ] 老师编辑模态框可以输入别名
- [ ] /api/teacher-schedule-compare 返回 aliasMap
- [ ] 日历视图使用别名映射统一老师名字
- [ ] 不同名字的同一老师数据被正确合并对比
- [ ] 无 JavaScript 错误

---

## COMPLETION CHECKLIST

- [ ] Task 1: 数据库添加 aliases 字段
- [ ] Task 2: 更新 GET /api/teachers
- [ ] Task 3: 更新 POST /api/teachers
- [ ] Task 4: 更新 PUT /api/teachers
- [ ] Task 5: 更新 /api/teacher-schedule-compare 返回 aliasMap
- [ ] Task 6: 更新表格表头
- [ ] Task 7: 更新 renderTeachersTable
- [ ] Task 8: 更新 showTeacherModal
- [ ] Task 9: 更新 saveTeacher
- [ ] Task 10: 更新 loadTeacherCalendarData
- [ ] Task 11: 更新 renderTeacherCalendarView
- [ ] 所有验证命令执行成功
- [ ] 手动测试确认功能正常

---

## NOTES

### 设计决策

1. **别名存储格式**: 使用 JSON 数组存储在 TEXT 字段，灵活且易于扩展
2. **映射方向**: alias → mainName（别名映射到主名字），而非反向
3. **前端处理**: 在前端渲染时统一名字，而非后端返回时修改数据，保持原始数据完整性
4. **输入方式**: 使用逗号分隔的文本输入，简单直观

### 数据流

```
数据库 (aliases JSON)
    ↓
API 解析 JSON → 返回 aliasMap
    ↓
前端 getNormalizedTeacher() 统一名字
    ↓
日历视图正确合并显示
```

### 示例

假设配置了 Pearly 的别名为 ["黄墨炎", "Pearl"]：

- ClassIn 数据: teacherName = "Pearly"
- 约课宝数据: teacher = "黄墨炎"
- aliasMap = { "黄墨炎": "Pearly", "Pearl": "Pearly" }
- 渲染时两者都被映射为 "Pearly"，可以正确对比

<!-- EOF -->
