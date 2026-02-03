# Feature: 老师数据 Tab 改为日历视图

## Feature Description

将"老师数据"tab 从课时统计列表改为直接展示周日历视图。支持多选老师或选择"全部老师"，在日历中展示所选老师的课程安排，并保留约课宝与 ClassIn 数据对比功能。

## User Story

As a 管理员
I want to 在老师数据 tab 直接查看日历视图，并可选择多个老师
So that 能快速查看多位老师的课程安排和数据差异，无需逐个点击查看

## Problem Statement

1. 当前需要先查询列表，再点击单个老师查看弹窗，操作繁琐
2. 无法同时查看多位老师的课程安排进行对比
3. 弹窗形式遮挡了主界面，体验不佳

## Solution Statement

1. 将周日历视图直接嵌入老师数据 tab（不再使用弹窗）
2. 添加老师多选下拉框，支持选择多个老师或"全部老师"
3. 日历视图同时显示所选老师的课程，用不同颜色区分
4. 保留约课宝/ClassIn 数据对比和差异高亮
5. 移除原有的课时统计列表

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: dashboard.html, src/index.js
**Dependencies**: 无新增依赖

---

## CONTEXT REFERENCES

### Relevant Codebase Files

- `dashboard.html` (行 1499-1544) - 老师数据 tab HTML 结构
- `dashboard.html` (行 4847-4925) - loadTeacherData 函数
- `dashboard.html` (行 5875-5881) - openTeacherScheduleModal 函数
- `dashboard.html` (行 5913-5945) - loadTeacherScheduleData 函数
- `dashboard.html` (行 5947-6066) - renderScheduleCompareView 函数
- `dashboard.html` (行 6078-6129) - 弹窗 HTML 结构（可复用）
- `src/index.js` (行 4564-4636) - /api/teacher-schedule-compare API
- `src/index.js` (行 3709-3804) - /api/teacher-stats API

### New Files to Create

无需创建新文件，所有修改在现有文件中进行

### Patterns to Follow

**颜色编码**（已有风格）：
- 蓝色系: #e3f2fd, #1976d2 - 仅 ClassIn 数据
- 绿色系: #e8f5e9, #4caf50 - 仅约课宝数据
- 青色系: #e0f7fa, #00bcd4 - 两者一致
- 橙色系: #fff3e0, #ff9800 - 数据差异

**多选下拉框样式**（参考项目现有 select 样式）：
```html
<select multiple style="padding: 8px; border: 1px solid #ddd; border-radius: 6px;">
```

---

## IMPLEMENTATION PLAN

### Phase 1: 修改 API 支持多老师查询

修改 `/api/teacher-schedule-compare` API，支持传入多个老师名或空值（表示全部老师）

### Phase 2: 重构老师数据 Tab HTML

将日历视图从弹窗移动到 tab 内容区域，添加老师选择器

### Phase 3: 重构 JavaScript 函数

修改数据加载和渲染函数，支持多老师数据展示

### Phase 4: 清理旧代码

移除不再需要的弹窗相关代码

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE API 支持多老师查询

**文件**: `src/index.js`
**位置**: 行 4564-4636 的 `/api/teacher-schedule-compare` API

**IMPLEMENT**: 修改 API 支持 `teacherNames` 参数（逗号分隔的多个老师名，或空表示全部）

**查找并替换** API 实现：

```javascript
// API接口：获取老师课程安排对比数据（ClassIn vs 约课宝）
// 支持多老师查询
this.app.get('/api/teacher-schedule-compare', async (req, res) => {
  let connection;
  let feifeiConnection;
  try {
    const { teacherNames, startTime, endTime } = req.query;

    connection = await getDbConnection();
    feifeiConnection = await getFeifeiDbConnection();

    // 1. 从约课宝获取课程数据
    const startDate = new Date(startTime * 1000).toISOString().split('T')[0];
    const endDate = new Date(endTime * 1000).toISOString().split('T')[0];

    let yuekebaoQuery = `
      SELECT
        teacher,
        student,
        class_date,
        class_start_time,
        class_end_time,
        time_num,
        course_type
      FROM yuekebao_classtime
      WHERE class_date >= ? AND class_date <= ?
    `;
    let yuekebaoParams = [startDate, endDate];

    // 如果指定了老师，添加过滤条件
    if (teacherNames && teacherNames.trim()) {
      const teachers = teacherNames.split(',').map(t => t.trim()).filter(t => t);
      if (teachers.length > 0) {
        yuekebaoQuery += ` AND teacher IN (${teachers.map(() => '?').join(',')})`;
        yuekebaoParams.push(...teachers);
      }
    }
    yuekebaoQuery += ' ORDER BY teacher, class_date, class_start_time';

    const [yuekebaoData] = await connection.execute(yuekebaoQuery, yuekebaoParams);

    // 2. 从 ClassIn (feifei) 获取课程数据
    let classinData = [];

    // 获取相关老师的 UID
    let teacherQuery = `SELECT uid, name FROM base_user_teacher WHERE (isdel IS NULL OR isdel = 0)`;
    let teacherParams = [];

    if (teacherNames && teacherNames.trim()) {
      const teachers = teacherNames.split(',').map(t => t.trim()).filter(t => t);
      if (teachers.length > 0) {
        teacherQuery += ` AND name IN (${teachers.map(() => '?').join(',')})`;
        teacherParams.push(...teachers);
      }
    }

    const [teacherInfo] = await feifeiConnection.execute(teacherQuery, teacherParams);

    if (teacherInfo.length > 0) {
      const teacherUids = teacherInfo.map(t => t.uid);
      const [rows] = await feifeiConnection.execute(`
        SELECT
          cs.id, cs.className, cs.classBtime, cs.classEtime,
          cs.teacherUid, cs.teacherName,
          scr.studId, scr.stId, s.studentName
        FROM base_user_classsession cs
        LEFT JOIN base_user_studentclassrecord scr ON cs.id = scr.classId
        LEFT JOIN base_user_student s ON scr.studId = s.studentUid
        WHERE cs.teacherUid IN (${teacherUids.map(() => '?').join(',')})
          AND cs.classBtime >= ? AND cs.classBtime <= ?
        ORDER BY cs.teacherName, cs.classBtime
      `, [...teacherUids, startTime, endTime]);
      classinData = rows;
    }

    // 3. 获取所有老师列表（用于下拉框）
    const [allTeachers] = await connection.execute(`
      SELECT DISTINCT teacher FROM yuekebao_classtime
      WHERE class_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
      ORDER BY teacher
    `);

    // 4. 返回数据
    res.json({
      success: true,
      data: {
        yuekebao: yuekebaoData,
        classin: classinData,
        teachers: allTeachers.map(t => t.teacher)
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

**VALIDATE**: 测试 API
```bash
curl "http://localhost:9000/api/teacher-schedule-compare?startTime=1706659200&endTime=1707264000"
curl "http://localhost:9000/api/teacher-schedule-compare?teacherNames=May,Pearly&startTime=1706659200&endTime=1707264000"
```

---

### Task 2: UPDATE 老师数据 Tab HTML 结构

**文件**: `dashboard.html`
**位置**: 行 1499-1544 的 `teachers-tab` 内容

**IMPLEMENT**: 替换整个 tab 内容为日历视图

**查找** `<div class="tab-content" id="teachers-tab">` 开始到对应的结束 `</div>`

**替换为**:
```html
<div class="tab-content" id="teachers-tab">
    <div style="padding: 20px;">
        <!-- 工具栏 -->
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
            <h3 style="margin: 0; color: #333;">📅 老师课程安排</h3>

            <!-- 老师选择器 -->
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="color: #666;">老师:</label>
                <select id="teacherSelector" multiple style="padding: 8px; border: 1px solid #ddd; border-radius: 6px; min-width: 200px; max-width: 400px; height: 38px;">
                    <option value="">加载中...</option>
                </select>
                <button onclick="selectAllTeachers()" style="padding: 6px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 12px;">全选</button>
                <button onclick="clearTeacherSelection()" style="padding: 6px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 12px;">清除</button>
            </div>

            <!-- 周导航 -->
            <div style="display: flex; align-items: center; gap: 10px; margin-left: auto;">
                <button onclick="changeTeacherCalendarWeek(-1)" style="padding: 6px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">◀ 上一周</button>
                <span id="teacherCalendarWeekDisplay" style="font-weight: bold; min-width: 120px; text-align: center;">-</span>
                <button onclick="changeTeacherCalendarWeek(1)" style="padding: 6px 12px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">下一周 ▶</button>
                <button onclick="goToTeacherCalendarCurrentWeek()" style="padding: 6px 12px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">本周</button>
            </div>
        </div>

        <!-- 图例说明 -->
        <div style="padding: 10px 15px; background: #f8f9fa; border-radius: 8px; margin-bottom: 15px; display: flex; gap: 20px; font-size: 13px; flex-wrap: wrap;">
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #e3f2fd; border: 2px solid #1976d2; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 仅 ClassIn</span>
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #e8f5e9; border: 2px solid #4caf50; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 仅约课宝</span>
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #e0f7fa; border: 2px solid #00bcd4; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 两者一致</span>
            <span><span style="display: inline-block; width: 16px; height: 16px; background: #fff3e0; border: 2px solid #ff9800; vertical-align: middle; margin-right: 5px; border-radius: 3px;"></span> 数据差异</span>
        </div>

        <!-- 日历表格 -->
        <div style="background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 900px;">
                <thead>
                    <tr style="background: #f5f5f5;">
                        <th style="padding: 10px; border: 1px solid #e0e0e0; width: 70px;">时间</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="teacherCalendarDay0">周日</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="teacherCalendarDay1">周一</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="teacherCalendarDay2">周二</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="teacherCalendarDay3">周三</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="teacherCalendarDay4">周四</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="teacherCalendarDay5">周五</th>
                        <th style="padding: 10px; border: 1px solid #e0e0e0;" id="teacherCalendarDay6">周六</th>
                    </tr>
                </thead>
                <tbody id="teacherCalendarBody">
                    <tr><td colspan="8" style="text-align: center; padding: 60px; color: #999;">请选择老师查看课程安排</td></tr>
                </tbody>
            </table>
        </div>

        <!-- 统计信息 -->
        <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; display: flex; gap: 30px; font-size: 14px;">
            <span>ClassIn 课时: <strong id="teacherCalendarClassinCount">0</strong></span>
            <span>约课宝课时: <strong id="teacherCalendarYuekebaoCount">0</strong></span>
            <span style="color: #ff9800;">差异数: <strong id="teacherCalendarDiffCount">0</strong></span>
        </div>
    </div>
</div>
```

---

### Task 3: UPDATE JavaScript - 添加新的日历视图函数

**文件**: `dashboard.html`
**位置**: 在原有 `loadTeacherData` 函数之后添加新函数

**IMPLEMENT**: 添加日历视图相关的 JavaScript 函数

```javascript
// ========== 老师数据 - 日历视图 ==========
let teacherCalendarWeekOffset = 0;
let availableTeachers = [];

// 初始化老师数据 tab
async function initTeacherCalendar() {
    await loadTeacherList();
    loadTeacherCalendarData();
}

// 加载老师列表
async function loadTeacherList() {
    try {
        const dates = getTeacherCalendarWeekDates(0);
        const startTime = Math.floor(dates[0].getTime() / 1000);
        const endTime = Math.floor(dates[6].getTime() / 1000) + 24 * 60 * 60;

        const response = await fetch(`${BASE_PATH}/api/teacher-schedule-compare?startTime=${startTime}&endTime=${endTime}`);
        const result = await response.json();

        if (result.success && result.data.teachers) {
            availableTeachers = result.data.teachers;
            const selector = document.getElementById('teacherSelector');
            selector.innerHTML = availableTeachers.map(t =>
                `<option value="${t}">${t}</option>`
            ).join('');
        }
    } catch (error) {
        console.error('加载老师列表失败:', error);
    }
}

// 全选老师
function selectAllTeachers() {
    const selector = document.getElementById('teacherSelector');
    for (let option of selector.options) {
        option.selected = true;
    }
    loadTeacherCalendarData();
}

// 清除选择
function clearTeacherSelection() {
    const selector = document.getElementById('teacherSelector');
    for (let option of selector.options) {
        option.selected = false;
    }
    loadTeacherCalendarData();
}

// 获取选中的老师
function getSelectedTeachers() {
    const selector = document.getElementById('teacherSelector');
    const selected = [];
    for (let option of selector.options) {
        if (option.selected) {
            selected.push(option.value);
        }
    }
    return selected;
}

// 周导航
function changeTeacherCalendarWeek(offset) {
    teacherCalendarWeekOffset += offset;
    loadTeacherCalendarData();
}

function goToTeacherCalendarCurrentWeek() {
    teacherCalendarWeekOffset = 0;
    loadTeacherCalendarData();
}

// 获取周日期
function getTeacherCalendarWeekDates(weekOffset = 0) {
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

// 加载日历数据
async function loadTeacherCalendarData() {
    const tbody = document.getElementById('teacherCalendarBody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #999;">加载中...</td></tr>';

    const dates = getTeacherCalendarWeekDates(teacherCalendarWeekOffset);
    const startTime = Math.floor(dates[0].getTime() / 1000);
    const endTime = Math.floor(dates[6].getTime() / 1000) + 24 * 60 * 60;

    // 更新周显示
    const startStr = `${dates[0].getMonth() + 1}/${dates[0].getDate()}`;
    const endStr = `${dates[6].getMonth() + 1}/${dates[6].getDate()}`;
    document.getElementById('teacherCalendarWeekDisplay').textContent = `${startStr} - ${endStr}`;

    // 更新表头日期
    for (let i = 0; i < 7; i++) {
        const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        document.getElementById(`teacherCalendarDay${i}`).innerHTML =
            `${dayNames[i]}<br><span style="font-size: 12px; color: #666;">${dates[i].getMonth() + 1}/${dates[i].getDate()}</span>`;
    }

    const selectedTeachers = getSelectedTeachers();
    if (selectedTeachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #999;">请选择老师查看课程安排</td></tr>';
        document.getElementById('teacherCalendarClassinCount').textContent = '0';
        document.getElementById('teacherCalendarYuekebaoCount').textContent = '0';
        document.getElementById('teacherCalendarDiffCount').textContent = '0';
        return;
    }

    try {
        const teacherNames = selectedTeachers.join(',');
        const response = await fetch(`${BASE_PATH}/api/teacher-schedule-compare?teacherNames=${encodeURIComponent(teacherNames)}&startTime=${startTime}&endTime=${endTime}`);
        const result = await response.json();

        if (result.success) {
            renderTeacherCalendarView(result.data, dates);
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 60px; color: #d32f2f;">${result.error || '加载失败'}</td></tr>`;
        }
    } catch (error) {
        console.error('加载课程数据失败:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #d32f2f;">加载失败</td></tr>';
    }
}

// 渲染日历视图（支持多老师）
function renderTeacherCalendarView(data, dates) {
    const tbody = document.getElementById('teacherCalendarBody');
    const { yuekebao, classin } = data;

    // 处理 ClassIn 数据 - 按 "日期_时间_老师" 分组
    const classinMap = {};
    classin.forEach(s => {
        const dateKey = new Date(s.classBtime * 1000).toDateString();
        const timeKey = new Date(s.classBtime * 1000).toTimeString().slice(0, 5);
        const teacher = s.teacherName || '未知老师';
        const key = `${dateKey}_${timeKey}`;
        if (!classinMap[key]) {
            classinMap[key] = { teachers: {}, source: 'classin' };
        }
        if (!classinMap[key].teachers[teacher]) {
            classinMap[key].teachers[teacher] = { students: [], data: s };
        }
        if (s.studentName) {
            classinMap[key].teachers[teacher].students.push(s.studentName);
        }
    });

    // 处理约课宝数据
    const yuekebaoMap = {};
    yuekebao.forEach(s => {
        const dateKey = new Date(s.class_date).toDateString();
        const timeKey = s.class_start_time.slice(0, 5);
        const teacher = s.teacher || '未知老师';
        const key = `${dateKey}_${timeKey}`;
        if (!yuekebaoMap[key]) {
            yuekebaoMap[key] = { teachers: {}, source: 'yuekebao' };
        }
        if (!yuekebaoMap[key].teachers[teacher]) {
            yuekebaoMap[key].teachers[teacher] = { students: [], data: s };
        }
        if (s.student) {
            yuekebaoMap[key].teachers[teacher].students.push(s.student);
        }
    });

    // 统计
    let classinCount = 0;
    let yuekebaoCount = 0;
    let diffCount = 0;

    // 计算 ClassIn 和约课宝的唯一课程数
    Object.values(classinMap).forEach(slot => {
        classinCount += Object.keys(slot.teachers).length;
    });
    Object.values(yuekebaoMap).forEach(slot => {
        yuekebaoCount += Object.keys(slot.teachers).length;
    });

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

            const classinSlot = classinMap[key];
            const yuekebaoSlot = yuekebaoMap[key];

            let cellContent = '';
            let bgColor = '';
            let borderColor = '#e0e0e0';

            if (classinSlot || yuekebaoSlot) {
                const allTeachers = new Set([
                    ...Object.keys(classinSlot?.teachers || {}),
                    ...Object.keys(yuekebaoSlot?.teachers || {})
                ]);

                let teacherContents = [];
                allTeachers.forEach(teacher => {
                    const hasClassin = classinSlot?.teachers?.[teacher];
                    const hasYuekebao = yuekebaoSlot?.teachers?.[teacher];

                    let teacherBg = '';
                    let teacherStatus = '';

                    if (hasClassin && hasYuekebao) {
                        const classinStudents = hasClassin.students.sort().join(',');
                        const yuekebaoStudents = hasYuekebao.students.sort().join(',');
                        if (classinStudents === yuekebaoStudents) {
                            teacherBg = '#e0f7fa';
                            teacherStatus = '✓';
                        } else {
                            teacherBg = '#fff3e0';
                            teacherStatus = '⚠';
                            diffCount++;
                        }
                    } else if (hasClassin) {
                        teacherBg = '#e3f2fd';
                        teacherStatus = 'C';
                    } else if (hasYuekebao) {
                        teacherBg = '#e8f5e9';
                        teacherStatus = 'Y';
                    }

                    const students = hasClassin?.students || hasYuekebao?.students || [];
                    teacherContents.push(`
                        <div style="background: ${teacherBg}; padding: 2px 4px; border-radius: 3px; margin: 1px 0; font-size: 10px;">
                            <strong>${teacherStatus} ${teacher}</strong>
                            ${students.length > 0 ? `<br><span style="color: #666;">${students.join(', ')}</span>` : ''}
                        </div>
                    `);
                });

                cellContent = teacherContents.join('');
                bgColor = '#fafafa';
            }

            if (cellContent) {
                html += `<td style="padding: 2px; border: 1px solid ${borderColor}; background: ${bgColor}; vertical-align: top; max-width: 150px;">${cellContent}</td>`;
            } else {
                html += `<td style="padding: 2px; border: 1px solid #e0e0e0;"></td>`;
            }
        }

        html += '</tr>';
    });

    tbody.innerHTML = html || '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #999;">本周无课程</td></tr>';

    // 更新统计
    document.getElementById('teacherCalendarClassinCount').textContent = classinCount;
    document.getElementById('teacherCalendarYuekebaoCount').textContent = yuekebaoCount;
    document.getElementById('teacherCalendarDiffCount').textContent = diffCount;
}

// 老师选择器变化时重新加载
document.getElementById('teacherSelector')?.addEventListener('change', function() {
    loadTeacherCalendarData();
});
```

---

### Task 4: UPDATE Tab 切换初始化

**文件**: `dashboard.html`
**位置**: 找到 tab 切换逻辑中 `if (targetTab === 'teachers')` 的部分

**IMPLEMENT**: 修改初始化调用

```javascript
if (targetTab === 'teachers') {
    initTeacherCalendar();
}
```

---

### Task 5: REMOVE 旧的弹窗 HTML

**文件**: `dashboard.html`
**位置**: 行 6078-6129 的 `teacherScheduleModal` 弹窗

**IMPLEMENT**: 删除整个弹窗 div（可选，保留也不影响功能）

---

### Task 6: REMOVE 旧的 loadTeacherData 和相关函数

**文件**: `dashboard.html`

**IMPLEMENT**: 可选择删除或注释以下不再使用的函数：
- `loadTeacherData` (行 4847-4925)
- `initTeacherDateInputs` (行 4928-4933)
- `openTeacherScheduleModal` (行 5875-5881)
- `closeTeacherScheduleModal` (行 5883-5885)
- 弹窗相关的 `loadTeacherScheduleData` 和 `renderScheduleCompareView`（保留逻辑可复用）

**注意**: 可以先保留这些代码，后续清理时再删除

---

## TESTING STRATEGY

### Manual Tests

1. **老师列表加载**: 切换到老师数据 tab，确认下拉框显示老师列表
2. **单选老师**: 选择一个老师，确认日历显示该老师课程
3. **多选老师**: 选择多个老师，确认日历同时显示多位老师课程
4. **全选功能**: 点击"全选"按钮，确认所有老师被选中
5. **清除功能**: 点击"清除"按钮，确认选择被清空
6. **周导航**: 测试上一周/下一周/本周按钮
7. **数据对比**: 确认约课宝/ClassIn 数据差异正确显示
8. **统计信息**: 确认底部统计数字正确

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
# 获取所有老师数据
curl "http://localhost:9000/api/teacher-schedule-compare?startTime=1706659200&endTime=1707264000"

# 获取指定老师数据
curl "http://localhost:9000/api/teacher-schedule-compare?teacherNames=May&startTime=1706659200&endTime=1707264000"
```

### Level 4: 手动验证

1. 打开 http://localhost:9000
2. 切换到"老师数据" tab
3. 验证日历视图正常显示
4. 测试老师选择和周导航功能

---

## ACCEPTANCE CRITERIA

- [ ] 老师数据 tab 直接显示日历视图（无弹窗）
- [ ] 老师下拉框支持多选
- [ ] "全选"和"清除"按钮正常工作
- [ ] 日历显示所选老师的课程
- [ ] 约课宝/ClassIn 数据对比正确显示
- [ ] 周导航功能正常
- [ ] 统计信息正确显示
- [ ] 无 JavaScript 错误

---

## COMPLETION CHECKLIST

- [ ] Task 1: 更新 API 支持多老师查询
- [ ] Task 2: 更新老师数据 Tab HTML 结构
- [ ] Task 3: 添加新的日历视图 JavaScript 函数
- [ ] Task 4: 更新 Tab 切换初始化
- [ ] Task 5: 移除旧弹窗 HTML（可选）
- [ ] Task 6: 移除旧函数（可选）
- [ ] 所有验证命令执行成功
- [ ] 手动测试确认功能正常

---

## NOTES

### 设计决策

1. **多老师展示**: 在同一时间槽内，每个老师的课程显示为独立的小卡片，便于区分
2. **状态标识**: 使用简短标识（✓=一致, ⚠=差异, C=仅ClassIn, Y=仅约课宝）节省空间
3. **保留旧代码**: 为了安全起见，旧代码暂时保留，后续可清理

### 图例说明

- ✓ + 青色背景: 两个系统数据一致
- ⚠ + 橙色背景: 两个系统数据有差异
- C + 蓝色背景: 仅 ClassIn 有记录
- Y + 绿色背景: 仅约课宝有记录

<!-- EOF -->
