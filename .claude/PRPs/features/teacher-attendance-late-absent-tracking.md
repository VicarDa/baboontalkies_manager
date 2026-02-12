# Feature: 老师迟到/旷课状态追踪

## Feature Description

在工资计算和课节管理两个模块中增加老师迟到、旷课状态的检测和展示。通过对比课节开始时间与老师实际进入教室的时间，自动判定老师是否迟到或旷课，并在相应页面展示具体信息。

## User Story

As a 管理员
I want to 在工资计算和课节管理中看到老师的迟到/旷课情况
So that 我可以及时了解老师的出勤表现，辅助管理决策

## Problem Statement

当前系统无法直观展示老师是否在指定时间准时进入课堂。管理员需要手动对比课节开始时间和老师进入时间来判断迟到/旷课，效率低下且容易遗漏。

## Solution Statement

1. **工资计算页面**：在每位老师的工资详情中增加"迟到"和"旷课"两行统计，展示具体迟到/旷课的时间和详情，同时纳入复制功能。
2. **课节管理页面**：在课节列表表格中增加"状态"列，实时展示每节课的老师出勤状态。
3. **后端**：新增辅助函数，通过对比 feifei 系统的 `teacherjongTime`（老师进入时间）和 `classBtime`（课节开始时间）来计算迟到/旷课状态。

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: baboontalkies_manager 前端 (salary.js, feifei-sessions.js, feifei-sessions.html) + 后端 (src/index.js)
**Dependencies**: 无新增外部依赖

---

## 业务规则定义

### 状态判定逻辑

**前提条件**：只有当学生进入了教室（`studentEnterTime` 不为 NULL）时，才判定老师的迟到/旷课状态。如果学生未进入教室，该课节不记为迟到或旷课。

**优先级**：如果满足旷课条件，只记为旷课，不同时记为迟到（互斥关系）。

| 状态 | 条件 | 示例（:30上课） | 示例（:00上课） |
|------|------|----------------|----------------|
| 正常 | 老师在上课前1分钟（含）之前进入 | ≤ :29:00 进入 | ≤ 上一小时:59:00 进入 |
| 迟到 | 老师在上课前1分钟之后进入，且在上课后5分钟（含）内进入 | :29:01 ~ :35:00 进入 | :59:01 ~ :05:00 进入 |
| 旷课 | 老师在上课后超过5分钟才进入，或老师未进入 | > :35:00 进入或未进入 | > :05:00 进入或未进入 |

**精确公式**（基于秒级比较）：
```
classStartTime = classBtime（Unix 时间戳，秒）
teacherEntryTime = teacherjongTime（DATETIME）

if (studentEnterTime == NULL):
    status = null  // 不判定

elif (teacherjongTime == NULL):
    status = '旷课'  // 老师未进入

elif (teacherEntryTime > classStartTime + 300秒):
    status = '旷课'  // 超过5分钟

elif (teacherEntryTime > classStartTime - 60秒):
    status = '迟到'  // 未提前1分钟进入，但在5分钟内进入

else:
    status = null  // 正常（提前1分钟及以上进入）
```

---

## CONTEXT REFERENCES

### Relevant Codebase Files

**后端核心**：
- `baboontalkies_manager/src/index.js`
  - 第 3418-3462 行：`/api/salary-calculate` 端点，核心工资计算SQL查询
  - 第 3354-3415 行：`determineTrialClassSuccess()` 函数（参考模式：如何用 feifei 连接做辅助查询）
  - 第 5113-5248 行：`/api/teacher-schedule-compare` 端点（参考模式：如何跨约课宝/feifei 匹配教师数据，含别名处理）
  - 第 4902-4932 行：`/api/feifei/class-session-list` 端点 SQL（参考：feifei 表 JOIN 模式）
  - 第 2688-2714 行：`getDbConnection()` 和 `getFeifeiDbConnection()` 数据库连接（**同一数据库实例 baboon**）

**前端 - 工资计算**：
- `baboontalkies_manager/public/js/salary.js`
  - 第 121-391 行：`displaySalaryResults()` — 渲染工资详情HTML（每位老师的卡片布局）
  - 第 214-293 行：每位老师的详情行（Total Salary、Per-session Salary、Regular Class 等）
  - 第 295-361 行：课程详情表格（按日期分组）
  - 第 709-787 行：`copyTeacherSalaryDetails()` — 复制单个老师工资详情
  - 第 790-870 行：`copySalarySummary()` — 复制工资汇总

**前端 - 课节管理**：
- `baboontalkies_manager/public/js/feifei-sessions.js`
  - 第 82-112 行：`renderClassSessionTable()` — 渲染课节表格行
  - 第 115-119 行：`formatSessionTime()` — 时间戳格式化
  - 第 122-140 行：`formatDateTimeStr()` — 日期时间字符串格式化
- `baboontalkies_manager/public/pages/feifei-sessions.html`
  - 第 130-139 行：表格表头 `<th>` 定义（当前10列）

### New Files to Create

无需创建新文件，所有改动在现有文件中完成。

### 数据库表结构

**核心表关系**（所有表在同一个 MySQL 数据库 `baboon` 中）：

```
yuekebao_classtime (约课宝课程表)          base_user_classsession (飞飞课节表)
├─ teacher (VARCHAR)                       ├─ teacherName (VARCHAR)
├─ student (VARCHAR)                       ├─ classBtime (INT, Unix时间戳秒)
├─ class_date (DATE)                       ├─ teacherjongTime (DATETIME, 老师进入时间)
├─ class_start_time (TIME)                 ├─ teacherLeaveTime (DATETIME)
├─ class_end_time (TIME)                   ├─ courseId
└─ course_type (VARCHAR)                   └─ id (课节ID)
                                                    ↕ JOIN
                                           base_user_studentclassrecord (学生课节记录表)
                                           ├─ classId → classsession.id
                                           ├─ courseId → classsession.courseId
                                           ├─ studentEnterTime (DATETIME)
                                           ├─ studId → student.studentUid
                                           └─ studentLeaveTime (DATETIME)
                                                    ↕ JOIN
                                           base_user_student (学生表)
                                           ├─ studentUid
                                           └─ studentName

yuekebao_teacher_salary (老师薪资配置表)
├─ teacher_name (匹配 yuekebao_classtime.teacher)
├─ aliases (JSON/TEXT, 老师别名)
├─ salary_per_class_time
└─ salary_unit (rmb/pesos/dollars)

base_user_teacher (飞飞老师表)
├─ uid (老师UID)
├─ name (老师名)
└─ isdel (软删除标记)
```

### Patterns to Follow

**数据库连接模式**（参考 teacher-schedule-compare，第 5119-5120 行）：
```javascript
connection = await getDbConnection();           // 约课宝连接
feifeiConnection = await getFeifeiDbConnection(); // 飞飞连接（同一数据库实例）
```

**教师名匹配模式**（参考 teacher-schedule-compare，第 5156-5167 行）：
```javascript
// 通过教师名查 UID
const [teacherInfo] = await feifeiConnection.execute(
  `SELECT uid, name FROM base_user_teacher WHERE (isdel IS NULL OR isdel = 0) AND name IN (...)`,
  teacherParams
);
```

**前端行渲染模式**（参考 salary.js 第 221 行）：
```javascript
<div style="min-height: 50px; display: flex; align-items: center;">
    <strong>Label:</strong>
    <span style="margin-left: 10px;">Value</span>
</div>
```

**复制内容格式**（参考 salary.js 第 747-764 行）：
```javascript
content += `Label: value\n`;
```

**课节表格列模式**（参考 feifei-sessions.js 第 92-109 行）：
```javascript
<td style="padding: 12px;">content</td>
```

---

## IMPLEMENTATION PLAN

### Phase 1: 后端 - 新增老师出勤状态查询函数

在 `src/index.js` 中新增辅助函数 `getTeacherAttendanceInfo()`，用于查询指定教师在日期范围内的迟到/旷课记录。此函数从 feifei 系统获取数据并计算状态。

### Phase 2: 后端 - 工资计算 API 集成出勤数据

在 `/api/salary-calculate` 端点中调用新函数，将出勤数据附加到每位老师的响应数据中。

### Phase 3: 前端 - 工资页面展示迟到/旷课

在 `salary.js` 中修改 `displaySalaryResults()` 和 `copyTeacherSalaryDetails()` 函数，增加迟到/旷课行的展示和复制。

### Phase 4: 前端 - 课节管理页面增加状态列

在 `feifei-sessions.html` 和 `feifei-sessions.js` 中增加"状态"列，基于已有数据在前端计算并展示。

---

## STEP-BY-STEP TASKS

### Task 1: CREATE 后端辅助函数 `getTeacherAttendanceInfo()`

**文件**: `baboontalkies_manager/src/index.js`
**位置**: 在 `determineTrialClassSuccess()` 函数（第 3354 行）之前插入

**IMPLEMENT**: 新增异步函数，接收 feifei 数据库连接、教师名列表、起止日期，返回每位教师的迟到/旷课详情。

```javascript
async function getTeacherAttendanceInfo(feifeiConnection, teacherNames, startDate, endDate) {
  // 将参数中的日期范围转换为Unix时间戳（秒）
  const startTimestamp = Math.floor(new Date(`${startDate}T00:00:00`).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000);

  // 1. 通过教师名查找UID（支持别名匹配后续补充）
  if (!teacherNames || teacherNames.length === 0) return {};

  const [teacherInfo] = await feifeiConnection.execute(
    `SELECT uid, name FROM base_user_teacher
     WHERE (isdel IS NULL OR isdel = 0) AND name IN (${teacherNames.map(() => '?').join(',')})`,
    teacherNames
  );

  if (teacherInfo.length === 0) return {};

  const teacherUids = teacherInfo.map(t => t.uid);
  const uidToName = {};
  teacherInfo.forEach(t => { uidToName[t.uid] = t.name; });

  // 2. 查询feifei课节数据（包含老师进入时间、学生进入时间）
  const [sessions] = await feifeiConnection.execute(`
    SELECT
      cs.teacherName,
      cs.teacherUid,
      cs.classBtime,
      cs.teacherjongTime,
      scr.studentEnterTime,
      s.studentName,
      cs.className
    FROM base_user_classsession cs
    LEFT JOIN base_user_studentclassrecord scr ON cs.id = scr.classId AND cs.courseId = scr.courseId
    LEFT JOIN base_user_student s ON scr.studId = s.studentUid
    WHERE cs.teacherUid IN (${teacherUids.map(() => '?').join(',')})
      AND cs.classBtime >= ? AND cs.classBtime <= ?
    ORDER BY cs.teacherName, cs.classBtime
  `, [...teacherUids, startTimestamp, endTimestamp]);

  // 3. 按教师分组计算迟到/旷课
  const attendanceByTeacher = {};

  for (const session of sessions) {
    const teacherName = session.teacherName;
    if (!attendanceByTeacher[teacherName]) {
      attendanceByTeacher[teacherName] = { lateRecords: [], absentRecords: [] };
    }

    // 规则：学生未进入教室则不判定
    if (!session.studentEnterTime) continue;

    const classStartMs = session.classBtime * 1000;
    const classStartDate = new Date(classStartMs);
    // 格式化课节开始时间用于展示
    const classTimeStr = `${(classStartDate.getMonth() + 1).toString().padStart(2, '0')}-${classStartDate.getDate().toString().padStart(2, '0')} ${classStartDate.getHours().toString().padStart(2, '0')}:${classStartDate.getMinutes().toString().padStart(2, '0')}`;
    const studentName = session.studentName || '未知学生';

    if (!session.teacherjongTime) {
      // 老师未进入 → 旷课
      attendanceByTeacher[teacherName].absentRecords.push({
        classTime: classTimeStr,
        studentName: studentName,
        reason: '老师未进入教室'
      });
      continue;
    }

    const teacherEntryMs = new Date(session.teacherjongTime).getTime();
    const oneMinBefore = classStartMs - 60 * 1000;
    const fiveMinAfter = classStartMs + 5 * 60 * 1000;

    if (teacherEntryMs > fiveMinAfter) {
      // 超过5分钟 → 旷课
      const lateMinutes = Math.round((teacherEntryMs - classStartMs) / 60000);
      const entryDate = new Date(teacherEntryMs);
      const entryTimeStr = `${entryDate.getHours().toString().padStart(2, '0')}:${entryDate.getMinutes().toString().padStart(2, '0')}`;
      attendanceByTeacher[teacherName].absentRecords.push({
        classTime: classTimeStr,
        studentName: studentName,
        reason: `老师${entryTimeStr}进入（迟到${lateMinutes}分钟）`
      });
    } else if (teacherEntryMs > oneMinBefore) {
      // 未提前1分钟 → 迟到
      const lateSeconds = Math.round((teacherEntryMs - classStartMs) / 1000);
      const entryDate = new Date(teacherEntryMs);
      const entryTimeStr = `${entryDate.getHours().toString().padStart(2, '0')}:${entryDate.getMinutes().toString().padStart(2, '0')}`;
      let reasonDetail;
      if (lateSeconds > 0) {
        reasonDetail = `老师${entryTimeStr}进入（迟到${Math.ceil(lateSeconds / 60)}分钟）`;
      } else {
        reasonDetail = `老师${entryTimeStr}进入（未提前1分钟）`;
      }
      attendanceByTeacher[teacherName].lateRecords.push({
        classTime: classTimeStr,
        studentName: studentName,
        reason: reasonDetail
      });
    }
    // else: 正常，不记录
  }

  return attendanceByTeacher;
}
```

**PATTERN**: 参考 `determineTrialClassSuccess()` 函数（第 3354-3415 行）的模式
**GOTCHA**:
- `classBtime` 是 Unix 时间戳（秒），需乘以 1000 转换为毫秒
- `teacherjongTime` 是 MySQL DATETIME，mysql2 驱动返回 JavaScript Date 对象
- 一个课节可能有多个学生记录，每个学生单独判定
- 注意时区：`new Date(teacherjongTime)` 会按本地时区解析 DATETIME
**VALIDATE**: 在 salary-calculate 集成后通过 API 调用验证

---

### Task 2: UPDATE `/api/salary-calculate` 集成出勤数据

**文件**: `baboontalkies_manager/src/index.js`
**位置**: `/api/salary-calculate` 端点内部（第 3418-3644 行）

**IMPLEMENT**: 在获取工资数据后，查询 feifei 出勤数据，并将结果附加到每位老师的响应中。

**修改点 1**: 在 `connection = await getDbConnection();`（第 3431 行）之后添加 feifei 连接：
```javascript
const feifeiConnection = await getFeifeiDbConnection();
```

**修改点 2**: 在所有老师数据处理完成后（约第 3610 行后、构建 response 之前），添加出勤查询：
```javascript
// 获取所有老师的出勤状态（迟到/旷课）
const teacherNameList = Object.keys(teacherSummary);
let attendanceData = {};
try {
  attendanceData = await getTeacherAttendanceInfo(feifeiConnection, teacherNameList, startDate, endDate);
} catch (err) {
  console.error('获取出勤数据失败:', err);
  // 出勤数据获取失败不影响工资计算
}
```

**修改点 3**: 在构建每位老师的响应对象时（在 `teachers.push(...)` 的对象中），添加出勤字段：
```javascript
// 在 teachers.push({...}) 中增加：
attendanceInfo: attendanceData[data.teacher] || { lateRecords: [], absentRecords: [] }
```

**修改点 4**: 确保 feifei 连接在 finally 块中释放：
```javascript
// 在 finally 块中添加 feifei 连接释放
if (feifeiConnection) feifeiConnection.release();
```

**PATTERN**: 参考 teacher-schedule-compare 端点（第 5113-5120 行）的双连接模式
**GOTCHA**:
- 出勤数据获取失败时应该优雅降级，不影响工资计算主流程（用 try-catch 包裹）
- feifei 连接需要在 finally 块中释放
- 教师名在约课宝和 feifei 中可能不完全一致，但目前先用精确匹配
**VALIDATE**: 启动服务后调用 `/api/salary-calculate` API，检查返回数据中是否包含 `attendanceInfo` 字段

---

### Task 3: UPDATE `displaySalaryResults()` 增加迟到/旷课展示

**文件**: `baboontalkies_manager/public/js/salary.js`
**位置**: `displaySalaryResults()` 函数，第 248 行（"Rewards and Punishments" 区域之前）

**IMPLEMENT**: 在 "Number of Regular Class" 行之后、"手动调整试课数量" 区域之前，插入迟到和旷课的展示行。

在第 253 行 `</div>` 之后（"Number of Regular Class" div 结束后），插入以下代码：

```javascript
// 迟到/旷课统计展示
${(() => {
    const attendance = teacher.attendanceInfo || { lateRecords: [], absentRecords: [] };
    const hasLate = attendance.lateRecords && attendance.lateRecords.length > 0;
    const hasAbsent = attendance.absentRecords && attendance.absentRecords.length > 0;

    let attendanceHtml = '';

    // 迟到行
    attendanceHtml += `
        <div style="min-height: 50px; display: flex; align-items: flex-start; padding: 8px 0;">
            <strong style="white-space: nowrap;">Late (迟到):</strong>
            <span style="margin-left: 10px;">`;
    if (hasLate) {
        attendanceHtml += `<span style="color: #f59e0b; font-weight: 600;">${attendance.lateRecords.length}次</span>`;
        attendanceHtml += `<ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 13px; line-height: 1.8; list-style-type: none;">`;
        attendance.lateRecords.forEach(r => {
            attendanceHtml += `<li>⚠️ ${r.classTime} (${r.studentName}): ${r.reason}</li>`;
        });
        attendanceHtml += `</ul>`;
    } else {
        attendanceHtml += `<span style="color: #10b981;">0次</span>`;
    }
    attendanceHtml += `</span></div>`;

    // 旷课行
    attendanceHtml += `
        <div style="min-height: 50px; display: flex; align-items: flex-start; padding: 8px 0;">
            <strong style="white-space: nowrap;">Absent (旷课):</strong>
            <span style="margin-left: 10px;">`;
    if (hasAbsent) {
        attendanceHtml += `<span style="color: #ef4444; font-weight: 600;">${attendance.absentRecords.length}次</span>`;
        attendanceHtml += `<ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 13px; line-height: 1.8; list-style-type: none;">`;
        attendance.absentRecords.forEach(r => {
            attendanceHtml += `<li>🚫 ${r.classTime} (${r.studentName}): ${r.reason}</li>`;
        });
        attendanceHtml += `</ul>`;
    } else {
        attendanceHtml += `<span style="color: #10b981;">0次</span>`;
    }
    attendanceHtml += `</span></div>`;

    return attendanceHtml;
})()}
```

**PATTERN**: 参考 salary.js 第 221 行的行布局模式 `<div style="min-height: 50px; display: flex; align-items: center;">`
**GOTCHA**:
- 使用 IIFE `${(() => { ... })()}` 来嵌入复杂逻辑到模板字符串中
- 迟到/旷课行的对齐方式用 `align-items: flex-start`（因为有多行内容）
- 确保 `attendanceInfo` 不存在时有默认值
**VALIDATE**: 启动服务，计算工资，检查每位老师卡片中是否正确显示迟到/旷课行

---

### Task 4: UPDATE `copyTeacherSalaryDetails()` 增加迟到/旷课到复制内容

**文件**: `baboontalkies_manager/public/js/salary.js`
**位置**: `copyTeacherSalaryDetails()` 函数（第 709-787 行）

**IMPLEMENT**: 在 "Rewards and Punishments" 内容之后（第 765 行 `}` 之后），添加迟到/旷课的复制内容。

在第 765 行（rewards 循环结束的 `}` 之后）插入：

```javascript
// 迟到/旷课信息
const attendance = teacher.attendanceInfo || { lateRecords: [], absentRecords: [] };
content += `Late (迟到): ${attendance.lateRecords.length}次\n`;
if (attendance.lateRecords.length > 0) {
    attendance.lateRecords.forEach(r => {
        content += `  - ${r.classTime} (${r.studentName}): ${r.reason}\n`;
    });
}
content += `Absent (旷课): ${attendance.absentRecords.length}次\n`;
if (attendance.absentRecords.length > 0) {
    attendance.absentRecords.forEach(r => {
        content += `  - ${r.classTime} (${r.studentName}): ${r.reason}\n`;
    });
}
```

**PATTERN**: 参考第 755-764 行 rewards 的复制格式
**GOTCHA**: 确保空行和缩进与现有复制格式保持一致
**VALIDATE**: 计算工资后点击"复制"按钮，粘贴到文本编辑器中检查迟到/旷课信息是否正确包含

---

### Task 5: UPDATE `feifei-sessions.html` 增加"状态"表头

**文件**: `baboontalkies_manager/public/pages/feifei-sessions.html`
**位置**: 表格表头区域，第 134 行（`<th>课节开始时间</th>`）之后

**IMPLEMENT**: 在"课节开始时间"列之后插入新的"状态"表头列：

```html
<th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; white-space: nowrap;">状态</th>
```

**GOTCHA**: 表格总列数从 10 变为 11
**VALIDATE**: 刷新课节管理页面，检查表头是否正确显示11列

---

### Task 6: UPDATE `feifei-sessions.js` 增加状态计算和展示

**文件**: `baboontalkies_manager/public/js/feifei-sessions.js`
**位置**: 多处修改

**IMPLEMENT - 步骤 A**: 在文件顶部（第 11 行之后）添加状态计算函数：

```javascript
// 计算老师出勤状态（迟到/旷课）
function getAttendanceStatus(row) {
    // 学生未进入教室则不判定
    if (!row.studentEnterTime) return null;

    // 老师未进入教室 → 旷课
    if (!row.teacherjongTime) return 'absent';

    const classStartMs = row.startTimestamp * 1000;

    // 解析 teacherjongTime（数据库返回的格式化字符串 "YYYY-MM-DD HH:mm:ss"）
    const rawStr = String(row.teacherjongTime).trim();
    const match = rawStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    let teacherEntryMs;
    if (match) {
        const [, year, month, day, hour, minute, second] = match;
        teacherEntryMs = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
    } else {
        teacherEntryMs = new Date(row.teacherjongTime).getTime();
    }

    if (isNaN(teacherEntryMs)) return null;

    // classBtime 是 Unix 时间戳（秒），同样需要转换为本地时间进行比较
    // 由于 teacherjongTime 是数据库 DATETIME（已按服务器时区存储），
    // 而 classBtime 也是以同一时区为基准的 Unix 时间戳，直接比较毫秒即可
    const oneMinBefore = classStartMs - 60 * 1000;
    const fiveMinAfter = classStartMs + 5 * 60 * 1000;

    if (teacherEntryMs > fiveMinAfter) return 'absent';
    if (teacherEntryMs > oneMinBefore) return 'late';
    return null; // 正常
}

// 渲染出勤状态标签
function renderAttendanceStatus(row) {
    const status = getAttendanceStatus(row);
    if (status === 'late') {
        return '<span style="color: #f59e0b; font-weight: 600; font-size: 12px; background: #fef3c7; padding: 2px 8px; border-radius: 10px; border: 1px solid #f59e0b;">迟到</span>';
    } else if (status === 'absent') {
        return '<span style="color: #ef4444; font-weight: 600; font-size: 12px; background: #fef2f2; padding: 2px 8px; border-radius: 10px; border: 1px solid #ef4444;">旷课</span>';
    }
    return '';
}
```

**IMPLEMENT - 步骤 B**: 修改 `renderClassSessionTable()` 函数（第 82-112 行），在表格行中添加状态列。

在第 100 行（课节开始时间 `<td>`）之后插入新的状态列：
```javascript
<td style="padding: 12px; text-align: center;">${renderAttendanceStatus(row)}</td>
```

**IMPLEMENT - 步骤 C**: 更新 colspan 引用。搜索 `colspan="10"`（第 41 行和第 86 行），将所有 `colspan="10"` 改为 `colspan="11"`。

**PATTERN**: 参考第 95-98 行签到状态的渲染模式（使用 span + 内联样式 + 颜色编码）
**GOTCHA**:
- `startTimestamp` 是 Unix 时间戳（秒），需乘以 1000 转为毫秒
- `teacherjongTime` 在前端是格式化后的字符串（"YYYY-MM-DD HH:mm:ss"），不能直接用 `new Date()` 解析（避免时区问题），需手动解析
- 参考 `formatDateTimeStr()` 的时区处理方式：直接解析字符串避免二次时区转换
**VALIDATE**: 刷新课节管理页面，选择有课程数据的日期范围，检查状态列是否正确显示迟到/旷课标签

---

## TESTING STRATEGY

### 手动测试用例

**工资计算页面测试**：

| 测试场景 | 预期结果 |
|---------|---------|
| 老师在课前2分钟进入 | 正常，迟到/旷课行显示0次 |
| 老师在课后3分钟进入 | 迟到行显示1次，含具体时间和分钟数 |
| 老师在课后7分钟进入 | 旷课行显示1次，含具体时间和分钟数 |
| 老师未进入教室（学生进入了） | 旷课行显示1次，原因为"老师未进入教室" |
| 学生未进入教室 | 迟到/旷课行均显示0次 |
| 老师一周内有2次迟到、1次旷课 | 迟到行2次、旷课行1次，各自列出详情 |
| 复制工资详情 | 粘贴内容包含 Late 和 Absent 统计 |

**课节管理页面测试**：

| 测试场景 | 预期结果 |
|---------|---------|
| 老师准时进入 | 状态列为空 |
| 老师迟到 | 状态列显示橙色"迟到"标签 |
| 老师旷课 | 状态列显示红色"旷课"标签 |
| 学生未进入 | 状态列为空（不判定） |
| 老师未进入且学生也未进入 | 状态列为空 |

### Edge Cases

- **恰好在边界时间进入**：老师恰好在上课前60秒进入（应为正常），恰好在上课后300秒进入（应为迟到不是旷课）
- **teacherjongTime 为 NULL**：老师从未进入课堂
- **studentEnterTime 为 NULL**：学生从未进入课堂
- **同一课节多个学生**：只要有任一学生进入就应判定
- **约课宝有课但 feifei 无对应课节**：出勤数据为空，不影响工资计算
- **feifei 有课但约课宝无对应课程**：不影响工资（工资基于约课宝数据）

---

## VALIDATION COMMANDS

### Level 1: 语法检查

```bash
# 检查 JavaScript 语法
node -c baboontalkies_manager/src/index.js
node -c baboontalkies_manager/public/js/salary.js
node -c baboontalkies_manager/public/js/feifei-sessions.js
```

### Level 2: 服务启动

```bash
cd baboontalkies_manager
PORT=5001 npm run dashboard-http
# 验证服务正常启动无报错
```

### Level 3: API 测试

```bash
# 测试工资计算API返回attendanceInfo字段
curl -X POST http://localhost:5001/api/salary-calculate \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-02-01","endDate":"2025-02-08"}' | jq '.teachers[0].attendanceInfo'
```

### Level 4: 手动 UI 验证

1. 打开工资计算页面，选择日期范围，点击"计算工资"
2. 检查每位老师卡片中是否有"Late (迟到)"和"Absent (旷课)"两行
3. 点击"复制"按钮，粘贴检查是否包含迟到/旷课信息
4. 打开课节管理页面，检查表格是否有"状态"列
5. 选择有课程的日期范围，检查状态列是否正确显示迟到/旷课标签

---

## ACCEPTANCE CRITERIA

- [x] 工资计算页面每位老师卡片中展示"Late (迟到)"和"Absent (旷课)"两行
- [x] 迟到/旷课行显示具体次数、课节时间、学生名、原因说明
- [x] 复制单个老师工资详情时包含迟到/旷课统计
- [x] 课节管理页面表格增加"状态"列
- [x] 状态列正确展示迟到（橙色标签）和旷课（红色标签）
- [x] 学生未进入教室时不判定老师迟到/旷课
- [x] 旷课优先于迟到（互斥，不重复计算）
- [x] 迟到判定标准：老师未在课前1分钟进入，且在课后5分钟内进入
- [x] 旷课判定标准：老师在课后超过5分钟才进入或未进入
- [x] 出勤数据获取失败不影响工资计算主流程
- [x] 所有 JavaScript 文件语法正确
- [x] 服务可正常启动

---

## COMPLETION CHECKLIST

- [ ] Task 1: 后端 `getTeacherAttendanceInfo()` 函数创建完成
- [ ] Task 2: `/api/salary-calculate` 集成出勤数据
- [ ] Task 3: `displaySalaryResults()` 增加迟到/旷课展示行
- [ ] Task 4: `copyTeacherSalaryDetails()` 增加迟到/旷课到复制
- [ ] Task 5: `feifei-sessions.html` 增加"状态"表头
- [ ] Task 6: `feifei-sessions.js` 增加状态计算和列渲染
- [ ] 语法检查通过
- [ ] 服务启动正常
- [ ] UI 手动验证通过

---

## NOTES

### 设计决策

1. **出勤数据来源**：使用 feifei 系统（ClassIn）的 `teacherjongTime` 和 `classBtime`，而非约课宝数据，因为约课宝没有老师实际进入时间。

2. **工资计算中的出勤查询方式**：采用独立查询（不与约课宝课程匹配），直接按教师名和日期范围从 feifei 获取所有课节的出勤状态。这避免了复杂的跨系统数据匹配，且更可靠。

3. **课节管理的计算位置**：在前端计算，因为所有需要的数据（`startTimestamp`、`teacherjongTime`、`studentEnterTime`）已经由 API 返回，无需额外后端改动。

4. **时区处理**：前端解析 `teacherjongTime` 时直接拆解字符串而非使用 `new Date()` 构造，避免浏览器时区二次偏移（参考 `formatDateTimeStr()` 的做法）。后端通过 mysql2 驱动直接获取 Date 对象，在同一 Node.js 进程中比较。

5. **容错设计**：后端出勤数据获取失败时（如 feifei 连接异常），只打印错误日志，不影响工资计算主流程。前端在 `attendanceInfo` 不存在时使用空数组默认值。

### 潜在改进（不在本次范围内）

- 增加教师别名支持：当前用精确名称匹配，未来可加入 `yuekebao_teacher_salary.aliases` 的别名匹配
- 增加出勤筛选：在课节管理页面增加"状态"下拉筛选
- 增加出勤统计汇总：在工资汇总区域显示全员出勤概况

### Confidence Score: 8/10

主要风险：
- 时区处理可能需要根据实际部署环境微调
- 教师名在约课宝和 feifei 系统中可能存在不一致（当前用精确匹配）
- `classBtime` 的 Unix 时间戳精度（秒 vs 毫秒）需要在实际数据中验证

<!-- EOF -->
