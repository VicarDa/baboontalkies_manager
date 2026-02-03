# Feature: 老师课程安排弹窗与双数据源对比

## Feature Description

将现有课节管理的日历视图功能迁移到老师数据tab中，通过点击老师行触发弹窗展示该老师的课程安排。同时增加约课宝数据源，在日历视图中同时展示 ClassIn 和约课宝的课程数据，并高亮显示两者之间的差异。原课节管理页面清空，为后续功能预留。

## User Story

As a 管理员
I want to 在老师课时统计中点击老师后查看其详细课程安排，并对比 ClassIn 和约课宝的数据差异
So that 能快速发现两个系统间的数据不一致问题，确保课程数据准确

## Problem Statement

1. 当前课节管理功能与老师数据分离，查看老师课程需要切换 tab 并手动选择老师
2. 课程数据仅来自 ClassIn（feifei），无法验证与约课宝系统的数据一致性
3. 两个系统的课程数据可能存在差异，但目前没有可视化的对比方式

## Solution Statement

1. 在老师数据 tab 的表格中，为每行老师添加"查看课程"按钮
2. 点击按钮后弹出模态框，展示该老师的周日历视图
3. 日历视图同时显示 ClassIn 和约课宝两个数据源的课程
4. 使用不同颜色标识：仅 ClassIn 有、仅约课宝有、两者都有
5. 清空原课节管理页面内容

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: dashboard.html, src/index.js
**Dependencies**: 无新增依赖

---

## CONTEXT REFERENCES

### Relevant Codebase Files

- `dashboard.html` (行 1498-1542) - 老师数据 tab HTML 结构
- `dashboard.html` (行 1771-1813) - 课节管理 tab HTML 结构（需清空）
- `dashboard.html` (行 4879-4954) - loadTeacherData 函数
- `dashboard.html` (行 5631-5660) - loadFeifeiClassSessions 函数（参考）
- `dashboard.html` (行 5662-5725) - renderWeekView 函数（需改造）
- `src/index.js` (行 4535-4561) - /api/feifei/class-sessions API
- `src/index.js` (行 3709-3804) - /api/teacher-stats API
- `src/index.js` (行 2820-2836) - yuekebao_classtime 查询示例

### New Files to Create

无需创建新文件，所有修改在现有文件中进行

### Relevant Documentation

无需外部文档

### Patterns to Follow

**弹窗模式**（参考现有 feifeiTeacherEditModal）：
```html
<div id="modalId" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
    <div style="background: #fff; border-radius: 12px; width: 90%; max-width: 1200px; max-height: 90vh; overflow: auto;">
        <!-- 内容 -->
    </div>
</div>
```

**颜色编码**（项目已有风格）：
- 绿色系: #e8f5e9, #c8e6c9, #4caf50 - 约课宝数据
- 蓝色系: #e3f2fd, #bbdefb, #1976d2 - ClassIn 数据
- 橙色系: #fff3e0, #ffe0b2, #ff9800 - 差异/警告

**API 响应格式**：
```javascript
res.json({ success: true, data: [...] });
```

---

## IMPLEMENTATION PLAN

### Phase 1: 后端 API 开发

创建新的 API 端点，同时查询 ClassIn 和约课宝数据，并返回对比结果

### Phase 2: 前端弹窗组件

在 dashboard.html 中添加老师课程弹窗的 HTML 结构

### Phase 3: 前端交互逻辑

修改老师数据表格，添加点击按钮，实现弹窗展示和数据渲染

### Phase 4: 清理课节管理页面

清空 feifei-sessions-tab 内容，保留 tab 按钮

---

## STEP-BY-STEP TASKS

### Task 1: CREATE 新 API - /api/teacher-schedule-compare

**文件**: `src/index.js`
**位置**: 在 `/api/feifei/class-sessions` API 之后添加（约行 4562）

**IMPLEMENT**: 创建新 API 端点，同时查询两个数据源

```javascript
// API接口：获取老师课程安排对比数据（ClassIn vs 约课宝）
this.app.get('/api/teacher-schedule-compare', async (req, res) => {
  let connection;
  let feifeiConnection;
  try {
    const { teacherName, startTime, endTime } = req.query;

    if (!teacherName) {
      return res.status(400).json({ success: false, error: '请提供教师名称' });
    }

    connection = await getDbConnection();
    feifeiConnection = await getFeifeiDbConnection();

    // 1. 从约课宝获取课程数据
    const startDate = new Date(startTime * 1000).toISOString().split('T')[0];
    const endDate = new Date(endTime * 1000).toISOString().split('T')[0];

    const [yuekebaoData] = await connection.execute(`
      SELECT
        teacher,
        student,
        class_date,
        class_start_time,
        class_end_time,
        time_num,
        course_type
      FROM yuekebao_classtime
      WHERE teacher = ? AND class_date >= ? AND class_date <= ?
      ORDER BY class_date, class_start_time
    `, [teacherName, startDate, endDate]);

    // 2. 从 ClassIn (feifei) 获取课程数据
    // 先通过教师名获取 teacherUid
    const [teacherInfo] = await feifeiConnection.execute(
      `SELECT uid FROM base_user_teacher WHERE name = ? AND (isdel IS NULL OR isdel = 0)`,
      [teacherName]
    );

    let classinData = [];
    if (teacherInfo.length > 0) {
      const teacherUid = teacherInfo[0].uid;
      const [rows] = await feifeiConnection.execute(`
        SELECT
          cs.id, cs.className, cs.classBtime, cs.classEtime,
          cs.teacherUid, cs.teacherName,
          scr.studId, scr.stId, s.studentName
        FROM base_user_classsession cs
        LEFT JOIN base_user_studentclassrecord scr ON cs.id = scr.classId
        LEFT JOIN base_user_student s ON scr.studId = s.studentUid
        WHERE cs.teacherUid = ? AND cs.classBtime >= ? AND cs.classBtime <= ?
        ORDER BY cs.classBtime
      `, [teacherUid, startTime, endTime]);
      classinData = rows;
    }

    // 3. 返回两个数据源的数据
    res.json({
      success: true,
      data: {
        yuekebao: yuekebaoData,
        classin: classinData,
        teacherName: teacherName
      }
    });

  } catch (error) {
    console.error('获取老师课程对比数据失败:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (connection) await connection.end();
    if (feifeiConnection) await feifeiConnection.end();
  }
});
```

**VALIDATE**: 手动测试 API
```bash
curl "http://localhost:9000/api/teacher-schedule-compare?teacherName=TestTeacher&startTime=1704067200&endTime=1704672000"
```

---

### Task 2: UPDATE 老师数据表格 - 添加"查看课程"按钮

**文件**: `dashboard.html`
**位置**: loadTeacherData 函数中表格渲染部分（约行 4920-4940）

**IMPLEMENT**: 在表格每行添加查看课程按钮

**查找并替换** `groupBy === 'teacher'` 分支中的表格行模板：

原代码：
```javascript
tbody.innerHTML = data.map((item, index) => `
    <tr style="background: ${index % 2 === 0 ? '#fff' : '#f9fafb'};">
        <td style="padding: 12px 15px; border-bottom: 1px solid #e8eaed; font-weight: 500;">${item.teacher}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e8eaed; text-align: center; font-weight: 600; color: #10b981; font-size: 16px;">${item.totalClasses}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e8eaed;">
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${item.details.map(d => `<span style="background: #f0fdf4; color: #059669; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${d.date}: ${d.count}节</span>`).join('')}
            </div>
        </td>
    </tr>
`).join('');
```

替换为：
```javascript
tbody.innerHTML = data.map((item, index) => `
    <tr style="background: ${index % 2 === 0 ? '#fff' : '#f9fafb'};">
        <td style="padding: 12px 15px; border-bottom: 1px solid #e8eaed; font-weight: 500;">${item.teacher}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e8eaed; text-align: center; font-weight: 600; color: #10b981; font-size: 16px;">${item.totalClasses}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #e8eaed;">
            <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                ${item.details.map(d => `<span style="background: #f0fdf4; color: #059669; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${d.date}: ${d.count}节</span>`).join('')}
                <button onclick="openTeacherScheduleModal('${item.teacher}')"
                        style="margin-left: auto; padding: 4px 12px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    📅 查看课程
                </button>
            </div>
        </td>
    </tr>
`).join('');
```

**VALIDATE**: 查看老师数据表格，确认按钮出现

---

### Task 3: CREATE 弹窗 HTML 结构

**文件**: `dashboard.html`
**位置**: 在 `</body>` 标签之前添加（文件末尾附近）

**IMPLEMENT**: 添加老师课程弹窗的 HTML

```html
<!-- 老师课程安排弹窗 -->
<div id="teacherScheduleModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
    <div style="background: #fff; border-radius: 12px; width: 95%; max-width: 1400px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;">
        <!-- 弹窗头部 -->
        <div style="padding: 20px; border-bottom: 1px solid #e8eaed; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; color: #333;" id="scheduleModalTitle">📅 老师课程安排</h3>
            <div style="display: flex; gap: 10px; align-items: center;">
                <button onclick="changeScheduleWeek(-1)" style="padding: 6px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">◀ 上一周</button>
                <span id="scheduleWeekDisplay" style="font-weight: bold; min-width: 180px; text-align: center;">-</span>
                <button onclick="changeScheduleWeek(1)" style="padding: 6px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">下一周 ▶</button>
                <button onclick="goToScheduleCurrentWeek()" style="padding: 6px 12px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">本周</button>
                <button onclick="closeTeacherScheduleModal()" style="padding: 6px 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">✕ 关闭</button>
            </div>
        </div>

        <!-- 图例说明 -->
        <div style="padding: 10px 20px; background: #f8f9fa; border-bottom: 1px solid #e8eaed; display: flex; gap: 20px; font-size: 13px; flex-wrap: wrap;">
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #e3f2fd; border: 2px solid #1976d2; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 仅 ClassIn</span>
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #e8f5e9; border: 2px solid #4caf50; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 仅约课宝</span>
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #e0f7fa; border: 2px solid #00bcd4; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 两者一致</span>
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #fff3e0; border: 2px solid #ff9800; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 数据差异</span>
        </div>

        <!-- 日历内容 -->
        <div style="flex: 1; overflow: auto; padding: 20px;">
            <table style="width: 100%; border-collapse: collapse; min-width: 900px;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 10px; border: 1px solid #e0e0e0; width: 70px;">时间</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="scheduleDay0">周日</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="scheduleDay1">周一</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="scheduleDay2">周二</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="scheduleDay3">周三</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="scheduleDay4">周四</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="scheduleDay5">周五</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="scheduleDay6">周六</th>
                    </tr>
                </thead>
                <tbody id="scheduleWeekViewBody">
                    <tr><td colspan="8" style="text-align: center; padding: 60px; color: #999;">加载中...</td></tr>
                </tbody>
            </table>
        </div>

        <!-- 统计信息 -->
        <div style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #e8eaed; display: flex; gap: 30px; font-size: 14px;">
            <span>ClassIn 课时: <strong id="scheduleClassinCount">0</strong></span>
            <span>约课宝课时: <strong id="scheduleYuekebaoCount">0</strong></span>
            <span style="color: #ff9800;">差异数: <strong id="scheduleDiffCount">0</strong></span>
        </div>
    </div>
</div>
```

**VALIDATE**: 检查 HTML 语法正确性

---

### Task 4: CREATE JavaScript 函数 - 弹窗控制和数据加载

**文件**: `dashboard.html`
**位置**: 在 `<script>` 标签内，`loadFeifeiClassSessions` 函数之后添加

**IMPLEMENT**: 添加弹窗相关的 JavaScript 函数

```javascript
// ========== 老师课程安排弹窗 ==========
let scheduleWeekOffset = 0;
let currentScheduleTeacher = '';

function openTeacherScheduleModal(teacherName) {
    currentScheduleTeacher = teacherName;
    scheduleWeekOffset = 0;
    document.getElementById('scheduleModalTitle').textContent = `📅 ${teacherName} 的课程安排`;
    document.getElementById('teacherScheduleModal').style.display = 'flex';
    loadTeacherScheduleData();
}

function closeTeacherScheduleModal() {
    document.getElementById('teacherScheduleModal').style.display = 'none';
}

function changeScheduleWeek(offset) {
    scheduleWeekOffset += offset;
    loadTeacherScheduleData();
}

function goToScheduleCurrentWeek() {
    scheduleWeekOffset = 0;
    loadTeacherScheduleData();
}

function getScheduleWeekDates(weekOffset = 0) {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek + (weekOffset * 7));
    sunday.setHours(0, 0, 0, 0);

    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(sunday);
        date.setDate(sunday.getDate() + i);
        dates.push(date);
    }
    return dates;
}

async function loadTeacherScheduleData() {
    const tbody = document.getElementById('scheduleWeekViewBody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #999;">加载中...</td></tr>';

    const dates = getScheduleWeekDates(scheduleWeekOffset);
    const startTime = Math.floor(dates[0].getTime() / 1000);
    const endTime = Math.floor(dates[6].getTime() / 1000) + 24 * 60 * 60;

    // 更新周显示和表头日期
    const startStr = `${dates[0].getMonth() + 1}/${dates[0].getDate()}`;
    const endStr = `${dates[6].getMonth() + 1}/${dates[6].getDate()}`;
    document.getElementById('scheduleWeekDisplay').textContent = `${startStr} - ${endStr}`;

    for (let i = 0; i < 7; i++) {
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        document.getElementById(`scheduleDay${i}`).innerHTML =
            `${dayNames[i]}<br><span style="font-size: 12px; color: #666;">${dates[i].getMonth() + 1}/${dates[i].getDate()}</span>`;
    }

    try {
        const response = await fetch(`${BASE_PATH}/api/teacher-schedule-compare?teacherName=${encodeURIComponent(currentScheduleTeacher)}&startTime=${startTime}&endTime=${endTime}`);
        const result = await response.json();

        if (result.success) {
            renderScheduleCompareView(result.data, dates);
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 60px; color: #d32f2f;">${result.error || '加载失败'}</td></tr>`;
        }
    } catch (error) {
        console.error('加载课程数据失败:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #d32f2f;">加载失败</td></tr>';
    }
}

function renderScheduleCompareView(data, dates) {
    const tbody = document.getElementById('scheduleWeekViewBody');
    const { yuekebao, classin } = data;

    // 处理 ClassIn 数据 - 按课节ID分组
    const classinMap = {};
    classin.forEach(s => {
        const dateKey = new Date(s.classBtime * 1000).toDateString();
        const timeKey = new Date(s.classBtime * 1000).toTimeString().slice(0, 5);
        const key = `${dateKey}_${timeKey}`;
        if (!classinMap[key]) {
            classinMap[key] = {
                ...s,
                students: [],
                source: 'classin'
            };
        }
        if (s.studentName) {
            classinMap[key].students.push(s.studentName);
        }
    });

    // 处理约课宝数据
    const yuekebaoMap = {};
    yuekebao.forEach(s => {
        const dateKey = new Date(s.class_date).toDateString();
        const timeKey = s.class_start_time.slice(0, 5);
        const key = `${dateKey}_${timeKey}`;
        if (!yuekebaoMap[key]) {
            yuekebaoMap[key] = {
                ...s,
                students: [],
                source: 'yuekebao'
            };
        }
        if (s.student) {
            yuekebaoMap[key].students.push(s.student);
        }
    });

    // 统计
    let classinCount = Object.keys(classinMap).length;
    let yuekebaoCount = Object.keys(yuekebaoMap).length;
    let diffCount = 0;

    // 生成时间槽 (06:00 - 23:30)
    const timeSlots = [];
    for (let hour = 6; hour < 24; hour++) {
        timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
        timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }

    let html = '';
    timeSlots.forEach(time => {
        html += `<tr>
            <td style="padding: 6px; border: 1px solid #e0e0e0; background: #fafafa; font-size: 12px; text-align: center;">${time}</td>`;

        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const date = dates[dayIndex];
            const dateKey = date.toDateString();
            const key = `${dateKey}_${time}`;

            const hasClassin = classinMap[key];
            const hasYuekebao = yuekebaoMap[key];

            let cellContent = '';
            let bgColor = '';
            let borderColor = '#e0e0e0';

            if (hasClassin && hasYuekebao) {
                // 两者都有 - 检查是否一致
                const classinStudents = hasClassin.students.sort().join(',');
                const yuekebaoStudents = hasYuekebao.students.sort().join(',');

                if (classinStudents === yuekebaoStudents) {
                    // 完全一致
                    bgColor = '#e0f7fa';
                    borderColor = '#00bcd4';
                    cellContent = `<div style="font-size: 11px;"><strong>✓ 一致</strong></div>
                        <div style="color: #666; font-size: 10px;">${hasClassin.students.join(', ') || '无学生'}</div>`;
                } else {
                    // 有差异
                    bgColor = '#fff3e0';
                    borderColor = '#ff9800';
                    diffCount++;
                    cellContent = `<div style="font-size: 11px;"><strong>⚠ 差异</strong></div>
                        <div style="color: #1976d2; font-size: 10px;">ClassIn: ${hasClassin.students.join(', ') || '无'}</div>
                        <div style="color: #4caf50; font-size: 10px;">约课宝: ${hasYuekebao.students.join(', ') || '无'}</div>`;
                }
            } else if (hasClassin) {
                // 仅 ClassIn
                bgColor = '#e3f2fd';
                borderColor = '#1976d2';
                cellContent = `<div style="font-size: 11px; color: #1976d2;"><strong>ClassIn</strong></div>
                    <div style="color: #666; font-size: 10px;">${hasClassin.students.join(', ') || '空闲'}</div>`;
            } else if (hasYuekebao) {
                // 仅约课宝
                bgColor = '#e8f5e9';
                borderColor = '#4caf50';
                cellContent = `<div style="font-size: 11px; color: #4caf50;"><strong>约课宝</strong></div>
                    <div style="color: #666; font-size: 10px;">${hasYuekebao.students.join(', ') || '空闲'}</div>`;
            }

            if (cellContent) {
                html += `<td style="padding: 4px; border: 1px solid ${borderColor}; background: ${bgColor}; vertical-align: top;">${cellContent}</td>`;
            } else {
                html += `<td style="padding: 4px; border: 1px solid #e0e0e0;"></td>`;
            }
        }

        html += '</tr>';
    });

    tbody.innerHTML = html || '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #999;">本周无课程</td></tr>';

    // 更新统计
    document.getElementById('scheduleClassinCount').textContent = classinCount;
    document.getElementById('scheduleYuekebaoCount').textContent = yuekebaoCount;
    document.getElementById('scheduleDiffCount').textContent = diffCount;
}

// 点击弹窗背景关闭
document.getElementById('teacherScheduleModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeTeacherScheduleModal();
    }
});
```

**VALIDATE**: 打开浏览器控制台，确认无 JavaScript 语法错误

---

### Task 5: UPDATE 课节管理页面 - 清空内容

**文件**: `dashboard.html`
**位置**: feifei-sessions-tab 内容区域（行 1771-1813）

**IMPLEMENT**: 将课节管理 tab 内容替换为占位提示

**查找**:
```html
<div class="tab-content" id="feifei-sessions-tab">
```

**替换整个 div 内容为**:
```html
<div class="tab-content" id="feifei-sessions-tab">
    <div style="padding: 40px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 20px;">🚧</div>
        <h3 style="color: #666; margin-bottom: 10px;">功能开发中</h3>
        <p style="color: #999;">此页面正在重构，敬请期待...</p>
    </div>
</div>
```

**VALIDATE**: 切换到课节管理 tab，确认显示占位内容

---

### Task 6: REMOVE 不再需要的 JavaScript 函数

**文件**: `dashboard.html`

**IMPLEMENT**: 注释或删除以下不再需要的函数（可选，保留也不影响功能）：
- `loadFeifeiClassSessions` - 已被新功能替代
- `renderWeekView` - 已被新功能替代
- `loadSessionTeachers` - 已被新功能替代
- `initWeekView` - 已被新功能替代
- `changeWeek` - 已被新功能替代
- `goToCurrentWeek` - 已被新功能替代
- `getWeekDates` - 已被新功能替代
- `currentWeekOffset` 变量 - 已被新功能替代

**注意**: 可以先保留这些代码，后续清理时再删除

**VALIDATE**: 页面正常加载，无 JavaScript 错误

---

## TESTING STRATEGY

### Unit Tests

本项目无自动化测试框架，跳过

### Integration Tests

本项目无自动化测试框架，跳过

### Edge Cases

1. **老师名称包含特殊字符**: 确保 URL 编码正确
2. **无课程数据**: 显示"本周无课程"提示
3. **只有一个数据源有数据**: 正确显示单一来源标识
4. **跨周切换**: 周导航正常工作
5. **大量课程数据**: 表格滚动正常

---

## VALIDATION COMMANDS

### Level 1: 语法检查

```bash
# 检查 JavaScript 语法
node --check /Users/panda/Documents/Apps/BaboonTalkies/baboontalkies_manager/src/index.js
```

### Level 2: 服务启动

```bash
# 启动服务
cd /Users/panda/Documents/Apps/BaboonTalkies/baboontalkies_manager
PORT=9000 npm run dashboard-http
```

### Level 3: API 测试

```bash
# 测试新 API
curl "http://localhost:9000/api/teacher-schedule-compare?teacherName=Shira&startTime=1706659200&endTime=1707264000"
```

### Level 4: 手动验证

1. 打开 http://localhost:9000
2. 切换到"老师数据"tab
3. 选择日期范围，点击查询
4. 在任意老师行点击"查看课程"按钮
5. 验证弹窗正常显示，周导航正常
6. 验证数据对比颜色标识正确
7. 切换到"课节管理"tab，确认显示占位内容

---

## ACCEPTANCE CRITERIA

- [x] 老师数据表格每行显示"查看课程"按钮
- [x] 点击按钮弹出课程安排弹窗
- [x] 弹窗显示周日历视图
- [x] 日历同时显示 ClassIn 和约课宝数据
- [x] 不同数据来源使用不同颜色标识
- [x] 数据差异高亮显示
- [x] 周导航功能正常
- [x] 统计信息正确显示
- [x] 课节管理页面显示占位内容
- [x] 无 JavaScript 错误
- [x] API 返回正确数据格式

---

## COMPLETION CHECKLIST

- [ ] Task 1: 创建 /api/teacher-schedule-compare API
- [ ] Task 2: 老师数据表格添加按钮
- [ ] Task 3: 创建弹窗 HTML 结构
- [ ] Task 4: 创建 JavaScript 函数
- [ ] Task 5: 清空课节管理页面
- [ ] Task 6: 清理旧代码（可选）
- [ ] 所有验证命令执行成功
- [ ] 手动测试确认功能正常

---

## NOTES

### 设计决策

1. **使用时间槽匹配而非精确时间戳**: 因为约课宝和 ClassIn 的时间格式不同，使用 `日期_HH:MM` 作为 key 进行匹配更可靠

2. **学生列表比较**: 使用排序后的学生名字符串比较，简单有效

3. **保留旧代码**: 为了安全起见，旧的课节管理代码暂时保留，后续可以清理

### 潜在改进

1. 添加按学生筛选功能
2. 添加导出差异报告功能
3. 添加自动同步修复功能

### 已知限制

1. 时间匹配精度为 30 分钟（时间槽）
2. 学生匹配依赖名字完全一致

<!-- EOF -->
