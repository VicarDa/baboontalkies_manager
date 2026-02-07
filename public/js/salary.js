/**
 * 工资计算页面 JavaScript
 */

// 全局变量
window.lastSalaryData = null;
window.teacherRewards = window.teacherRewards || {};
window.currentTrialData = {};

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

    const resultsDiv = document.getElementById('salaryResults');
    const { period, summary, teachers } = data;

    // 计算菲教和欧教分开的汇总
    const filipinoSummary = { baseSalary: 0, trialCommission: 0, rewardsAmount: 0, totalSalary: 0, teacherCount: 0, totalClasses: 0 };
    const europeanSummary = { baseSalary: 0, trialCommission: 0, rewardsAmount: 0, totalSalary: 0, teacherCount: 0, totalClasses: 0 };

    data.teachers.forEach(teacher => {
        // 获取当前试课数据
        const successfulTrials = parseInt(document.getElementById(`successful_trial_${teacher.teacher}`)?.value || 0);
        const failedTrials = parseInt(document.getElementById(`failed_trial_${teacher.teacher}`)?.value || 0);
        const trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);

        // 获取奖惩数据
        const rewards = window.teacherRewards[teacher.teacher] || [];
        let rewardsAmount = 0;
        const baseSalary = teacher.totalSalary;

        for (const reward of rewards) {
            if (reward.type === 'percentage') {
                rewardsAmount += (baseSalary + trialCommission) * (reward.value / 100);
            } else if (reward.type === 'absolute') {
                rewardsAmount += reward.value;
            }
        }

        const finalTotalSalary = baseSalary + trialCommission + rewardsAmount;

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
            <h4 style="margin: 0 0 15px 0; color: #333;">📊 工资统计汇总</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.9em;">
                <div><strong>统计期间:</strong> ${period.startDate} ~ ${period.endDate}</div>
                <div><strong>授课老师:</strong> ${summary.totalTeachers} 人</div>
                <div><strong>总课时数:</strong> ${summary.totalClasses} 节</div>
                <div style="grid-column: span 2;"><hr style="margin: 10px 0; border: none; border-top: 1px solid #ddd;"></div>

                <!-- 欧教汇总 -->
                <div style="grid-column: span 2;"><strong>🇪🇺 欧教汇总：</strong></div>
                <div style="grid-column: span 2;"><strong>总计:</strong> <span class="european-total" style="color: #e74c3c; font-weight: bold;">${formatCurrency(europeanSummary.totalSalary, 'dollars')}</span> dollars，<span class="european-total-rmb" style="color: #666;">¥${formatCurrency(europeanSummary.totalSalary * exchangeRates.dollars_exchange, 'rmb')}</span></div>

                <div style="grid-column: span 2; margin-top: 10px;"><hr style="margin: 5px 0; border: none; border-top: 1px solid #ddd;"></div>

                <!-- 菲教汇总 -->
                <div style="grid-column: span 2;"><strong>🇵🇭 菲教汇总：</strong></div>
                <div style="grid-column: span 2;"><strong>总计:</strong> <span class="filipino-total" style="color: #e74c3c; font-weight: bold;">${formatCurrency(filipinoSummary.totalSalary, 'pesos')}</span> pesos，<span class="filipino-total-rmb" style="color: #666;">¥${formatCurrency(filipinoSummary.totalSalary / (exchangeRates.cny_to_pesos || (1/exchangeRates.pesos_exchange) || 7.65), 'rmb')}</span></div>
                <div style="grid-column: span 2; text-align: center; margin-top: 15px;">
                    <button onclick="copySalarySummary()" style="background: #6366f1; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        📋 复制工资汇总
                    </button>
                </div>
            </div>
        </div>
    `;

    if (format === 'detailed') {
        html += '<div>';

        teachers.forEach(teacher => {
            html += `
                <div data-teacher="${teacher.teacher}" style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px; overflow: hidden; user-select: text;">
                    <div style="background: white; color: #6366f1; padding: 12px; border-bottom: 1px solid #e0e0e0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>👨‍🏫 ${teacher.teacher}</strong>
                                ${teacher.hasAdjustment ? `<span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 10px; font-size: 0.8em; margin-left: 8px; border: 1px solid #ffeaa7;">已调整</span>` : ''}
                            </div>
                            <button onclick="copyTeacherSalaryDetails('${teacher.teacher}', event)" style="padding: 6px 12px; font-size: 12px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="复制工资详情">
                                📋 复制
                            </button>
                        </div>
                    </div>
                    <div style="padding: 15px; font-family: monospace; font-size: 14px; line-height: 2.2; user-select: text;">
                        <div style="min-height: 50px; display: flex; align-items: center;">
                            <strong>Total Salary:</strong>
                            <span class="total-salary" style="margin-left: 10px;">${formatCurrency(teacher.finalTotalSalary || (teacher.totalSalary + (teacher.trialCommission || 0)), teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span>
                            ${teacher.trialSource === 'auto' ? '<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #10b981;">🤖 自动填充</span>' : ''}
                            ${teacher.trialSource === 'manual' ? '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #f59e0b;">📝 手动输入</span>' : ''}
                        </div>
                        <div style="min-height: 50px; display: flex; align-items: center;"><strong>Per-session Salary:</strong> <span style="margin-left: 10px;">${formatCurrency(teacher.finalRate, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span></div>

                        <div style="border-top: 1px dashed #e5e7eb; margin: 10px 0; padding-top: 10px;">
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Regular Class Salary:</strong>
                                <span class="normal-salary" style="margin-left: 10px;">${formatCurrency(teacher.normalSalary || 0, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span>
                                <span style="color: #6b7280; font-size: 0.9em; margin-left: 8px;">(${teacher.normalClasses || 0} classes × ${formatCurrency(teacher.finalRate, teacher.salaryUnit)})</span>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Trial Class Commission:</strong>
                                <span class="trial-commission" style="margin-left: 10px;">${formatCurrency(teacher.trialCommission || 0, teacher.salaryUnit)} ${teacher.salaryUnit || 'rmb'}</span>
                            </div>
                        </div>

                        ${teacher.autoTrialData && teacher.trialClasses > 0 ? `
                        <div style="background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 6px; padding: 12px; margin: 10px 0;">
                            <div style="margin-bottom: 8px;"><strong style="color: #059669;">🤖 智能判定结果:</strong></div>
                            ${teacher.autoTrialData.details && teacher.autoTrialData.details.length > 0 ? `
                            <ul style="margin: 8px 0 0 20px; padding: 0; font-size: 13px; line-height: 1.8; list-style-type: none;">
                                ${teacher.autoTrialData.details.map(d =>
                                    `<li style="margin-bottom: 6px;">${d.student} (${d.date}): ${d.result === 'success' ? '✅' : '❌'} ${d.reason}</li>`
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

                        <div style="margin-top: 10px;">
                            <div style="margin-bottom: 8px; font-size: 13px; color: #6b7280;">
                                <strong>📝 手动调整试课数量 (可选):</strong>
                                <span style="margin-left: 8px; font-size: 12px;">💡 输入框已自动填充智能判定结果，如需调整请修改后点击确定</span>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Number of Successful Trial Class:</strong>
                                <input type="number" id="successful_trial_${teacher.teacher}"
                                       value="${teacher.trialSource === 'manual' ? (teacher.successfulTrials || 0) : (teacher.autoTrialData?.successful || 0)}"
                                       min="0"
                                       placeholder="${teacher.autoTrialData?.successful || 0}"
                                       style="width: 60px; margin-left: 10px; padding: 4px; font-size: 13px; border: 1px solid #ccc;">
                                <button onclick="updateTrialData('${teacher.teacher}')" style="margin-left: 5px; padding: 8px 16px; font-size: 12px; font-weight: 500; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 6px; cursor: pointer; transition: all 0.3s ease;">确定</button>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <strong>Number of Failed Trial Class:</strong>
                                <input type="number" id="failed_trial_${teacher.teacher}"
                                       value="${teacher.trialSource === 'manual' ? (teacher.failedTrials || 0) : (teacher.autoTrialData?.failed || 0)}"
                                       min="0"
                                       placeholder="${teacher.autoTrialData?.failed || 0}"
                                       style="width: 60px; margin-left: 10px; padding: 4px; font-size: 13px; border: 1px solid #ccc;">
                                <button onclick="updateTrialData('${teacher.teacher}')" style="margin-left: 5px; padding: 8px 16px; font-size: 12px; font-weight: 500; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none; border-radius: 6px; cursor: pointer; transition: all 0.3s ease;">确定</button>
                            </div>
                            <div style="min-height: 50px; display: flex; align-items: center;">
                                <div><strong>Rewards and Punishments:</strong></div>
                                <div id="rewards_list_${teacher.teacher}" style="margin-left: 20px; margin-top: 5px; border: 1px solid #e0e0e0; padding: 8px; border-radius: 4px; background: #fafafa; max-height: 120px; overflow-y: auto;">
                                    <div style="color: #666; font-size: 13px; text-align: center;">暂无奖惩记录</div>
                                </div>
                                <div style="margin-left: 20px; margin-top: 8px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                                    <select id="reward_type_${teacher.teacher}" style="padding: 4px; font-size: 13px;">
                                        <option value="percentage">百分比</option>
                                        <option value="absolute">绝对值</option>
                                    </select>
                                    <input type="number" id="reward_value_${teacher.teacher}" placeholder="数值" step="0.01" style="width: 70px; padding: 4px; font-size: 13px;">
                                    <input type="text" id="reward_note_${teacher.teacher}" placeholder="备注说明" style="width: 120px; padding: 4px; font-size: 13px;">
                                    <button onclick="addRewardPunishment('${teacher.teacher}')" style="padding: 4px 8px; font-size: 13px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer;">添加</button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee; font-size: 12px;">
                            <strong>课程详情：</strong>
                            <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px;">
                                <thead>
                                    <tr style="background: #f8f9fa;">
                                        <th style="border: 1px solid #ddd; padding: 6px; text-align: left; width: 120px; font-size: 14px;">日期</th>
                                        <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 14px;">课时数</th>
                                        <th style="border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 14px;">课程详情</th>
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
                    const typeLabel = courseType === '试课' ? ', 试课' : '';
                    dateGroups[date].details.push(`${studentName} (${time}${typeLabel})`);
                }
            });

            Object.keys(dateGroups).sort().forEach(date => {
                const dateData = dateGroups[date];
                const detailsText = dateData.details.join('; ');
                html += `
                    <tr>
                        <td style="border: 1px solid #ddd; padding: 6px; vertical-align: top; font-size: 14px;"><strong>${date}</strong></td>
                        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: top; font-size: 14px;">${dateData.classes}节</td>
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
                <strong style="color: #333;">📋 简易工资单</strong>
            </div>
            <div style="padding: 15px; font-family: monospace; font-size: 14px; line-height: 2;">
        `;

        teachers.forEach(teacher => {
            const salaryAccount = teacher.salaryAccount || '未设置账号';
            const salaryUnit = teacher.salaryUnit || 'rmb';
            const finalTotal = teacher.finalTotalSalary || teacher.totalSalary;
            html += `<div>${teacher.teacher}:${salaryAccount}:${formatCurrency(finalTotal, salaryUnit)}(${salaryUnit})</div>`;
        });

        html += `
            </div>
        </div>
        `;
    }

    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
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
        button.textContent = '✓ 已更新';
        button.style.background = '#059669';
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 1500);
    });
}

// 实时更新老师工资显示
function updateTeacherSalaryDisplay(teacherName) {
    const originalData = window.lastSalaryData;
    if (!originalData) return;

    const teacher = originalData.teachers.find(t => t.teacher === teacherName);
    if (!teacher) return;

    const normalSalary = (teacher.normalClasses || 0) * teacher.finalRate;

    let trialCommission = 0;
    let successfulTrials = 0;
    let failedTrials = 0;
    let source = 'none';

    if (window.currentTrialData && window.currentTrialData[teacherName]) {
        const manual = window.currentTrialData[teacherName];
        successfulTrials = manual.successful || 0;
        failedTrials = manual.failed || 0;
        source = 'manual';
    } else if (teacher.autoTrialData) {
        successfulTrials = teacher.autoTrialData.successful || 0;
        failedTrials = teacher.autoTrialData.failed || 0;
        source = 'auto';
    } else if (teacher.trialClasses > 0) {
        failedTrials = teacher.trialClasses;
        source = 'default';
    }

    trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);

    const rewards = window.teacherRewards[teacherName] || [];
    let rewardsAmount = 0;

    for (const reward of rewards) {
        if (reward.type === 'percentage') {
            rewardsAmount += (normalSalary + trialCommission) * (reward.value / 100);
        } else if (reward.type === 'absolute') {
            rewardsAmount += reward.value;
        }
    }

    const finalTotalSalary = normalSalary + trialCommission + rewardsAmount;

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
        badgeHTML = '<span class="trial-source-badge" style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #10b981;">🤖 自动填充</span>';
    } else if (source === 'manual') {
        badgeHTML = '<span class="trial-source-badge" style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 0.75em; margin-left: 8px; border: 1px solid #f59e0b;">📝 手动输入</span>';
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
        const successfulTrials = parseInt(document.getElementById(`successful_trial_${teacher.teacher}`)?.value || 0);
        const failedTrials = parseInt(document.getElementById(`failed_trial_${teacher.teacher}`)?.value || 0);
        const trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);

        const rewards = window.teacherRewards[teacher.teacher] || [];
        let rewardsAmount = 0;
        const baseSalary = teacher.totalSalary;

        for (const reward of rewards) {
            if (reward.type === 'percentage') {
                rewardsAmount += (baseSalary + trialCommission) * (reward.value / 100);
            } else if (reward.type === 'absolute') {
                rewardsAmount += reward.value;
            }
        }

        const finalTotalSalary = baseSalary + trialCommission + rewardsAmount;

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
    const rewards = window.teacherRewards[teacherName] || [];

    if (rewards.length === 0) {
        listElement.innerHTML = '<div style="color: #666; font-size: 13px; text-align: center;">暂无奖惩记录</div>';
        return;
    }

    let html = '';
    rewards.forEach((reward) => {
        const typeText = reward.type === 'percentage' ? '百分比' : '绝对值';
        const valueText = reward.type === 'percentage' ? `${reward.value}%` : reward.value;
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid #e0e0e0;">
                <span style="font-size: 13px; flex: 1;">
                    <strong>${typeText}: ${valueText}</strong> - ${reward.note}
                </span>
                <button onclick="removeRewardPunishment('${teacherName}', ${reward.id})" style="padding: 3px 6px; font-size: 12px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">删除</button>
            </div>
        `;
    });

    listElement.innerHTML = html;
}

// 删除奖惩记录
function removeRewardPunishment(teacherName, rewardId) {
    if (!window.teacherRewards[teacherName]) return;

    window.teacherRewards[teacherName] = window.teacherRewards[teacherName].filter(
        reward => reward.id !== rewardId
    );

    updateRewardsDisplay(teacherName);
    updateTeacherSalaryDisplay(teacherName);
    const teacherType = getTeacherType(teacherName);
    updateSalarySummary(teacherType);
    console.log(`删除 ${teacherName} 的奖惩记录: ${rewardId}`);
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

    const successfulTrials = parseInt(document.getElementById(`successful_trial_${teacherName}`)?.value || 0);
    const failedTrials = parseInt(document.getElementById(`failed_trial_${teacherName}`)?.value || 0);
    const trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);
    const normalSalary = (teacher.normalClasses || 0) * teacher.finalRate;

    const rewards = window.teacherRewards[teacherName] || [];
    let rewardsAmount = 0;

    for (const reward of rewards) {
        if (reward.type === 'percentage') {
            rewardsAmount += (normalSalary + trialCommission) * (reward.value / 100);
        } else if (reward.type === 'absolute') {
            rewardsAmount += reward.value;
        }
    }

    const finalTotalSalary = normalSalary + trialCommission + rewardsAmount;

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
        rewards.forEach((reward, index) => {
            const typeText = reward.type === 'percentage' ? 'percent' : '';
            const valueText = reward.type === 'percentage' ? `${reward.value}%` : reward.value;
            content += `${index + 1}) ${valueText} ${typeText}: ${reward.note}\n`;
        });
    }

    navigator.clipboard.writeText(content).then(() => {
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '✅ 已复制';
        button.style.background = '#28a745';
        showToast('已复制到剪贴板', 'success');

        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#10b981';
        }, 2000);
    }).catch(err => {
        console.error('复制失败:', err);
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
    let content = `工资汇总 (${period.startDate}-${period.endDate}):\n\n`;

    const europeanTeachers = [];
    const filipinoTeachers = [];

    teachers.forEach(teacher => {
        const successfulTrials = parseInt(document.getElementById(`successful_trial_${teacher.teacher}`)?.value || 0);
        const failedTrials = parseInt(document.getElementById(`failed_trial_${teacher.teacher}`)?.value || 0);
        const trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);

        const rewards = window.teacherRewards[teacher.teacher] || [];
        let rewardsAmount = 0;
        const baseSalary = teacher.totalSalary;

        for (const reward of rewards) {
            if (reward.type === 'percentage') {
                rewardsAmount += (baseSalary + trialCommission) * (reward.value / 100);
            } else if (reward.type === 'absolute') {
                rewardsAmount += reward.value;
            }
        }

        const finalTotalSalary = baseSalary + trialCommission + rewardsAmount;
        const paymentMethod = teacher.salaryAccount || teacher.wechatNumber || teacher.alipayAccount || teacher.bankAccount || '未设置';

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
        content += '欧教：\n';
        europeanTeachers.forEach(teacher => {
            content += `  ${teacher.name} - ${teacher.paymentMethod}：${formatCurrency(teacher.totalSalary, 'dollars')} dollars\n`;
        });
        const europeanTotal = europeanTeachers.reduce((sum, teacher) => sum + teacher.totalSalary, 0);
        content += `  总：${formatCurrency(europeanTotal, 'dollars')} dollars，¥${formatCurrency(europeanTotal * exchangeRates.dollars_exchange, 'rmb')}\n`;

        if (filipinoTeachers.length > 0) {
            content += '\n  ----\n\n';
        }
    }

    if (filipinoTeachers.length > 0) {
        content += '菲教：\n';
        filipinoTeachers.forEach(teacher => {
            content += `  ${teacher.name} - ${teacher.paymentMethod}：${formatCurrency(teacher.totalSalary, 'pesos')} pesos\n`;
        });
        const filipinoTotal = filipinoTeachers.reduce((sum, teacher) => sum + teacher.totalSalary, 0);
        const pesosToRmbRate = exchangeRates.cny_to_pesos || (exchangeRates.pesos_exchange ? (1/exchangeRates.pesos_exchange) : 7.65);
        content += `\n  总：${formatCurrency(filipinoTotal, 'pesos')} pesos，¥${formatCurrency(filipinoTotal / pesosToRmbRate, 'rmb')}\n`;
    }

    navigator.clipboard.writeText(content).then(() => {
        const button = document.querySelector('button[onclick="copySalarySummary()"]');
        if (button) {
            const originalText = button.textContent;
            button.textContent = '✅ 已复制';
            button.style.background = '#28a745';
            showToast('已复制到剪贴板', 'success');
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '#6366f1';
            }, 2000);
        }
    }).catch(err => {
        console.error('复制失败:', err);
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    });
}
