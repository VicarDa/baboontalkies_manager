# Feature: 学生编辑功能增强

## Feature Description

增强学生编辑功能：放大编辑按钮并使用主题色绿色，在编辑模态框中新增"课程要求"、"学生标签"和"备注"三个字段，并在学生列表中增加一列显示备注信息。

## User Story

As a 管理员
I want to 在学生编辑界面配置课程要求、学生标签和备注
So that 可以更好地管理学生信息，并在列表中快速查看备注

## Problem Statement

1. 当前编辑按钮太小（padding: 3px 8px, font-size: 11px），不易点击
2. 编辑按钮使用蓝色(#4285f4)与系统主题色绿色(#10b981)不一致
3. 缺少"课程要求"字段（用于展示在老师Clock-in界面）
4. 缺少"学生标签"字段（多选：数学班课学员、英语1v1学员、暂不续费等）
5. 缺少"备注"字段，且无法在列表中快速查看学生备注

## Solution Statement

1. 放大编辑按钮并改用主题色绿色
2. 扩展 `yuekebao_student_aliases` 表，新增 `course_requirements`、`tags`、`notes` 字段
3. 修改学生别名 API 支持新字段的读写
4. 扩展学生编辑模态框，添加三个新输入字段
5. 在学生列表表头和数据行中添加"备注"列

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: dashboard.html, src/index.js, MySQL数据库
**Dependencies**: 无新增依赖

---

## CONTEXT REFERENCES

### Relevant Codebase Files

- `dashboard.html` (行 3081-3086) - 当前编辑按钮样式（需要修改）
- `dashboard.html` (行 5533-5578) - `showStudentModal` 函数（需要扩展）
- `dashboard.html` (行 5585-5612) - `saveStudentAlias` 函数（需要扩展）
- `dashboard.html` (行 5509-5523) - `loadStudentAliases` 函数（需要扩展）
- `dashboard.html` (行 5525-5531) - `editStudent` 函数（需要扩展）
- `dashboard.html` (行 1448-1456) - 表头 HTML（需要添加备注列）
- `dashboard.html` (行 3062-3089) - `renderTable` 函数（需要添加备注列）
- `src/index.js` (行 4143-4167) - GET `/api/student-aliases` API（需要扩展）
- `src/index.js` (行 4169-4199) - POST `/api/student-aliases` API（需要扩展）

### New Files to Create

无需创建新文件

### Patterns to Follow

**主题色**: `#10b981`（绿色），渐变: `linear-gradient(135deg, #10b981 0%, #059669 100%)`

**按钮样式参考** (dashboard.html 行 5565-5567):
```html
<button style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">
    保存
</button>
```

**标签存储格式**: JSON 数组，如 `["英语1v1学员", "伴学服务"]`

**学生标签选项**:
- 数学班课学员
- 英语1v1学员
- 暂不续费
- 伴学服务
- 作业服务
- 已退费
- B2
- B1
- A1
- A2

---

## IMPLEMENTATION PLAN

### Phase 1: 数据库层

扩展 `yuekebao_student_aliases` 表，添加新字段

### Phase 2: API 层

修改学生别名 API 支持新字段的读写

### Phase 3: 前端界面

修改编辑按钮样式，扩展编辑模态框，添加备注列

---

## STEP-BY-STEP TASKS

### Task 1: ALTER 数据库表添加新字段

**IMPLEMENT**: 给 `yuekebao_student_aliases` 表添加三个新字段

**SQL**:
```sql
ALTER TABLE yuekebao_student_aliases
ADD COLUMN course_requirements TEXT DEFAULT NULL COMMENT '课程要求，展示在老师Clock-in界面' AFTER aliases,
ADD COLUMN tags TEXT DEFAULT NULL COMMENT '学生标签，JSON数组格式' AFTER course_requirements,
ADD COLUMN notes TEXT DEFAULT NULL COMMENT '备注' AFTER tags;
```

**VALIDATE**: 执行 SQL 后检查表结构

---

### Task 2: UPDATE GET /api/student-aliases API

**文件**: `src/index.js`
**位置**: 行 4148-4165

**IMPLEMENT**: 修改查询和返回，包含新字段

**查找**:
```javascript
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
```

**替换为**:
```javascript
const [rows] = await connection.execute(
  `SELECT student_name, aliases, course_requirements, tags, notes FROM yuekebao_student_aliases ORDER BY student_name`
);

// 解析 JSON 字段
rows.forEach(r => {
  try {
    r.aliases = r.aliases ? JSON.parse(r.aliases) : [];
  } catch (e) {
    r.aliases = [];
  }
  try {
    r.tags = r.tags ? JSON.parse(r.tags) : [];
  } catch (e) {
    r.tags = [];
  }
  r.course_requirements = r.course_requirements || '';
  r.notes = r.notes || '';
});
```

**VALIDATE**: `curl http://localhost:9000/api/student-aliases | jq '.data[0]'`

---

### Task 3: UPDATE POST /api/student-aliases API

**文件**: `src/index.js`
**位置**: 行 4169-4199

**IMPLEMENT**: 修改接收和保存新字段

**查找**:
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
```

**替换为**:
```javascript
// API接口：添加或更新学生别名
this.app.post('/api/student-aliases', async (req, res) => {
  let connection;
  try {
    const { student_name, aliases, course_requirements, tags, notes } = req.body;

    if (!student_name) {
      return res.status(400).json({ success: false, error: '学生名字不能为空' });
    }

    connection = await getDbConnection();
    const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;
    const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : null;

    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
    await connection.execute(
      `INSERT INTO yuekebao_student_aliases (student_name, aliases, course_requirements, tags, notes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         aliases = VALUES(aliases),
         course_requirements = VALUES(course_requirements),
         tags = VALUES(tags),
         notes = VALUES(notes),
         update_time = CURRENT_TIMESTAMP`,
      [student_name, aliasesJson, course_requirements || null, tagsJson, notes || null]
    );

    res.json({ success: true, message: '保存成功' });
```

**VALIDATE**: 测试保存新字段

---

### Task 4: UPDATE 编辑按钮样式

**文件**: `dashboard.html`
**位置**: 行 3081-3086 (renderTable 函数中)

**IMPLEMENT**: 放大按钮并改用主题色绿色

**查找**:
```html
<td style="text-align: center;">
    <button onclick="editStudent('${(student.name || '').replace(/'/g, "\\'")}')"
            style="padding: 3px 8px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">
        编辑
    </button>
</td>
```

**替换为**:
```html
<td style="text-align: center;">
    <button onclick="editStudent('${(student.name || '').replace(/'/g, "\\'")}')"
            style="padding: 6px 14px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
        编辑
    </button>
</td>
```

**VALIDATE**: 刷新页面检查按钮样式

---

### Task 5: UPDATE 表头添加备注列

**文件**: `dashboard.html`
**位置**: 行 1454-1455

**IMPLEMENT**: 在"之后课节"和"操作"之间添加"备注"列

**查找**:
```html
<th class="class-column" data-column="nextClass" data-type="text">之后课节</th>
<th style="width: 60px; text-align: center;">操作</th>
```

**替换为**:
```html
<th class="class-column" data-column="nextClass" data-type="text">之后课节</th>
<th style="min-width: 100px; max-width: 200px;">备注</th>
<th style="width: 60px; text-align: center;">操作</th>
```

**VALIDATE**: 刷新页面检查表头

---

### Task 6: UPDATE renderTable 添加备注列

**文件**: `dashboard.html`
**位置**: renderTable 函数，在"之后课节"列后面

**IMPLEMENT**: 在数据行中添加备注列

找到 renderTable 函数中的这段代码（约行 3075-3086）:
```html
<td class="next-class class-column">
    ${student.nextClass ? `
        <div class="teacher">${student.nextClass.teacher}</div>
        <div class="datetime">${student.nextClass.date} ${student.nextClass.time}</div>
    ` : '暂无安排'}
</td>
<td style="text-align: center;">
```

**替换为**:
```html
<td class="next-class class-column">
    ${student.nextClass ? `
        <div class="teacher">${student.nextClass.teacher}</div>
        <div class="datetime">${student.nextClass.date} ${student.nextClass.time}</div>
    ` : '暂无安排'}
</td>
<td style="font-size: 12px; color: #666; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${(studentAliasesCache[student.name]?.notes || '').replace(/"/g, '&quot;')}">
    ${studentAliasesCache[student.name]?.notes || ''}
</td>
<td style="text-align: center;">
```

**VALIDATE**: 刷新页面检查备注列

---

### Task 7: UPDATE loadStudentAliases 缓存新字段

**文件**: `dashboard.html`
**位置**: 行 5509-5523

**IMPLEMENT**: 修改缓存结构存储所有字段

**查找**:
```javascript
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
```

**替换为**:
```javascript
// 加载学生别名配置
async function loadStudentAliases() {
    try {
        const response = await fetch(`${BASE_PATH}/api/student-aliases`);
        const result = await response.json();
        if (result.success) {
            studentAliasesCache = {};
            result.data.forEach(item => {
                studentAliasesCache[item.student_name] = {
                    aliases: item.aliases || [],
                    course_requirements: item.course_requirements || '',
                    tags: item.tags || [],
                    notes: item.notes || ''
                };
            });
        }
    } catch (error) {
        console.error('加载学生别名失败:', error);
    }
}
```

**VALIDATE**: 检查浏览器控制台无错误

---

### Task 8: UPDATE editStudent 函数

**文件**: `dashboard.html`
**位置**: 行 5525-5531

**IMPLEMENT**: 传递完整的学生信息到模态框

**查找**:
```javascript
// 编辑学生
function editStudent(studentName) {
    const aliases = studentAliasesCache[studentName] || [];
    showStudentModal(studentName, aliases);
}
```

**替换为**:
```javascript
// 编辑学生
function editStudent(studentName) {
    const studentData = studentAliasesCache[studentName] || { aliases: [], course_requirements: '', tags: [], notes: '' };
    showStudentModal(studentName, studentData);
}
```

**VALIDATE**: 检查函数定义无语法错误

---

### Task 9: UPDATE showStudentModal 函数

**文件**: `dashboard.html`
**位置**: 行 5533-5578

**IMPLEMENT**: 重写模态框，添加新字段输入

**查找整个函数** `function showStudentModal(studentName, aliases) { ... }`

**替换为**:
```javascript
// 显示学生编辑模态框
function showStudentModal(studentName, studentData) {
    const { aliases = [], course_requirements = '', tags = [], notes = '' } = studentData;

    const tagOptions = [
        '数学班课学员', '英语1v1学员', '暂不续费', '伴学服务',
        '作业服务', '已退费', 'B2', 'B1', 'A1', 'A2'
    ];

    const modal = document.createElement('div');
    modal.id = 'studentModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); display: flex; align-items: center;
        justify-content: center; z-index: 10001;
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; width: 500px; max-width: 90%; max-height: 90vh; overflow-y: auto;">
            <h3 style="margin: 0 0 20px 0; color: #333;">✏️ 编辑学生</h3>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">学生名字</label>
                <input type="text" id="modalStudentName" value="${studentName}"
                       readonly style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; background: #f5f5f5;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">学生别名</label>
                <input type="text" id="modalStudentAliases" value="${aliases.join(', ')}"
                       placeholder="多个别名用逗号分隔"
                       style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
                <small style="color: #999; font-size: 11px; display: block; margin-top: 4px;">用于匹配 ClassIn 或约课宝中使用的其他名字</small>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">课程要求</label>
                <textarea id="modalCourseRequirements" rows="4"
                          placeholder="请输入课程要求，它将展示在老师Clock-in界面"
                          style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; resize: vertical;">${course_requirements}</textarea>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">学生标签</label>
                <div id="modalTagsContainer" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa;">
                    ${tagOptions.map(tag => `
                        <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 4px 8px; background: white; border-radius: 4px; border: 1px solid #e0e0e0; font-size: 13px;">
                            <input type="checkbox" value="${tag}" ${tags.includes(tag) ? 'checked' : ''} style="cursor: pointer;">
                            ${tag}
                        </label>
                    `).join('')}
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">备注</label>
                <textarea id="modalNotes" rows="3"
                          placeholder="请输入备注信息"
                          style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; resize: vertical;">${notes}</textarea>
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="closeStudentModal()"
                        style="padding: 10px 20px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">
                    取消
                </button>
                <button onclick="saveStudentAlias()"
                        style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
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
```

**VALIDATE**: 检查模态框显示正常

---

### Task 10: UPDATE saveStudentAlias 函数

**文件**: `dashboard.html`
**位置**: 行 5585-5612

**IMPLEMENT**: 修改保存函数，收集并提交所有新字段

**查找整个函数** `async function saveStudentAlias() { ... }`

**替换为**:
```javascript
// 保存学生信息
async function saveStudentAlias() {
    const studentName = document.getElementById('modalStudentName').value.trim();
    const aliasesInput = document.getElementById('modalStudentAliases').value.trim();
    const aliases = aliasesInput ? aliasesInput.split(',').map(a => a.trim()).filter(a => a) : [];
    const course_requirements = document.getElementById('modalCourseRequirements').value.trim();
    const notes = document.getElementById('modalNotes').value.trim();

    // 收集选中的标签
    const tagCheckboxes = document.querySelectorAll('#modalTagsContainer input[type="checkbox"]:checked');
    const tags = Array.from(tagCheckboxes).map(cb => cb.value);

    try {
        const response = await fetch(`${BASE_PATH}/api/student-aliases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                student_name: studentName,
                aliases,
                course_requirements,
                tags,
                notes
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('学生信息已保存', 'success');
            closeStudentModal();
            // 更新缓存
            studentAliasesCache[studentName] = { aliases, course_requirements, tags, notes };
            // 重新渲染表格以显示新备注
            filterData();
        } else {
            alert(result.error || '保存失败');
        }
    } catch (error) {
        console.error('保存学生信息失败:', error);
        alert('保存失败: ' + error.message);
    }
}
```

**VALIDATE**: 测试保存功能

---

### Task 11: UPDATE colspan 值

**文件**: `dashboard.html`
**位置**: 行 1460

**IMPLEMENT**: 更新空数据提示的 colspan 从 6 到 8（因为增加了备注列）

**查找**:
```html
<td colspan="6" class="loading">正在加载数据...</td>
```

**替换为**:
```html
<td colspan="8" class="loading">正在加载数据...</td>
```

**VALIDATE**: 检查 HTML

---

### Task 12: UPDATE renderTable 中的 colspan

**文件**: `dashboard.html`
**位置**: renderTable 函数中的空数据提示

**IMPLEMENT**: 找到 renderTable 函数中的 "没有找到数据" 或 "加载失败" 消息，更新 colspan

搜索并更新所有 `colspan="7"` 为 `colspan="8"`

**VALIDATE**: 检查代码

---

## TESTING STRATEGY

### Manual Tests

1. **编辑按钮样式**: 检查按钮是否变大且为绿色
2. **模态框字段**: 点击编辑，确认显示所有4个字段（别名、课程要求、标签、备注）
3. **标签多选**: 测试可以选择多个标签
4. **保存功能**: 填写所有字段并保存，确认保存成功
5. **数据回显**: 再次点击编辑，确认之前保存的数据正确显示
6. **备注列显示**: 确认列表中显示备注内容

### Edge Cases

- 空值处理：所有新字段都为空时保存
- 特殊字符：备注中包含引号、换行符
- 长文本：备注超长时的显示（应有省略号）

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
# 获取学生别名（应包含新字段）
curl http://localhost:9000/api/student-aliases | jq '.data[0]'

# 保存学生信息（含新字段）
curl -X POST http://localhost:9000/api/student-aliases \
  -H "Content-Type: application/json" \
  -d '{"student_name":"测试学生","aliases":["别名1"],"course_requirements":"每周练习口语","tags":["英语1v1学员","伴学服务"],"notes":"重点关注学生"}'
```

### Level 4: 手动验证

1. 打开 http://localhost:9000
2. 在学员数据 tab，检查编辑按钮样式（绿色、较大）
3. 点击任意学生的"编辑"按钮
4. 确认模态框显示：别名、课程要求、学生标签（多选）、备注
5. 填写信息并保存
6. 确认列表中"备注"列显示内容

---

## ACCEPTANCE CRITERIA

- [ ] 编辑按钮使用主题色绿色(#10b981)
- [ ] 编辑按钮更大更易点击（padding: 6px 14px, font-size: 13px）
- [ ] 数据库表 yuekebao_student_aliases 包含新字段
- [ ] GET /api/student-aliases 返回所有字段
- [ ] POST /api/student-aliases 可以保存所有字段
- [ ] 编辑模态框显示"课程要求"文本域
- [ ] 编辑模态框显示"学生标签"多选框（10个选项）
- [ ] 编辑模态框显示"备注"文本域
- [ ] 学生列表表头有"备注"列
- [ ] 学生列表数据行显示备注内容
- [ ] 长备注显示省略号，悬停显示完整内容
- [ ] 无 JavaScript 错误

---

## COMPLETION CHECKLIST

- [ ] Task 1: 数据库添加新字段 (需用户执行SQL)
- [x] Task 2: GET API 返回新字段
- [x] Task 3: POST API 保存新字段
- [x] Task 4: 编辑按钮样式修改
- [x] Task 5: 表头添加备注列
- [x] Task 6: renderTable 添加备注列
- [x] Task 7: loadStudentAliases 缓存新字段
- [x] Task 8: editStudent 传递完整数据
- [x] Task 9: showStudentModal 添加新字段
- [x] Task 10: saveStudentAlias 保存新字段
- [x] Task 11: 更新加载提示 colspan
- [x] Task 12: 更新其他 colspan
- [ ] 所有验证命令执行成功
- [ ] 手动测试确认功能正常

---

## NOTES

### 设计决策

1. **复用现有表**: 扩展 `yuekebao_student_aliases` 表而非创建新表，保持数据集中
2. **多选标签**: 使用 checkbox 实现多选，比 select multiple 更直观
3. **备注列位置**: 放在"之后课节"和"操作"之间，便于查看
4. **备注显示**: 使用 text-overflow: ellipsis 处理长文本，title 属性显示完整内容

### 数据流

```
数据库 (yuekebao_student_aliases)
    ↓
API 解析 JSON → 返回完整学生信息
    ↓
前端 studentAliasesCache 缓存
    ↓
renderTable 显示备注列
editStudent → showStudentModal 显示编辑表单
    ↓
saveStudentAlias 保存 → 更新缓存 → 刷新表格
```

### 标签选项说明

| 标签 | 说明 |
|------|------|
| 数学班课学员 | 参加数学班课的学生 |
| 英语1v1学员 | 一对一英语学生 |
| 暂不续费 | 暂时不续费的学生 |
| 伴学服务 | 购买了伴学服务 |
| 作业服务 | 购买了作业批改服务 |
| 已退费 | 已经退费的学生 |
| B2/B1/A1/A2 | 学生英语水平等级 |

<!-- EOF -->
