/**
 * 工资计算页面 JavaScript
 */

// 全局变量
window.lastSalaryData = null;
window.teacherRewards = window.teacherRewards || {};
window.currentTrialData = {};
window.deletedAttendanceRecords = window.deletedAttendanceRecords || {};
window.currentSalaryFormat = window.currentSalaryFormat || 'detailed';

function toEnglishAttendanceReason(reason) {
    const raw = String(reason || '').trim();
    if (!raw) return '';

    if (raw === '老师未进入教室') {
        return 'Teacher did not enter the classroom';
    }
    if (raw === '未签到') {
        return 'Not Check in';
    }

    // Keep only the entry time; omit parenthetical detail per current UX request
    const match = raw.match(/^老师(\d{2}:\d{2})进入(?:（.*）)?$/);
    if (match) {
        return `Teacher entered at ${match[1]}`;
    }

    return raw;
}

function isSalaryDeductibleLateRecord(record) {
    return record?.salaryDeductible !== false;
}

function formatAttendanceReason(record) {
    const reasonText = toEnglishAttendanceReason(record?.reason);
    if (!reasonText) return '';
    if (record?.salaryDeductible === false) {
        return `${reasonText} (no salary deduction)`;
    }
    return reasonText;
}

function toEnglishTrialDetailReason(reason) {
    const raw = String(reason || '').trim();
    if (!raw) return '';

    const followUpMatch = raw.match(/^后续有(\d+)节正式课$/);
    if (followUpMatch) {
        const count = Number(followUpMatch[1]);
        return `${count} follow-up regular class${count === 1 ? '' : 'es'}`;
    }
    if (raw === '无后续正式课') {
        return 'No follow-up regular classes';
    }
    return raw;
}

function normalizeTrialResult(result) {
    return result === 'success' ? 'success' : 'failed';
}

function buildTrialDetailKey(index, detail) {
    return [
        index,
        detail?.student || '',
        detail?.date || '',
        detail?.reason || ''
    ].join('|');
}

function getBaseTrialDetails(teacher) {
    const details = Array.isArray(teacher?.autoTrialData?.details) ? teacher.autoTrialData.details : [];
    return details.map((detail, index) => {
        const normalizedResult = normalizeTrialResult(detail?.result);
        return {
            ...detail,
            result: normalizedResult,
            __trialKey: buildTrialDetailKey(index, detail),
            __baseResult: normalizedResult
        };
    });
}

function formatTrialDetailReason(detail) {
    if (detail?.__baseResult && detail.result !== detail.__baseResult) {
        return '';
    }
    return toEnglishTrialDetailReason(detail?.reason);
}

function buildAttendanceRecordKey(recordType, index, record) {
    return [
        recordType,
        index,
        record?.classTime || '',
        record?.studentName || '',
        record?.reason || '',
        record?.salaryDeductible === false ? '0' : '1'
    ].join('|');
}

function getDeletedAttendanceRecordMap(teacherName) {
    if (!window.deletedAttendanceRecords[teacherName]) {
        window.deletedAttendanceRecords[teacherName] = {};
    }
    return window.deletedAttendanceRecords[teacherName];
}

function getEffectiveAttendanceInfo(teacherName, teacher) {
    const attendance = teacher?.attendanceInfo || {};
    const deletedRecords = getDeletedAttendanceRecordMap(teacherName || teacher?.teacher || '');

    const normalizeRecords = (recordType, records = []) => {
        return (Array.isArray(records) ? records : [])
            .map((record, index) => {
                const attendanceKey = buildAttendanceRecordKey(recordType, index, record);
                return {
                    ...record,
                    __attendanceType: recordType,
                    __attendanceKey: attendanceKey
                };
            })
            .filter(record => !deletedRecords[record.__attendanceKey]);
    };

    return {
        lateRecords: normalizeRecords('late', attendance.lateRecords),
        absentRecords: normalizeRecords('absent', attendance.absentRecords),
        unsignedRecords: normalizeRecords('unsigned', attendance.unsignedRecords)
    };
}

function renderAttendanceRecordList(teacherName, records, icon) {
    if (!Array.isArray(records) || records.length === 0) {
        return '';
    }

    return `
        <ul style="margin: 4px 0 0 0; padding-left: 18px; font-size: 13px; line-height: 1.8; list-style-type: none;">
            ${records.map(record => `
                <li style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
                    <span>${icon}</span>
                    <span style="flex: 1;">${record.classTime} (${record.studentName}): ${formatAttendanceReason(record)}</span>
                    <button onclick='removeAttendanceRecord(${JSON.stringify(teacherName)}, ${JSON.stringify(record.__attendanceKey)})' style="padding: 2px 6px; font-size: 11px; background: white; color: #dc2626; border: 1px solid #fecaca; border-radius: 4px; cursor: pointer; line-height: 1.4;">Remove</button>
                </li>
            `).join('')}
        </ul>
    `;
}

function getAttendanceCompensation(teacher, normalSalary = 0, trialCommission = 0) {
    const attendance = getEffectiveAttendanceInfo(teacher?.teacher, teacher);
    const lateRecords = Array.isArray(attendance.lateRecords) ? attendance.lateRecords : [];
    const lateCount = lateRecords.length;
    const absentCount = Array.isArray(attendance.absentRecords) ? attendance.absentRecords.length : 0;
    const unsignedCount = Array.isArray(attendance.unsignedRecords) ? attendance.unsignedRecords.length : 0;
    const perSessionSalary = Number(teacher?.finalRate) || 0;
    const deductibleLateCount = lateRecords.filter(isSalaryDeductibleLateRecord).length;

    const lateDeduction = deductibleLateCount * perSessionSalary * 0.5;
    const absentDeduction = absentCount * perSessionSalary * 2;

    // Bonus applies only when there are no late / absent / unsigned records in the period.
    const bonusEligible = lateCount === 0 && absentCount === 0 && unsignedCount === 0;

    return {
        lateCount,
        deductibleLateCount,
        absentCount,
        unsignedCount,
        lateDeduction,
        absentDeduction,
        bonusEligible,
        bonusAmount: 0,
        // Deductions are now represented in "Rewards and Punishments" as auto items.
        totalAdjustment: 0
    };
}

function getTeacherTrialCounts(teacherName, teacher) {
    if (!teacher) {
        return {
            successfulTrials: 0,
            failedTrials: 0,
            source: 'none',
            details: []
        };
    }

    if (window.currentTrialData && window.currentTrialData[teacherName]) {
        const manual = window.currentTrialData[teacherName];
        const manualDetails = Array.isArray(manual.details) ? manual.details.map(detail => ({
            ...detail,
            result: normalizeTrialResult(detail?.result),
            __trialKey: detail?.__trialKey || buildTrialDetailKey(0, detail),
            __baseResult: normalizeTrialResult(detail?.__baseResult || detail?.result)
        })) : [];
        if (manualDetails.length > 0) {
            const successfulTrials = manualDetails.filter(detail => detail.result === 'success').length;
            const failedTrials = manualDetails.filter(detail => detail.result !== 'success').length;
            return {
                successfulTrials,
                failedTrials,
                source: 'manual',
                details: manualDetails
            };
        }
        return {
            successfulTrials: manual.successful || 0,
            failedTrials: manual.failed || 0,
            source: 'manual',
            details: getBaseTrialDetails(teacher)
        };
    }

    const successfulInput = document.getElementById(`successful_trial_${teacherName}`);
    const failedInput = document.getElementById(`failed_trial_${teacherName}`);
    if (successfulInput || failedInput) {
        return {
            successfulTrials: parseInt(successfulInput?.value || 0) || 0,
            failedTrials: parseInt(failedInput?.value || 0) || 0,
            source: teacher.trialSource || 'manual',
            details: getBaseTrialDetails(teacher)
        };
    }

    if (teacher.autoTrialData) {
        return {
            successfulTrials: teacher.autoTrialData.successful || 0,
            failedTrials: teacher.autoTrialData.failed || 0,
            source: 'auto',
            details: getBaseTrialDetails(teacher)
        };
    }

    if (teacher.trialClasses > 0) {
        return {
            successfulTrials: 0,
            failedTrials: teacher.trialClasses,
            source: 'default',
            details: []
        };
    }

    return {
        successfulTrials: 0,
        failedTrials: 0,
        source: 'none',
        details: []
    };
}

function getTeacherTrialCommission(teacherName, teacher) {
    const { successfulTrials, failedTrials } = getTeacherTrialCounts(teacherName, teacher);
    return (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);
}

function calculateRewardsAmount(rewards, baseAmount) {
    let rewardsAmount = 0;
    for (const reward of rewards || []) {
        if (reward.type === 'percentage') {
            rewardsAmount += (baseAmount || 0) * (reward.value / 100);
        } else if (reward.type === 'absolute') {
            rewardsAmount += reward.value;
        }
    }
    return rewardsAmount;
}

function getEffectiveRewardsForTeacher(teacher, normalSalary = 0, trialCommission = 0) {
    const teacherName = teacher?.teacher;
    const manualRewards = Array.isArray(window.teacherRewards?.[teacherName]) ? [...window.teacherRewards[teacherName]] : [];
    const attendanceComp = getAttendanceCompensation(teacher, normalSalary, trialCommission);
    const attendance = getEffectiveAttendanceInfo(teacherName, teacher);
    const perSessionSalary = Number(teacher?.finalRate) || 0;
    const dismissed = window.dismissedAutoRewards?.[teacherName] || [];

    if (attendanceComp.bonusEligible && !dismissed.includes('__auto_attendance_bonus__')) {
        manualRewards.push({
            id: '__auto_attendance_bonus__',
            type: 'percentage',
            value: 10,
            note: 'Bonus',
            autoGenerated: true
        });
    }

    // Add late deduction entries
    if (Array.isArray(attendance.lateRecords)) {
        attendance.lateRecords.forEach((r, i) => {
            if (!isSalaryDeductibleLateRecord(r)) {
                return;
            }
            if (dismissed.includes(`__auto_late_${i}__`)) return;
            manualRewards.push({
                id: `__auto_late_${i}__`,
                type: 'absolute',
                value: -(perSessionSalary * 0.5),
                note: `Late: ${r.classTime} (${r.studentName}) - ${formatAttendanceReason(r)}`,
                autoGenerated: true
            });
        });
    }

    // Add absent deduction entries
    if (Array.isArray(attendance.absentRecords)) {
        attendance.absentRecords.forEach((r, i) => {
            if (dismissed.includes(`__auto_absent_${i}__`)) return;
            manualRewards.push({
                id: `__auto_absent_${i}__`,
                type: 'absolute',
                value: -(perSessionSalary * 2),
                note: `Absent: ${r.classTime} (${r.studentName}) - ${toEnglishAttendanceReason(r.reason)}`,
                autoGenerated: true
            });
        });
    }

    return manualRewards;
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    setDefaultSalaryDateRange();
});

// 清空工资计算结果
function clearSalaryResults() {
    const resultsDiv = document.getElementById('salaryResults');
    resultsDiv.style.display = 'none';
    resultsDiv.innerHTML = '';
    window.lastSalaryData = null;
    window.teacherRewards = {};
    window.currentTrialData = {};
    window.deletedAttendanceRecords = {};
    window.currentSalaryFormat = 'detailed';
}

// 设置默认工资计算日期范围（上周日到本周六）
function setDefaultSalaryDateRange() {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = 周日, 1 = 周一, ..., 6 = 周六

    // 计算本周六的日期
    const daysUntilSaturday = 6 - currentDayOfWeek;
    const thisSaturday = new Date(today);
    thisSaturday.setDate(today.getDate() + daysUntilSaturday);

    // 计算上周日的日期（本周六往前6天）
    const lastSunday = new Date(thisSaturday);
    lastSunday.setDate(thisSaturday.getDate() - 6);

    // 格式化为 YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // 设置日期输入框的值
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    if (startDateInput && endDateInput) {
        startDateInput.value = formatDate(lastSunday);
        endDateInput.value = formatDate(thisSaturday);
    }
}

// 计算工资
async function calculateSalary() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
        alert('请填写开始日期和结束日期');
        return;
    }

    // 收集试课数据
    const trialData = {};
    const successfulTrialInputs = document.querySelectorAll('[id^="successful_trial_"]');
    const failedTrialInputs = document.querySelectorAll('[id^="failed_trial_"]');

    successfulTrialInputs.forEach(input => {
        const teacher = input.id.replace('successful_trial_', '');
        const successfulCount = parseInt(input.value) || 0;
        if (successfulCount > 0) {
            if (!trialData[teacher]) trialData[teacher] = {};
            trialData[teacher].successful = successfulCount;
        }
    });

    failedTrialInputs.forEach(input => {
        const teacher = input.id.replace('failed_trial_', '');
        const failedCount = parseInt(input.value) || 0;
        if (failedCount > 0) {
            if (!trialData[teacher]) trialData[teacher] = {};
            trialData[teacher].failed = failedCount;
        }
    });

    const requestBody = {
        startDate,
        endDate,
        teacherAdjustments: {},
        trialData,
        rewardsData: window.teacherRewards || {}
    };

    try {
        const response = await fetch(BASE_PATH + '/api/salary-calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.success) {
            window.deletedAttendanceRecords = {};
            displaySalaryResults(data);
        } else {
            alert('工资计算失败: ' + data.message);
        }
    } catch (error) {
        console.error('工资计算请求错误:', error);
        alert('工资计算请求失败，请检查网络连接');
    }
}

// 显示工资计算结果
function displaySalaryResults(data, format = 'detailed') {
    // 保存数据供格式切换使用
    window.lastSalaryData = data;
    window.currentSalaryFormat = format;

    const resultsDiv = document.getElementById('salaryResults');
    const { period, summary, teachers } = data;

    // 计算菲教和欧教分开的汇总
    const filipinoSummary = { baseSalary: 0, trialCommission: 0, rewardsAmount: 0, totalSalary: 0, teacherCount: 0, totalClasses: 0 };
    const europeanSummary = { baseSalary: 0, trialCommission: 0, rewardsAmount: 0, totalSalary: 0, teacherCount: 0, totalClasses: 0 };

    data.teachers.forEach(teacher => {
        const trialCommission = getTeacherTrialCommission(teacher.teacher, teacher);

        // 获取奖惩数据
        const baseSalary = (teacher.normalClasses || 0) * teacher.finalRate;
        const rewards = getEffectiveRewardsForTeacher(teacher, baseSalary, trialCommission);
        const rewardsAmount = calculateRewardsAmount(rewards, baseSalary + trialCommission);

        const attendanceComp = getAttendanceCompensation(teacher, baseSalary, trialCommission);
        const finalTotalSalary = baseSalary + trialCommission + rewardsAmount + attendanceComp.totalAdjustment;

        if (teacher.salaryUnit === 'pesos') {
            filipinoSummary.baseSalary += baseSalary;
            filipinoSummary.trialCommission += trialCommission;
            filipinoSummary.rewardsAmount += rewardsAmount;
            filipinoSummary.totalSalary += finalTotalSalary;
            filipinoSummary.teacherCount++;
            filipinoSummary.totalClasses += teacher.totalClasses;
        } else if (teacher.salaryUnit === 'dollars') {
            europeanSummary.baseSalary += baseSalary;
            europeanSummary.trialCommission += trialCommission;
            europeanSummary.rewardsAmount += rewardsAmount;
            europeanSummary.totalSalary += finalTotalSalary;
            europeanSummary.teacherCount++;
            europeanSummary.totalClasses += teacher.totalClasses;
        }
    });

    let html = `
        <div id="salarySummary" style="background: #f8f9ff; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h4 style="margin: 0 0 15px 0; color: #333;">📊 Salary Summary</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.9em;">
                <div><strong>Period:</strong> ${period.startDate} ~ ${period.endDate}</div>
                <div><strong>Teachers:</strong> ${summary.totalTeachers}</div>
                <div><strong>Total Classes:</strong> ${summary.totalClasses}</div>
                <div style="grid-column: span 2;"><hr style="margin: 10px 0; border: none; border-top: 1px solid #ddd;"></div>

                <!-- 欧教汇总 -->
                <div style="grid-column: span 2;"><strong>🇪🇺 European Teachers:</strong></div>
                <div style="grid-column: span 2;"><strong>Total:</strong> <span class="european-total" style="color: #e74c3c; font-weight: bold;">${formatCurrency(europeanSummary.totalSalary, 'dollars')}</span> dollars, <span class="european-total-rmb" style="color: #666;">¥${formatCurrency(europeanSummary.totalSalary * exchangeRates.dollars_exchange, 'rmb')}</span></div>

                <div style="grid-column: span 2; margin-top: 10px;"><hr style="margin: 5px 0; border: none; border-top: 1px solid #ddd;"></div>

                <!-- 菲教汇总 -->
                <div style="grid-column: span 2;"><strong>🇵🇭 Filipino Teachers:</strong></div>
                <div style="grid-column: span 2;"><strong>Total:</strong> <span class="filipino-total" style="color: #e74c3c; font-weight: bold;">${formatCurrency(filipinoSummary.totalSalary, 'pesos')}</span> pesos, <span class="filipino-total-rmb" style="color: #666;">¥${formatCurrency(filipinoSummary.totalSalary / (exchangeRates.cny_to_pesos || (1/exchangeRates.pesos_exchange) || 7.65), 'rmb')}</span></div>
                <div style="grid-column: span 2; text-align: center; margin-top: 15px;">
                    <button onclick="copySalarySummary()" style="background: #6366f1; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        📋 Copy Salary Summary
                    </button>
                </div>
            </div>
        </div>
    `;

    if (format === 'detailed') {
        html += '<div>';

        teachers.forEach(teacher => {
            const { successfulTrials, failedTrials, source, details: effectiveTrialDetails } = getTeacherTrialCounts(teacher.teacher, teacher);
            const trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);
            const normalSalary = (teacher.normalClasses || 0) * teacher.finalRate;
            const rewards = getEffectiveRewardsForTeacher(teacher, normalSalary, trialCommission);
            const rewardsAmount = calculateRewardsAmount(rewards, normalSalary + trialCommission);
            const attendanceComp = getAttendanceCompensation(teacher, normalSalary, trialCommission);
            const finalTotalSalary = normalSalary + trialCommission + rewardsAmount + attendanceComp.totalAdjustment;

            html += `
                <div data-teacher="${teacher.teacher}" style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px; overflow: hidden; user-select: text;">
                    <div style="background: white; color: #6366f1; padding: 12px; border-bottom: 1px solid #e0e0e0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>👨‍🏫 ${teacher.teacher}</strong>
                                ${teacher.hasAdjustment ? `<span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 10px; font-size: 0.8em; margin-left: 8px; border: 1px solid #ffeaa7;">Adjusted</span>` : ''}
                            </div>
                            <button onclick="copyTeacherSalaryDetails('${teacher.teacher}', event)" style="padding: 6px 12px; font-size: 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Copy Salary Details">
                                📋 Copy
                            </button>
                        </div>
                    </div>
                        <div style="padding: 15px; font-family: monospace; font-size: 14px; line-height: 2.2; user-select: text;">
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Total Salary:</strong>
                            <span class="total-salary" style="margin-left: 10px;">${formatCurrency(finalTotalSalary, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span>
                            ${source === 'auto' ? '<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #10b981;">🤖 Auto-filled</span>' : ''}
                            ${source === 'manual' ? '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #f59e0b;">📝 Manual</span>' : ''}
                        </div>
                        <div style="min-height: 50px; display: flex; align-items: center;"><strong>Per-session Salary:</strong> <span style="margin-left: 10px;">${formatCurrency(teacher.finalRate, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span></div>

                        <div style="border-top: 1px dashed #e5e7eb; margin: 10px 0; padding-top: 10px;">
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Regular Class Salary:</strong>
                                <span class="normal-salary" style="margin-left: 10px;">${formatCurrency(normalSalary || 0, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span>
                                <span style="color: #6b7280; font-size: 0.9em; margin-left: 8px;">(${teacher.normalClasses || 0} classes × ${formatCurrency(teacher.finalRate, teacher.salaryUnit)})</span>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Trial Class Commission:</strong>
                                <span class="trial-commission" style="margin-left: 10px;">${formatCurrency(trialCommission || 0, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span>
                            </div>
                        </div>

                        ${teacher.autoTrialData && teacher.trialClasses > 0 ? `
                        <div style="background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 6px; padding: 12px; margin: 10px 0;">
                            <div style="margin-bottom: 8px;"><strong style="color: #059669;">🤖 Auto Trial Classification:</strong></div>
                            ${effectiveTrialDetails && effectiveTrialDetails.length > 0 ? `
                            <ul style="margin: 8px 0 0 20px; padding: 0; font-size: 13px; line-height: 1.8; list-style-type: none;">
                                ${effectiveTrialDetails.map(d =>
                                    `<li style="margin-bottom: 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                        <span style="flex: 1 1 320px;">${d.student} (${d.date}): ${d.result === 'success' ? '✅' : '❌'}${formatTrialDetailReason(d) ? ` ${formatTrialDetailReason(d)}` : ''}</span>
                                        <select onchange='updateTrialDetailStatus(${JSON.stringify(teacher.teacher)}, ${JSON.stringify(d.__trialKey)}, this.value)' style="padding: 3px 6px; font-size: 12px; border: 1px solid #a7f3d0; border-radius: 4px; background: white;">
                                            <option value="success" ${d.result === 'success' ? 'selected' : ''}>Success</option>
                                            <option value="failed" ${d.result === 'failed' ? 'selected' : ''}>Failed</option>
                                        </select>
                                    </li>`
                                ).join('')}
                            </ul>
                            ` : ''}
                        </div>
                        ` : ''}

                        <div style="border-top: 1px dashed #e5e7eb; margin: 10px 0; padding-top: 10px;">
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Number of Regular Class:</strong>
                                <span style="margin-left: 10px; font-size: 15px; font-weight: 600; color: #374151;">${teacher.normalClasses || 0}</span>
                            </div>
                        </div>

                        ${(() => {
                            const attendance = getEffectiveAttendanceInfo(teacher.teacher, teacher);
                            const hasLate = attendance.lateRecords && attendance.lateRecords.length > 0;
                            const hasAbsent = attendance.absentRecords && attendance.absentRecords.length > 0;
                            const hasUnsigned = attendance.unsignedRecords && attendance.unsignedRecords.length > 0;
                            let aHtml = '<div style="border-top: 1px dashed #e5e7eb; margin: 10px 0; padding-top: 10px;">';
                            aHtml += '<div style="min-height: 40px; display: flex; align-items: flex-start; padding: 4px 0;"><strong style="white-space: nowrap;">Late:</strong><span style="margin-left: 10px;">';
                            if (hasLate) {
                                aHtml += '<span style="color: #f59e0b; font-weight: 600;">' + attendance.lateRecords.length + ' times</span>';
                                aHtml += renderAttendanceRecordList(teacher.teacher, attendance.lateRecords, '⚠️');
                            } else { aHtml += '<span style="color: #10b981;">0 times</span>'; }
                            aHtml += '</span></div>';
                            aHtml += '<div style="min-height: 40px; display: flex; align-items: flex-start; padding: 4px 0;"><strong style="white-space: nowrap;">Absent:</strong><span style="margin-left: 10px;">';
                            if (hasAbsent) {
                                aHtml += '<span style="color: #ef4444; font-weight: 600;">' + attendance.absentRecords.length + ' times</span>';
                                aHtml += renderAttendanceRecordList(teacher.teacher, attendance.absentRecords, '🚫');
                            } else { aHtml += '<span style="color: #10b981;">0 times</span>'; }
                            aHtml += '</span></div>';
                            aHtml += '<div style="min-height: 40px; display: flex; align-items: flex-start; padding: 4px 0;"><strong style="white-space: nowrap;">Not Check in:</strong><span style="margin-left: 10px;">';
                            if (hasUnsigned) {
                                aHtml += '<span style="color: #f97316; font-weight: 600;">' + attendance.unsignedRecords.length + ' times</span>';
                                aHtml += renderAttendanceRecordList(teacher.teacher, attendance.unsignedRecords, '📝');
                            } else { aHtml += '<span style="color: #10b981;">0 times</span>'; }
                            aHtml += '</span></div></div>';
                            return aHtml;
                        })()}

                        <div style="margin-top: 10px;">
                            <div style="margin-bottom: 8px; font-size: 13px; color: #6b7280;">
                                <strong>📝 Manual Trial Class Adjustment (Optional):</strong>
                                <span style="margin-left: 8px; font-size: 12px;">💡 Inputs are auto-filled from the auto classification result. Edit if needed, then click Confirm.</span>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Number of Successful Trial Class:</strong>
                                <input type="number" id="successful_trial_${teacher.teacher}"
                                       value="${successfulTrials}"
                                       min="0"
                                       placeholder="${teacher.autoTrialData?.successful || 0}"
                                       style="width: 60px; margin-left: 10px; padding: 4px; font-size: 13px; border: 1px solid #ccc;">
                                <button onclick="updateTrialData('${teacher.teacher}')" style="margin-left: 5px; padding: 8px 16px; font-size: 12px; font-weight: 500; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 6px; cursor: pointer; transition: all 0.3s ease;">Confirm</button>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Number of Failed Trial Class:</strong>
                                <input type="number" id="failed_trial_${teacher.teacher}"
                                       value="${failedTrials}"
                                       min="0"
                                       placeholder="${teacher.autoTrialData?.failed || 0}"
                                       style="width: 60px; margin-left: 10px; padding: 4px; font-size: 13px; border: 1px solid #ccc;">
                                <button onclick="updateTrialData('${teacher.teacher}')" style="margin-left: 5px; padding: 8px 16px; font-size: 12px; font-weight: 500; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 6px; cursor: pointer; transition: all 0.3s ease;">Confirm</button>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <div><strong>Rewards and Punishments:</strong></div>
                                <div id="rewards_list_${teacher.teacher}" style="margin-left: 20px; margin-top: 5px; border: 1px solid #e0e0e0; padding: 8px; border-radius: 4px; background: #fafafa; max-height: 120px; overflow-y: auto;">
                                    <div style="color: #666; font-size: 13px; text-align: center;">No reward/punishment records</div>
                                </div>
                                <div style="margin-left: 20px; margin-top: 8px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                                    <select id="reward_type_${teacher.teacher}" style="padding: 4px; font-size: 13px;">
                                        <option value="percentage">Percentage</option>
                                        <option value="absolute">Absolute</option>
                                    </select>
                                    <input type="number" id="reward_value_${teacher.teacher}" placeholder="Value" step="0.01" style="width: 70px; padding: 4px; font-size: 13px;">
                                    <input type="text" id="reward_note_${teacher.teacher}" placeholder="Note" style="width: 120px; padding: 4px; font-size: 13px;">
                                    <button onclick="addRewardPunishment('${teacher.teacher}')" style="padding: 4px 8px; font-size: 13px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">Add</button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee; font-size: 12px;">
                            <strong>Class Details:</strong>
                            <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
                                <thead>
                                    <tr style="background: #f8f9fa;">
                                        <th style="border: 1px solid #ddd; padding: 6px; text-align: left; width: 120px; font-size: 14px;">Date</th>
                                        <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 14px;">Class Count</th>
                                        <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 14px;">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
            `;

            // 按日期显示明细
            const dateGroups = {};
            Object.keys(teacher.courseTypes).forEach(courseType => {
                const courseData = teacher.courseTypes[courseType];
                const details = courseData.details;
                const coursePattern = /([^;()]+)\s*\((\d{2}-\d{2})\s+(\d{2}:\d{2}-\d{2}:\d{2})\)/g;
                let match;

                while ((match = coursePattern.exec(details)) !== null) {
                    const studentName = match[1].trim();
                    const date = match[2];
                    const time = match[3];

                    if (!dateGroups[date]) {
                        dateGroups[date] = { classes: 0, details: [] };
                    }

                    // 根据 course_type 或实际上课时长判断课时数
                    let classCount = 1;
                    if (courseType.includes('50分钟')) {
                        classCount = 2;
                    } else {
                        const [startTime, endTime] = time.split('-');
                        const [startH, startM] = startTime.split(':').map(Number);
                        const [endH, endM] = endTime.split(':').map(Number);
                        const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                        if (durationMinutes >= 40) {
                            classCount = 2;
                        }
                    }
                    dateGroups[date].classes += classCount;
                    const typeLabel = courseType === '试课' ? ', Trial' : '';
                    dateGroups[date].details.push(`${studentName} (${time}${typeLabel})`);
                }
            });

            Object.keys(dateGroups).sort().forEach(date => {
                const dateData = dateGroups[date];
                const detailsText = dateData.details.join('; ');
                html += `
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 6px; vertical-align: top; font-size: 14px;"><strong>${date}</strong></td>
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: top; font-size: 14px;">${dateData.classes}</td>
                        <td style="border: 1px solid #ddd; padding: 8px; vertical-align: top; font-size: 14px; line-height: 1.4;">${detailsText}</td>
                    </tr>
                `;
            });

            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
    } else {
        // 简易格式
        html += '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; user-select: text;">';
        html += `
            <div style="padding: 15px; border-bottom: 1px solid #eee; background: #f8f9fa;">
                <strong style="color: #333;">📋 Simple Salary List</strong>
            </div>
            <div style="padding: 15px; font-family: monospace; font-size: 14px; line-height: 2;">
        `;

        teachers.forEach(teacher => {
            const salaryAccount = teacher.salaryAccount || 'No account set';
            const salaryUnit = teacher.salaryUnit || 'rmb';
            const trialCommission = getTeacherTrialCommission(teacher.teacher, teacher);
            const normalSalary = (teacher.normalClasses || 0) * teacher.finalRate;
            const rewards = getEffectiveRewardsForTeacher(teacher, normalSalary, trialCommission);
            const rewardsAmount = calculateRewardsAmount(rewards, normalSalary + trialCommission);
            const attendanceComp = getAttendanceCompensation(teacher, normalSalary, trialCommission);
            const finalTotal = normalSalary + trialCommission + rewardsAmount + attendanceComp.totalAdjustment;
            html += `<div>${teacher.teacher}:${salaryAccount}:${formatCurrency(finalTotal, salaryUnit)}(${salaryUnit})</div>`;
        });

        html += `
            </div>
        </div>
        `;
    }

    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';

    if (format === 'detailed') {
        teachers.forEach(teacher => updateRewardsDisplay(teacher.teacher));
    }
}

// 更新试课数据
function updateTrialData(teacherName) {
    const successfulInput = document.getElementById(`successful_trial_${teacherName}`);
    const failedInput = document.getElementById(`failed_trial_${teacherName}`);

    if (!successfulInput || !failedInput) {
        console.error('试课输入框未找到');
        return;
    }

    const successful = parseInt(successfulInput.value) || 0;
    const failed = parseInt(failedInput.value) || 0;

    window.currentTrialData[teacherName] = {
        successful: successful,
        failed: failed
    };

    console.log(`更新 ${teacherName} 的试课数据: 成功${successful}节, 失败${failed}节`);

    updateTeacherSalaryDisplay(teacherName);

    const teacherType = getTeacherType(teacherName);
    updateSalarySummary(teacherType);

    const buttons = document.querySelectorAll(`[onclick*="updateTrialData('${teacherName}')"]`);
    buttons.forEach(button => {
        const originalText = button.textContent;
        button.textContent = '✓ Updated';
        button.style.background = '#059669';
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 1500);
    });
}

function updateTrialDetailStatus(teacherName, trialKey, nextResult) {
    const originalData = window.lastSalaryData;
    if (!originalData) return;

    const teacher = originalData.teachers.find(t => t.teacher === teacherName);
    if (!teacher) return;

    const { details: currentDetails } = getTeacherTrialCounts(teacherName, teacher);
    if (!Array.isArray(currentDetails) || currentDetails.length === 0) return;

    const normalizedResult = normalizeTrialResult(nextResult);
    const nextDetails = currentDetails.map(detail => {
        if (detail.__trialKey !== trialKey) {
            return { ...detail };
        }
        return {
            ...detail,
            result: normalizedResult
        };
    });

    window.currentTrialData[teacherName] = {
        details: nextDetails,
        successful: nextDetails.filter(detail => detail.result === 'success').length,
        failed: nextDetails.filter(detail => detail.result !== 'success').length
    };

    if (window.lastSalaryData) {
        displaySalaryResults(window.lastSalaryData, window.currentSalaryFormat || 'detailed');
    }

    console.log(`更新 ${teacherName} 的试课状态: ${trialKey} -> ${normalizedResult}`);
}

// 实时更新老师工资显示
function updateTeacherSalaryDisplay(teacherName) {
    const originalData = window.lastSalaryData;
    if (!originalData) return;

    const teacher = originalData.teachers.find(t => t.teacher === teacherName);
    if (!teacher) return;

    const normalSalary = (teacher.normalClasses || 0) * teacher.finalRate;
    const { successfulTrials, failedTrials, source } = getTeacherTrialCounts(teacherName, teacher);
    const trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);

    const rewards = getEffectiveRewardsForTeacher(teacher, normalSalary, trialCommission);
    const rewardsAmount = calculateRewardsAmount(rewards, normalSalary + trialCommission);

    const attendanceComp = getAttendanceCompensation(teacher, normalSalary, trialCommission);
    const finalTotalSalary = normalSalary + trialCommission + rewardsAmount + attendanceComp.totalAdjustment;

    const teacherContainer = document.querySelector(`[data-teacher="${teacherName}"]`);
    if (teacherContainer) {
        const totalSalaryElement = teacherContainer.querySelector('.total-salary');
        if (totalSalaryElement) {
            totalSalaryElement.textContent = `${formatCurrency(finalTotalSalary, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}`;
            triggerSalaryHighlight(totalSalaryElement);
        }

        const normalSalaryElement = teacherContainer.querySelector('.normal-salary');
        if (normalSalaryElement) {
            normalSalaryElement.textContent = `${formatCurrency(normalSalary, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}`;
        }

        const trialCommissionElement = teacherContainer.querySelector('.trial-commission');
        if (trialCommissionElement) {
            trialCommissionElement.textContent = `${formatCurrency(trialCommission, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}`;
            triggerSalaryHighlight(trialCommissionElement);
        }

        updateTrialSourceBadge(teacherContainer, source);
    }

    updateRewardsDisplay(teacherName);

    console.log(`✅ ${teacherName} 工资显示已更新: 普通课${normalSalary.toFixed(2)}, 试课${trialCommission.toFixed(2)}, 奖惩${rewardsAmount.toFixed(2)}, 总计${finalTotalSalary.toFixed(2)} (来源: ${source})`);
}

// 更新试课数据来源标记
function updateTrialSourceBadge(container, source) {
    const totalSalaryDiv = container.querySelector('.total-salary')?.closest('div');
    if (!totalSalaryDiv) return;

    const oldBadges = totalSalaryDiv.querySelectorAll('.trial-source-badge');
    oldBadges.forEach(badge => badge.remove());

    let badgeHTML = '';
    if (source === 'auto') {
        badgeHTML = '<span class="trial-source-badge" style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #10b981;">🤖 Auto-filled</span>';
    } else if (source === 'manual') {
        badgeHTML = '<span class="trial-source-badge" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #f59e0b;">📝 Manual</span>';
    }

    if (badgeHTML) {
        totalSalaryDiv.insertAdjacentHTML('beforeend', badgeHTML);
    }
}

// 触发工资高亮动效
function triggerSalaryHighlight(element) {
    if (!element) return;
    element.classList.remove('salary-highlight');
    void element.offsetWidth;
    element.classList.add('salary-highlight');
    setTimeout(() => {
        element.classList.remove('salary-highlight');
    }, 800);
}

// 获取老师类型
function getTeacherType(teacherName) {
    const originalData = window.lastSalaryData;
    if (!originalData) return null;

    const teacher = originalData.teachers.find(t => t.teacher === teacherName);
    if (!teacher) return null;

    return teacher.salaryUnit === 'pesos' ? 'filipino' : 'european';
}

// 实时更新工资汇总显示
function updateSalarySummary(triggerTeacherType = null) {
    const originalData = window.lastSalaryData;
    if (!originalData) return;

    const filipinoSummary = { baseSalary: 0, trialCommission: 0, rewardsAmount: 0, totalSalary: 0 };
    const europeanSummary = { baseSalary: 0, trialCommission: 0, rewardsAmount: 0, totalSalary: 0 };

    originalData.teachers.forEach(teacher => {
        const trialCommission = getTeacherTrialCommission(teacher.teacher, teacher);

        const baseSalary = (teacher.normalClasses || 0) * teacher.finalRate;
        const rewards = getEffectiveRewardsForTeacher(teacher, baseSalary, trialCommission);
        const rewardsAmount = calculateRewardsAmount(rewards, baseSalary + trialCommission);

        const attendanceComp = getAttendanceCompensation(teacher, baseSalary, trialCommission);
        const finalTotalSalary = baseSalary + trialCommission + rewardsAmount + attendanceComp.totalAdjustment;

        if (teacher.salaryUnit === 'pesos') {
            filipinoSummary.baseSalary += baseSalary;
            filipinoSummary.trialCommission += trialCommission;
            filipinoSummary.rewardsAmount += rewardsAmount;
            filipinoSummary.totalSalary += finalTotalSalary;
        } else if (teacher.salaryUnit === 'dollars') {
            europeanSummary.baseSalary += baseSalary;
            europeanSummary.trialCommission += trialCommission;
            europeanSummary.rewardsAmount += rewardsAmount;
            europeanSummary.totalSalary += finalTotalSalary;
        }
    });

    const filipinoTotalElem = document.querySelector('.filipino-total');
    const filipinoTotalRmbElem = document.querySelector('.filipino-total-rmb');
    const europeanTotalElem = document.querySelector('.european-total');
    const europeanTotalRmbElem = document.querySelector('.european-total-rmb');

    if (filipinoTotalElem) {
        filipinoTotalElem.textContent = formatCurrency(filipinoSummary.totalSalary, 'pesos');
        if (triggerTeacherType === 'filipino' || triggerTeacherType === null) {
            triggerSalaryHighlight(filipinoTotalElem);
        }
    }
    if (filipinoTotalRmbElem) {
        const pesosToRmb = exchangeRates.cny_to_pesos || (exchangeRates.pesos_exchange ? (1/exchangeRates.pesos_exchange) : 7.65);
        filipinoTotalRmbElem.textContent = `¥${formatCurrency(filipinoSummary.totalSalary / pesosToRmb, 'rmb')}`;
    }

    if (europeanTotalElem) {
        europeanTotalElem.textContent = formatCurrency(europeanSummary.totalSalary, 'dollars');
        if (triggerTeacherType === 'european' || triggerTeacherType === null) {
            triggerSalaryHighlight(europeanTotalElem);
        }
    }
    if (europeanTotalRmbElem) {
        europeanTotalRmbElem.textContent = `¥${formatCurrency(europeanSummary.totalSalary * exchangeRates.dollars_exchange, 'rmb')}`;
    }
}

// 添加奖惩记录
function addRewardPunishment(teacherName) {
    const type = document.getElementById(`reward_type_${teacherName}`).value;
    const value = document.getElementById(`reward_value_${teacherName}`).value;
    let note = document.getElementById(`reward_note_${teacherName}`).value;

    if (!value || value === '0') {
        alert('请输入有效的数值');
        return;
    }

    if (type === 'percentage' && !note.trim()) {
        note = 'Bonus';
    } else if (!note.trim()) {
        alert('请输入备注说明');
        return;
    }

    if (!window.teacherRewards[teacherName]) {
        window.teacherRewards[teacherName] = [];
    }

    const reward = {
        type: type,
        value: parseFloat(value),
        note: note.trim(),
        id: Date.now()
    };

    window.teacherRewards[teacherName].push(reward);
    updateRewardsDisplay(teacherName);

    document.getElementById(`reward_value_${teacherName}`).value = '';
    document.getElementById(`reward_note_${teacherName}`).value = '';

    updateTeacherSalaryDisplay(teacherName);
    const teacherType = getTeacherType(teacherName);
    updateSalarySummary(teacherType);

    console.log(`为 ${teacherName} 添加奖惩记录:`, reward);
}

// 更新奖惩记录显示
function updateRewardsDisplay(teacherName) {
    const listElement = document.getElementById(`rewards_list_${teacherName}`);
    if (!listElement) return;

    const originalData = window.lastSalaryData;
    const teacher = originalData?.teachers?.find(t => t.teacher === teacherName);
    const normalSalary = teacher ? (teacher.normalClasses || 0) * teacher.finalRate : 0;
    const trialCommission = teacher ? getTeacherTrialCommission(teacherName, teacher) : 0;
    const rewards = teacher ? getEffectiveRewardsForTeacher(teacher, normalSalary, trialCommission) : (window.teacherRewards[teacherName] || []);

    if (rewards.length === 0) {
        listElement.innerHTML = '<div style="color: #666; font-size: 13px; text-align: center;">No reward/punishment records</div>';
        return;
    }

    let html = '';
    rewards.forEach((reward) => {
        const typeText = reward.type === 'percentage' ? 'Percentage' : 'Absolute';
        const valueText = reward.type === 'percentage' ? `${reward.value}%` : reward.value;
        const autoBadge = reward.autoGenerated ? ' <span style="color: #10b981; font-size: 11px;">(Auto)</span>' : '';
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid #e0e0e0;">
                <span style="font-size: 13px; flex: 1;">
                    <strong>${typeText}: ${valueText}</strong> - ${reward.note}${autoBadge}
                </span>
                <button onclick="removeRewardPunishment('${teacherName}', '${reward.id}')" style="padding: 3px 6px; font-size: 12px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">Remove</button>
            </div>
        `;
    });

    listElement.innerHTML = html;
}

// 删除奖惩记录
function removeRewardPunishment(teacherName, rewardId) {
    // 如果是自动生成的记录，加入 dismissed 列表
    if (rewardId.startsWith('__auto_')) {
        if (!window.dismissedAutoRewards) window.dismissedAutoRewards = {};
        if (!window.dismissedAutoRewards[teacherName]) window.dismissedAutoRewards[teacherName] = [];
        if (!window.dismissedAutoRewards[teacherName].includes(rewardId)) {
            window.dismissedAutoRewards[teacherName].push(rewardId);
        }
    } else {
        if (!window.teacherRewards[teacherName]) return;
        window.teacherRewards[teacherName] = window.teacherRewards[teacherName].filter(
            reward => reward.id !== rewardId
        );
    }

    updateRewardsDisplay(teacherName);
    updateTeacherSalaryDisplay(teacherName);
    const teacherType = getTeacherType(teacherName);
    updateSalarySummary(teacherType);
    console.log(`删除 ${teacherName} 的奖惩记录: ${rewardId}`);
}

function removeAttendanceRecord(teacherName, attendanceKey) {
    if (!teacherName || !attendanceKey) return;

    const deletedRecords = getDeletedAttendanceRecordMap(teacherName);
    deletedRecords[attendanceKey] = true;

    if (window.lastSalaryData) {
        displaySalaryResults(window.lastSalaryData, window.currentSalaryFormat || 'detailed');
    }

    console.log(`从当前工资计算中移除 ${teacherName} 的出勤记录: ${attendanceKey}`);
}

// 显示简易格式
function showSimpleFormat() {
    const currentData = window.lastSalaryData;
    if (currentData) {
        displaySalaryResults(currentData, 'simple');
    }
}

// 显示详细格式
function showDetailedFormat() {
    const currentData = window.lastSalaryData;
    if (currentData) {
        displaySalaryResults(currentData, 'detailed');
    }
}

// 复制老师工资详情到剪贴板
function copyTeacherSalaryDetails(teacherName, event) {
    const originalData = window.lastSalaryData;
    if (!originalData) return;

    const teacher = originalData.teachers.find(t => t.teacher === teacherName);
    if (!teacher) return;

    const { successfulTrials, failedTrials } = getTeacherTrialCounts(teacherName, teacher);
    const trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);
    const normalSalary = (teacher.normalClasses || 0) * teacher.finalRate;

    const rewards = getEffectiveRewardsForTeacher(teacher, normalSalary, trialCommission);
    const rewardsAmount = calculateRewardsAmount(rewards, normalSalary + trialCommission);

    const attendanceComp = getAttendanceCompensation(teacher, normalSalary, trialCommission);
    const finalTotalSalary = normalSalary + trialCommission + rewardsAmount + attendanceComp.totalAdjustment;

    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    const formatDateShort = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${month}.${day}`;
    };

    const dateRange = (startDate && endDate) ? `(${formatDateShort(startDate)}-${formatDateShort(endDate)})` : '';

    let content = `${teacherName} Salary Details ${dateRange}:\n`;
    content += `--------\n`;
    content += `Total Salary: ${formatCurrency(finalTotalSalary, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}\n`;
    content += `Per-session Salary: ${formatCurrency(teacher.finalRate, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}\n`;
    content += `Regular Class Salary: ${formatCurrency(normalSalary, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}\n`;
    content += `Trial commission: ${formatCurrency(trialCommission, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}\n`;
    content += `Number of Sucessful Trial Class: ${successfulTrials}\n`;
    content += `Number of Failed Trial Class: ${failedTrials}\n`;
    content += `Rewards and Punishments: `;

    if (rewards.length === 0) {
        content += `0\n`;
    } else {
        content += `\n`;
        rewards.forEach((reward, index) => {
            const typeText = reward.type === 'percentage' ? 'percent' : '';
            const valueText = reward.type === 'percentage' ? `${reward.value}%` : reward.value;
            content += `${index + 1}) ${valueText} ${typeText}: ${reward.note}\n`;
        });
    }

    const attendance = getEffectiveAttendanceInfo(teacherName, teacher);
    content += `Late: ${attendance.lateRecords.length} times\n`;
    if (attendance.lateRecords.length > 0) {
        attendance.lateRecords.forEach(r => {
            content += `  - ${r.classTime} (${r.studentName}): ${formatAttendanceReason(r)}\n`;
        });
    }
    content += `Absent: ${attendance.absentRecords.length} times\n`;
    if (attendance.absentRecords.length > 0) {
        attendance.absentRecords.forEach(r => {
            content += `  - ${r.classTime} (${r.studentName}): ${formatAttendanceReason(r)}\n`;
        });
    }
    content += `Not Check in: ${attendance.unsignedRecords.length} times\n`;
    if (attendance.unsignedRecords.length > 0) {
        attendance.unsignedRecords.forEach(r => {
            content += `  - ${r.classTime} (${r.studentName}): ${formatAttendanceReason(r)}\n`;
        });
    }

    navigator.clipboard.writeText(content).then(() => {
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '✅ Copied';
        button.style.background = '#28a745';
        showToast('Copied to clipboard', 'success');

        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#10b981';
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}

// 复制工资汇总信息到剪贴板
function copySalarySummary() {
    const originalData = window.lastSalaryData;
    if (!originalData) return;

    const { period, teachers } = originalData;
    let content = `Salary Summary (${period.startDate}-${period.endDate}):\n\n`;

    const europeanTeachers = [];
    const filipinoTeachers = [];

    teachers.forEach(teacher => {
        const trialCommission = getTeacherTrialCommission(teacher.teacher, teacher);

        const baseSalary = (teacher.normalClasses || 0) * teacher.finalRate;
        const rewards = getEffectiveRewardsForTeacher(teacher, baseSalary, trialCommission);
        const rewardsAmount = calculateRewardsAmount(rewards, baseSalary + trialCommission);

        const attendanceComp = getAttendanceCompensation(teacher, baseSalary, trialCommission);
        const finalTotalSalary = baseSalary + trialCommission + rewardsAmount + attendanceComp.totalAdjustment;
        const paymentMethod = teacher.salaryAccount || teacher.wechatNumber || teacher.alipayAccount || teacher.bankAccount || 'Not set';

        const teacherInfo = {
            name: teacher.teacher,
            paymentMethod: paymentMethod,
            totalSalary: finalTotalSalary,
            salaryUnit: teacher.salaryUnit
        };

        if (teacher.salaryUnit === 'pesos') {
            filipinoTeachers.push(teacherInfo);
        } else if (teacher.salaryUnit === 'dollars') {
            europeanTeachers.push(teacherInfo);
        }
    });

    if (europeanTeachers.length > 0) {
        content += 'European Teachers:\n';
        europeanTeachers.forEach(teacher => {
            content += `  ${teacher.name} - ${teacher.paymentMethod}: ${formatCurrency(teacher.totalSalary, 'dollars')} dollars\n`;
        });
        const europeanTotal = europeanTeachers.reduce((sum, teacher) => sum + teacher.totalSalary, 0);
        content += `  Total: ${formatCurrency(europeanTotal, 'dollars')} dollars, ¥${formatCurrency(europeanTotal * exchangeRates.dollars_exchange, 'rmb')}\n`;

        if (filipinoTeachers.length > 0) {
            content += '\n  ----\n\n';
        }
    }

    if (filipinoTeachers.length > 0) {
        content += 'Filipino Teachers:\n';
        filipinoTeachers.forEach(teacher => {
            content += `  ${teacher.name} - ${teacher.paymentMethod}: ${formatCurrency(teacher.totalSalary, 'pesos')} pesos\n`;
        });
        const filipinoTotal = filipinoTeachers.reduce((sum, teacher) => sum + teacher.totalSalary, 0);
        const pesosToRmbRate = exchangeRates.cny_to_pesos || (exchangeRates.pesos_exchange ? (1/exchangeRates.pesos_exchange) : 7.65);
        content += `\n  Total: ${formatCurrency(filipinoTotal, 'pesos')} pesos, ¥${formatCurrency(filipinoTotal / pesosToRmbRate, 'rmb')}\n`;
    }

    navigator.clipboard.writeText(content).then(() => {
        const button = document.querySelector('button[onclick="copySalarySummary()"]');
        if (button) {
            const originalText = button.textContent;
            button.textContent = '✅ Copied';
            button.style.background = '#28a745';
            showToast('Copied to clipboard', 'success');
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#6366f1';
            }, 2000);
        }
    }).catch(err => {
        console.error('Copy failed:', err);
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}
