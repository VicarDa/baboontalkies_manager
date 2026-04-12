/**
 * 学员数据页面 JavaScript
 */

let allData = [];
let currentSort = { column: null, direction: null };
let scheduleTooltip = null;
let studentAliasesCache = {};
let hiddenRemainingStudents = new Set();

function getCombinedRemainingClasses(student) {
    return (student.next90DaysClasses || 0) + (student.unscheduledClasses || 0);
}

function shouldIncludeInRemainingStats(student) {
    return Boolean(student?.name) && !hiddenRemainingStudents.has(student.name);
}

function normalizeCourseType(courseType) {
    const text = String(courseType || '').trim();

    if (!text) return '未知';
    if (text.includes('一对多') || text.includes('涓€瀵瑰')) return '一对多';
    if (text.includes('菲教') || text.includes('鑿叉暀')) return '菲教';
    if (text.includes('欧教') || text.includes('娆ф暀')) return '欧教';
    if (text.includes('试课')) return '试课';
    if (text.includes('未知') || text.includes('鏈煡')) return '未知';

    return text;
}

// 页面加载时自动获取数据
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    loadStudentAliases();

    // 搜索框事件
    document.getElementById('searchInput').addEventListener('input', filterData);
    document.getElementById('courseTypeFilter').addEventListener('change', filterData);

    // 添加表头排序事件
    setupSorting();
});

// 设置表头排序功能
function setupSorting() {
    const sortableHeaders = document.querySelectorAll('th.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const column = this.dataset.column;

            // 切换排序方向
            if (currentSort.column === column) {
                if (currentSort.direction === 'asc') {
                    currentSort.direction = 'desc';
                } else if (currentSort.direction === 'desc') {
                    currentSort.direction = null;
                    currentSort.column = null;
                } else {
                    currentSort.direction = 'asc';
                }
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }

            updateSortingUI();
            applyCurrentSort();
        });
    });
}

// 更新排序UI
function updateSortingUI() {
    // 清除所有排序样式
    const allHeaders = document.querySelectorAll('th');
    allHeaders.forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });

    // 添加当前排序样式
    if (currentSort.column) {
        const activeHeader = document.querySelector(`th[data-column="${currentSort.column}"]`);
        if (activeHeader && currentSort.direction) {
            activeHeader.classList.add(`sort-${currentSort.direction}`);
        }
    }
}

// 应用当前排序
function applyCurrentSort() {
    const filteredData = getFilteredData();
    updateStats(calculateStats(filteredData));

    if (!currentSort.column || !currentSort.direction) {
        // 没有排序，使用原始顺序
        renderTable(filteredData);
        return;
    }

    const sortedData = sortData(filteredData, currentSort.column, currentSort.direction);
    renderTable(sortedData);
}

// 排序数据
function sortData(data, column, direction) {
    const sortedData = [...data];

    sortedData.sort((a, b) => {
        let valueA = getColumnValue(a, column);
        let valueB = getColumnValue(b, column);

        // 处理数字类型
        const header = document.querySelector(`th[data-column="${column}"]`);
        if (header && header.dataset.type === 'number') {
            valueA = parseInt(valueA) || 0;
            valueB = parseInt(valueB) || 0;
        }

        // 比较
        if (valueA < valueB) return direction === 'asc' ? -1 : 1;
        if (valueA > valueB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    return sortedData;
}

// 获取列值
function getColumnValue(student, column) {
    if (column === 'nextClass') {
        return student.nextClass ? `${student.nextClass.teacher} ${student.nextClass.date}` : '';
    }
    if (column === 'prevClass') {
        return student.prevClass ? `${student.prevClass.teacher} ${student.prevClass.date}` : '';
    }
    return student[column] || '';
}

// 获取过滤后的数据
function getFilteredData() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const courseTypeFilter = document.getElementById('courseTypeFilter').value;

    return allData.filter(student => {
        const normalizedCourseType = normalizeCourseType(student.courseType);
        const matchesSearch = !searchTerm ||
            (student.name && student.name.toLowerCase().includes(searchTerm)) ||
            (student.mobile && student.mobile.includes(searchTerm));

        const matchesCourseType = !courseTypeFilter || normalizedCourseType === courseTypeFilter;

        return matchesSearch && matchesCourseType;
    });
}

function isDisplayableStudent(student) {
    const remainingClasses = student.remainingClasses || 0;
    const scheduledClasses = student.scheduledClasses || 0;
    const pastClasses = student.past14DaysClasses || 0;
    const futureClasses = student.next90DaysClasses || 0;
    return remainingClasses > 0 || scheduledClasses > 0 || pastClasses > 0 || futureClasses > 0;
}

function getDisplayableStudents(data) {
    const studentGroups = {};

    data.forEach(student => {
        const name = student.name || '';
        if (!studentGroups[name]) {
            studentGroups[name] = [];
        }
        studentGroups[name].push(student);
    });

    const displayableStudents = [];
    Object.keys(studentGroups).forEach(name => {
        const group = studentGroups[name];
        if (group.some(isDisplayableStudent)) {
            group.forEach(student => {
                if (isDisplayableStudent(student)) {
                    displayableStudents.push(student);
                }
            });
        }
    });

    return displayableStudents;
}

// 重新计算统计数据（基于过滤后的学生数据）
function calculateStats(students) {
    const displayableStudents = getDisplayableStudents(students);
    const stats = {
        totalStudents: 0, // 未来90天已排菲教课学员数
        totalClasses: 0,
        upcomingClasses: 0, // 未来90天课时（不含一对多）
        lowBookingStudents: 0,
        lowBookingStudentNames: [], // 排课数≤4的菲教学员名字列表
        lowBookingByCategory: {
            pendingRenewal: [],
            pendingSchedule: []
        },
        byType: {
            '菲教': { totalClasses: 0, upcomingClasses: 0 },
            '欧教': { totalClasses: 0, upcomingClasses: 0 },
            '一对多': { totalClasses: 0, upcomingClasses: 0 }
        }
    };

    // 用于去重统计已排课的菲教学员
    const studentsWithClasses = new Set();
    const lowBookingStudents = new Set();
    const pendingRenewalStudents = new Set();
    const pendingScheduleStudents = [];

    displayableStudents.forEach(student => {
        const normalizedCourseType = normalizeCourseType(student.courseType);

        if (shouldIncludeInRemainingStats(student)) {
            stats.totalClasses += getCombinedRemainingClasses(student);
        }

        // 未来90天课时：不统计一对多
        if (normalizedCourseType !== '一对多') {
            stats.upcomingClasses += student.next90DaysClasses || 0;
        }

        // 统计未来90天已排课的菲教学员数（去重）
        if (normalizedCourseType === '菲教' && (student.next90DaysClasses || 0) > 0) {
            studentsWithClasses.add(student.name);
        }

        // 按课程类型统计
        const courseType = normalizedCourseType;
        if (stats.byType[courseType]) {
            if (shouldIncludeInRemainingStats(student)) {
                stats.byType[courseType].totalClasses += getCombinedRemainingClasses(student);
            }
            stats.byType[courseType].upcomingClasses += student.next90DaysClasses || 0;
        }
    });

    displayableStudents.forEach(student => {
        const normalizedCourseType = normalizeCourseType(student.courseType);
        if (normalizedCourseType === '菲教' &&
            (student.next90DaysClasses || 0) <= 4 &&
            (student.remainingClasses || 0) >= 0 &&
            student.name) {
            lowBookingStudents.add(student.name);

            if ((student.remainingClasses || 0) <= 4) {
                pendingRenewalStudents.add(student.name);
            } else if (!pendingScheduleStudents.some(s => s.name === student.name)) {
                pendingScheduleStudents.push({ name: student.name, next90DaysClasses: student.next90DaysClasses || 0 });
            }
        }
    });

    stats.totalStudents = studentsWithClasses.size;
    stats.lowBookingStudentNames = Array.from(lowBookingStudents);
    stats.lowBookingStudents = lowBookingStudents.size;
    stats.lowBookingByCategory = {
        pendingRenewal: Array.from(pendingRenewalStudents),
        pendingSchedule: pendingScheduleStudents
    };

    return stats;
}

async function loadData() {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '<tr><td colspan="8" class="loading">正在加载数据...</td></tr>';
    showTabLoading('students-tab', '正在加载学员数据...');

    try {
        // 首先获取配置以获取排除学生列表
        const configResponse = await fetch(BASE_PATH + '/api/config');
        const configResult = await configResponse.json();
        const excludedStudents = configResult.config?.excluded_students || [];
        hiddenRemainingStudents = new Set((configResult.config?.hide_remaining_students || []).filter(Boolean));

        // 调用后端API获取数据
        const response = await fetch(BASE_PATH + '/api/dashboard-data');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        let students = data.students || [];

        // 过滤掉被排除的学生
        if (excludedStudents.length > 0) {
            students = students.filter(student => !excludedStudents.includes(student.name));
            console.log(`📋 已过滤排除学生，原始: ${data.students.length} 条，过滤后: ${students.length} 条`);
        }

        allData = students;

        // 使用 filterData 应用默认筛选并同步刷新统计卡片
        filterData();
        hideTabLoading('students-tab');

    } catch (error) {
        console.error('加载数据失败:', error);
        tableBody.innerHTML = '<tr><td colspan="8" class="error">加载数据失败，请检查网络连接或稍后重试</td></tr>';
        setupStudentHoverEvents();
        hideTabLoading('students-tab');
    }
}

function updateStats(stats) {
    if (stats) {
        document.getElementById('totalStudents').textContent = stats.totalStudents || 0;
        document.getElementById('totalClasses').textContent = stats.totalClasses || 0;

        // 显示未来90天课时
        const upcomingClasses = stats.upcomingClasses || 0;
        document.getElementById('upcomingClasses').textContent = upcomingClasses;

        // 显示排课数≤4的菲教学员名字
        const namesElement = document.getElementById('lowBookingStudentNames');
        if (namesElement) {
            const pendingRenewal = stats.lowBookingByCategory?.pendingRenewal || [];
            const pendingSchedule = stats.lowBookingByCategory?.pendingSchedule || [];

            namesElement.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <strong>待续费：</strong>${pendingRenewal.length ? pendingRenewal.join('、') : '无'}
                </div>
                <div>
                    <strong>待排课：</strong>${pendingSchedule.length ? pendingSchedule.map(s => `${s.name}(${s.next90DaysClasses})`).join('、') : '无'}
                </div>
            `;
            namesElement.style.color =
                pendingRenewal.length || pendingSchedule.length ? '#e74c3c' : '#27ae60';
        }

        // 更新课程类型分解数据
        if (stats.byType) {
            const totalClassesBreakdown = document.getElementById('totalClassesBreakdown');
            const upcomingClassesBreakdown = document.getElementById('upcomingClassesBreakdown');

            // 格式化分解数据（即使值为0也要显示）
            const formatBreakdown = (field) => {
                const parts = [];
                if (stats.byType['菲教'] && stats.byType['菲教'][field] !== undefined) {
                    parts.push(`菲教: ${stats.byType['菲教'][field]}`);
                }
                if (stats.byType['欧教'] && stats.byType['欧教'][field] !== undefined) {
                    parts.push(`欧教: ${stats.byType['欧教'][field]}`);
                }
                if (stats.byType['一对多'] && stats.byType['一对多'][field] !== undefined) {
                    parts.push(`一对多: ${stats.byType['一对多'][field]}`);
                }
                return parts.join(' | ');
            };

            if (totalClassesBreakdown) {
                totalClassesBreakdown.textContent = formatBreakdown('totalClasses');
            }
            if (upcomingClassesBreakdown) {
                upcomingClassesBreakdown.textContent = formatBreakdown('upcomingClasses');
            }
        }
    }
}

function renderTable(data) {
    const tableBody = document.getElementById('tableBody');
    const finalFilteredData = getDisplayableStudents(data);

    if (finalFilteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="loading">没有找到数据</td></tr>';
        return;
    }

    // 为每个学员分组标记位置
    const studentsWithGrouping = [];
    const finalStudentGroups = {};

    finalFilteredData.forEach((student, index) => {
        const studentName = student.name || '';
        if (!finalStudentGroups[studentName]) {
            finalStudentGroups[studentName] = [];
        }
        finalStudentGroups[studentName].push({ student, originalIndex: index });
    });

    finalFilteredData.forEach((student, index) => {
        const studentName = student.name || '';
        const group = finalStudentGroups[studentName];
        const positionInGroup = group.findIndex(item => item.originalIndex === index);

        let groupClass = '';
        if (group.length > 1) {
            if (positionInGroup === 0) {
                groupClass = 'student-group-first';
            } else if (positionInGroup === group.length - 1) {
                groupClass = 'student-group-last';
            } else {
                groupClass = 'student-group-middle';
            }
        }

        studentsWithGrouping.push({
            ...student,
            groupClass
        });
    });

    tableBody.innerHTML = studentsWithGrouping.map(student => {
        const normalizedCourseType = normalizeCourseType(student.courseType);
        return `
        <tr class="${student.groupClass}${student.isRiskStudent ? ' risk-student' : ''}" data-student-name="${student.name || ''}">
            <td>${student.name || '-'}</td>
            <td class="number narrow-column ${getNumberClass(student.next90DaysClasses)}">${student.next90DaysClasses || 0}</td>
            <td class="number narrow-column">${student.unscheduledClasses || 0}</td>
            <td class="type-column"><span class="course-type ${normalizedCourseType}">${normalizedCourseType || '-'}</span></td>
            <td class="next-class class-column">
                ${student.prevClass ? `
                    <div class="teacher">${student.prevClass.teacher}</div>
                    <div class="datetime">${student.prevClass.date} ${student.prevClass.time}</div>
                ` : '暂无'}
            </td>
            <td class="next-class class-column">
                ${student.nextClass ? `
                    <div class="teacher">${student.nextClass.teacher}</div>
                    <div class="datetime">${student.nextClass.date} ${student.nextClass.time}</div>
                ` : '暂无安排'}
            </td>
            <td style="font-size: 12px; color: #666; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${(studentAliasesCache[student.name]?.notes || '').replace(/"/g, '&quot;')}">
                ${studentAliasesCache[student.name]?.notes || ''}
            </td>
            <td style="text-align: center; white-space: nowrap;">
                <button onclick="editStudent('${(student.name || '').replace(/'/g, "\\'")}')"
                        style="padding: 6px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; white-space: nowrap;">
                    编辑
                </button>
            </td>
        </tr>
        `;
    }).join('');

    // 添加鼠标悬停事件监听
    setupRowHover();
    // 添加学员排课信息悬浮事件
    setupStudentHoverEvents();
}

function getNumberClass(number) {
    if (number > 10) return 'positive';
    if (number > 5) return 'warning';
    if (number <= 0) return 'danger';
    return 'warning';
}

// 设置行悬停效果
function setupRowHover() {
    const tableRows = document.querySelectorAll('#tableBody tr');

    tableRows.forEach(row => {
        const studentName = row.dataset.studentName;

        row.addEventListener('mouseenter', function() {
            if (studentName) {
                const sameStudentRows = document.querySelectorAll(`#tableBody tr[data-student-name="${studentName}"]`);
                sameStudentRows.forEach(sameRow => {
                    sameRow.classList.add('student-highlight');
                });
            }
        });

        row.addEventListener('mouseleave', function() {
            if (studentName) {
                const sameStudentRows = document.querySelectorAll(`#tableBody tr[data-student-name="${studentName}"]`);
                sameStudentRows.forEach(sameRow => {
                    sameRow.classList.remove('student-highlight');
                });
            }
        });
    });
}

function filterData() {
    // 应用当前排序到过滤后的数据
    applyCurrentSort();
}

// ========== 学员排课日历弹窗 ==========

function setupStudentHoverEvents() {
    const studentRows = document.querySelectorAll('#dataTable tbody tr');
    studentRows.forEach((row) => {
        row.addEventListener('click', handleStudentRowClick);
        row.style.cursor = 'pointer';
    });
}

async function handleStudentRowClick(event) {
    const row = event.currentTarget;
    const studentName = row.cells[0]?.textContent?.trim();

    if (!studentName) {
        return;
    }

    // 先显示Loading弹窗
    showScheduleTooltipWithLoading(event, studentName);

    try {
        const response = await fetch(`${BASE_PATH}/api/student-schedule/${encodeURIComponent(studentName)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || '获取学员排课失败');
        }

        // 数据加载完成，更新弹窗内容
        updateScheduleTooltipContent(studentName, data.schedules);
    } catch (error) {
        console.error('获取学员排课失败:', error);
        updateScheduleTooltipContent(studentName, [], `获取排课数据失败: ${error.message}`);
    }
}

// 显示带Loading的弹窗
function showScheduleTooltipWithLoading(event, studentName) {
    hideScheduleTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'schedule-tooltip';
    tooltip.id = 'schedule-tooltip-loading';

    // Loading内容
    tooltip.innerHTML = `
        <div class="schedule-header">
            <div class="student-name">${studentName}</div>
        </div>
        <div class="schedule-loading" style="padding: 40px; text-align: center;">
            <div class="loading-spinner" style="
                width: 40px;
                height: 40px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #10b981;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
            "></div>
            <div style="color: #666; font-size: 14px;">加载中...</div>
        </div>
    `;

    // 添加旋转动画样式
    if (!document.getElementById('loading-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'loading-spinner-style';
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // 确保弹窗可见并正确定位
    tooltip.style.cssText = `
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: absolute !important;
        z-index: 10000 !important;
    `;

    // 防止弹窗内部点击时关闭弹窗
    tooltip.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 添加关闭按钮
    const closeButton = createCloseButton();
    tooltip.appendChild(closeButton);
    document.body.appendChild(tooltip);
    scheduleTooltip = tooltip;

    positionTooltip(tooltip, event);

    // 点击外部关闭弹窗
    document.removeEventListener('click', hideScheduleTooltip);
    setTimeout(() => {
        document.addEventListener('click', hideScheduleTooltip, { once: true });
    }, 100);
}

// 创建关闭按钮
function createCloseButton() {
    const closeButton = document.createElement('div');
    closeButton.className = 'tooltip-close-btn';
    closeButton.style.cssText = `
        position: absolute;
        top: 12px;
        right: 12px;
        width: 22px;
        height: 22px;
        cursor: pointer;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.8);
        font-weight: bold;
        text-align: center;
        line-height: 22px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        transition: all 0.2s ease;
        z-index: 100;
    `;
    closeButton.innerHTML = '×';
    closeButton.title = '关闭';
    closeButton.addEventListener('click', hideScheduleTooltip);
    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        closeButton.style.color = 'white';
    });
    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        closeButton.style.color = 'rgba(255, 255, 255, 0.8)';
    });
    return closeButton;
}

// 更新弹窗内容（数据加载完成后）
function updateScheduleTooltipContent(studentName, scheduleData, errorMessage = null) {
    const tooltip = scheduleTooltip;
    if (!tooltip) return;

    // 生成新内容
    const htmlContent = createCalendarHTML(studentName, scheduleData, errorMessage);
    tooltip.innerHTML = htmlContent;

    // 重新添加关闭按钮
    tooltip.appendChild(createCloseButton());
}

function createCalendarHTML(studentName, scheduleData, errorMessage = null) {
    if (errorMessage) {
        return `
            <div class="schedule-header">
                <div class="student-name">${studentName}</div>
            </div>
            <div style="padding: 20px; text-align: center; color: #e74c3c;">
                ${errorMessage}
            </div>
        `;
    }

    if (!scheduleData || scheduleData.length === 0) {
        return `
            <div class="schedule-header">
                <div class="student-name">${studentName}</div>
            </div>
            <div style="padding: 20px; text-align: center; color: #7f8c8d;">
                未来2个月内暂无排课安排
            </div>
        `;
    }

    const scheduleMap = {};
    scheduleData.forEach(item => {
        const date = new Date(item.class_date);
        const dateKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        if (!scheduleMap[dateKey]) {
            scheduleMap[dateKey] = [];
        }
        scheduleMap[dateKey].push({
            startTime: item.class_start_time,
            endTime: item.class_end_time,
            teacher: item.teacher,
            timeNum: item.time_num
        });
    });

    return `
        <div class="schedule-header">
            <div class="student-name">${studentName}</div>
        </div>
        <div class="schedule-list-container">
            ${generateScheduleList(scheduleMap)}
        </div>
    `;
}

function generateScheduleList(scheduleMap) {
    const sortedDates = Object.keys(scheduleMap).sort();

    if (sortedDates.length === 0) {
        return `<div style="padding: 20px; text-align: center; color: #7f8c8d;">暂无排课数据</div>`;
    }

    // 创建日历表格
    let html = `
        <table class="schedule-table">
            <thead>
                <tr>
                    <th>日</th>
                    <th>一</th>
                    <th>二</th>
                    <th>三</th>
                    <th>四</th>
                    <th>五</th>
                    <th>六</th>
                </tr>
            </thead>
            <tbody>
    `;

    // 找到第一个和最后一个日期
    const firstDate = new Date(sortedDates[0]);
    const lastDate = new Date(sortedDates[sortedDates.length - 1]);

    // 找到第一周的周日
    const startDate = new Date(firstDate);
    startDate.setDate(firstDate.getDate() - firstDate.getDay());

    // 找到最后一周的周六
    const endDate = new Date(lastDate);
    endDate.setDate(lastDate.getDate() + (6 - lastDate.getDay()));

    // 按周生成日历
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        html += '<tr>';

        // 生成一周的7天
        for (let day = 0; day < 7; day++) {
            const dateKey = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
            const schedules = scheduleMap[dateKey];
            const today = new Date();

            if (schedules) {
                const month = currentDate.getMonth() + 1;
                const dayNum = currentDate.getDate();

                let tdClass = 'has-class';
                if (currentDate.toDateString() === today.toDateString()) {
                    tdClass += ' today';
                }

                html += `<td class="${tdClass}">`;
                html += `<div class="cell-date">${month}/${dayNum}</div>`;
                html += `<div class="cell-classes">`;

                schedules.slice(0, 3).forEach(schedule => {
                    html += `<div class="cell-class"><span class="cell-time">${schedule.startTime}</span><span class="cell-teacher">${schedule.teacher}</span></div>`;
                });

                if (schedules.length > 3) {
                    html += `<div class="cell-more">+${schedules.length - 3}</div>`;
                }

                html += `</div></td>`;
            } else {
                html += '<td class="empty"></td>';
            }

            currentDate.setDate(currentDate.getDate() + 1);
        }

        html += '</tr>';

        if (currentDate > endDate) {
            break;
        }
    }

    html += `
            </tbody>
        </table>
    `;

    return html;
}

function positionTooltip(tooltip, event) {
    if (!tooltip) {
        return;
    }

    const tooltipWidth = 520;
    const tooltipHeight = 450;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    let left, top;

    if (event && event.clientX && event.clientY) {
        left = event.clientX + scrollX + 10;
        top = event.clientY + scrollY - 50;

        if (left + tooltipWidth > scrollX + windowWidth) {
            left = event.clientX + scrollX - tooltipWidth - 10;
        }

        if (top + tooltipHeight > scrollY + windowHeight) {
            top = scrollY + windowHeight - tooltipHeight - 20;
        }

        if (top < scrollY + 20) {
            top = scrollY + 20;
        }

        if (left < scrollX + 20) {
            left = scrollX + 20;
        }
    } else {
        left = scrollX + Math.max(20, (windowWidth - tooltipWidth) / 2);
        top = scrollY + Math.max(20, (windowHeight - tooltipHeight) / 2);
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function hideScheduleTooltip() {
    if (scheduleTooltip) {
        scheduleTooltip.remove();
        scheduleTooltip = null;
    }
}

// ========== 学生编辑功能 ==========

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

// 编辑学生
function editStudent(studentName) {
    const studentData = studentAliasesCache[studentName] || { aliases: [], course_requirements: '', tags: [], notes: '' };
    showStudentModal(studentName, studentData);
}

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

// 关闭学生模态框
function closeStudentModal() {
    const modal = document.getElementById('studentModal');
    if (modal) modal.remove();
}

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
