/**
 * 老师数据页面 JavaScript
 */

// 全局变量
let teacherCalendarWeekOffset = 0;
let availableTeachers = [];

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    initTeacherCalendar();
});

// 初始化老师日历
async function initTeacherCalendar() {
    await loadTeacherList();
    loadTeacherCalendarData();
}

// 加载老师列表（checkbox 形式，默认全选）
async function loadTeacherList() {
    try {
        const dates = getTeacherCalendarWeekDates(0);
        const startTime = Math.floor(dates[0].getTime() / 1000);
        const endTime = Math.floor(dates[6].getTime() / 1000) + 24 * 60 * 60;

        const response = await fetch(`${BASE_PATH}/api/teacher-schedule-compare?startTime=${startTime}&endTime=${endTime}`);
        const result = await response.json();

        if (result.success && result.data.teachers) {
            availableTeachers = result.data.teachers;
            const container = document.getElementById('teacherCheckboxContainer');
            container.innerHTML = availableTeachers.map(t =>
                `<label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 13px; white-space: nowrap;">
                    <input type="checkbox" class="teacher-checkbox" value="${t}" checked onchange="loadTeacherCalendarData()">
                    ${t}
                </label>`
            ).join('');
        }
    } catch (error) {
        console.error('加载老师列表失败:', error);
    }
}

// 全选老师
function selectAllTeachers() {
    const checkboxes = document.querySelectorAll('.teacher-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    loadTeacherCalendarData();
}

// 清除选择
function clearTeacherSelection() {
    const checkboxes = document.querySelectorAll('.teacher-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    loadTeacherCalendarData();
}

// 获取选中的老师
function getSelectedTeachers() {
    const checkboxes = document.querySelectorAll('.teacher-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
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
            renderTeacherCalendarView(result.data, dates, result.data.aliasMap || {}, result.data.studentAliasMap || {});
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 60px; color: #d32f2f;">${result.error || '加载失败'}</td></tr>`;
        }
    } catch (error) {
        console.error('加载课程数据失败:', error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 60px; color: #d32f2f;">加载失败</td></tr>';
    }
}

// 渲染日历视图
function renderTeacherCalendarView(data, dates, aliasMap = {}, studentAliasMap = {}) {
    const tbody = document.getElementById('teacherCalendarBody');
    const { yuekebao, classin } = data;

    const getNormalizedTeacher = (name) => aliasMap[name] || name;
    const getNormalizedStudent = (name) => studentAliasMap[name] || name;

    // 处理 ClassIn 数据
    const classinMap = {};
    classin.forEach(s => {
        const dateKey = new Date(s.classBtime * 1000).toDateString();
        const timeKey = new Date(s.classBtime * 1000).toTimeString().slice(0, 5);
        const teacher = getNormalizedTeacher(s.teacherName || '未知老师');
        const key = `${dateKey}_${timeKey}`;
        if (!classinMap[key]) {
            classinMap[key] = { teachers: {}, source: 'classin' };
        }
        if (!classinMap[key].teachers[teacher]) {
            classinMap[key].teachers[teacher] = { students: [], data: s };
        }
        if (s.studentName) {
            classinMap[key].teachers[teacher].students.push(getNormalizedStudent(s.studentName));
        }
    });

    // 处理约课宝数据
    const yuekebaoMap = {};
    yuekebao.forEach(s => {
        const dateKey = new Date(s.class_date).toDateString();
        const timeKey = s.class_start_time.slice(0, 5);
        const teacher = getNormalizedTeacher(s.teacher || '未知老师');
        const key = `${dateKey}_${timeKey}`;
        if (!yuekebaoMap[key]) {
            yuekebaoMap[key] = { teachers: {}, source: 'yuekebao' };
        }
        if (!yuekebaoMap[key].teachers[teacher]) {
            yuekebaoMap[key].teachers[teacher] = { students: [], data: s };
        }
        if (s.student) {
            yuekebaoMap[key].teachers[teacher].students.push(getNormalizedStudent(s.student));
        }
    });

    // 统计
    let classinCount = 0;
    let yuekebaoCount = 0;
    let diffCount = 0;

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
            <td style="padding: 10px; border: 1px solid #e0e0e0; background: #fafafa; font-size: 13px; font-weight: 500; text-align: center;">${time}</td>`;

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
                    let studentDisplay = '';
                    const studentLineStyle = 'display: block; margin-top: 6px; font-size: 12px; line-height: 1.4;';

                    if (hasClassin && hasYuekebao) {
                        const classinStudents = hasClassin.students.sort().join(',');
                        const yuekebaoStudents = hasYuekebao.students.sort().join(',');
                        if (classinStudents === yuekebaoStudents) {
                            teacherBg = '#e0f7fa';
                            teacherStatus = '✓';
                            studentDisplay = hasClassin.students.length > 0
                                ? `<span style="${studentLineStyle} color: #374151;">${hasClassin.students.join(', ')}</span>`
                                : '';
                        } else {
                            teacherBg = '#fff3e0';
                            teacherStatus = '⚠';
                            diffCount++;
                            const cStudents = hasClassin.students.length > 0
                                ? `<span style="${studentLineStyle} color: #1976d2;">C: ${hasClassin.students.join(', ')}</span>`
                                : '';
                            const yStudents = hasYuekebao.students.length > 0
                                ? `<span style="${studentLineStyle} color: #2e7d32;">Y: ${hasYuekebao.students.join(', ')}</span>`
                                : '';
                            studentDisplay = [cStudents, yStudents].filter(s => s).join('');
                        }
                    } else if (hasClassin) {
                        teacherBg = '#e3f2fd';
                        teacherStatus = 'C';
                        studentDisplay = hasClassin.students.length > 0
                            ? `<span style="${studentLineStyle} color: #374151;">${hasClassin.students.join(', ')}</span>`
                            : '';
                    } else if (hasYuekebao) {
                        teacherBg = '#e8f5e9';
                        teacherStatus = 'Y';
                        studentDisplay = hasYuekebao.students.length > 0
                            ? `<span style="${studentLineStyle} color: #374151;">${hasYuekebao.students.join(', ')}</span>`
                            : '';
                    }

                    teacherContents.push(`
                        <div style="background: ${teacherBg}; padding: 10px 12px; border-radius: 8px; margin: 4px 0; font-size: 13px; line-height: 1.5;">
                            <strong style="display: block; font-size: 14px; color: #111827; margin-bottom: 4px;">${teacherStatus} ${teacher}</strong>
                            ${studentDisplay || ''}
                        </div>
                    `);
                });

                cellContent = teacherContents.join('');
                bgColor = '#fafafa';
            }

            if (cellContent) {
                html += `<td style="padding: 8px; border: 1px solid ${borderColor}; background: ${bgColor}; vertical-align: top; max-width: 200px;">${cellContent}</td>`;
            } else {
                html += `<td style="padding: 8px; border: 1px solid #e0e0e0;"></td>`;
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
