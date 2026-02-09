/**
 * 课节管理页面 JavaScript
 */

// 全局变量
let classSessionCurrentPage = 1;
const classSessionPageSize = 20;
let currentSessionDetailData = null;
let recentSessionsList = [];
let currentSelectedSessionId = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    initSessionFilters();
    loadClassSessionList();
});

// 初始化日期筛选默认值（最近30天）
function initSessionFilters() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    document.getElementById('sessionFilterStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('sessionFilterEndDate').value = now.toISOString().split('T')[0];
}

// 重置筛选条件
function resetSessionFilters() {
    document.getElementById('sessionFilterTeacher').value = '';
    document.getElementById('sessionFilterStudent').value = '';
    document.getElementById('sessionFilterPresent').value = '';
    initSessionFilters();
    classSessionCurrentPage = 1;
    loadClassSessionList();
}

// 加载课节列表
async function loadClassSessionList(page = 1) {
    classSessionCurrentPage = page;
    const tbody = document.getElementById('classSessionTableBody');
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: #999;">加载中...</td></tr>';

    try {
        const teacherName = document.getElementById('sessionFilterTeacher').value.trim();
        const studentName = document.getElementById('sessionFilterStudent').value.trim();
        const isPresent = document.getElementById('sessionFilterPresent').value;
        const startDate = document.getElementById('sessionFilterStartDate').value;
        const endDate = document.getElementById('sessionFilterEndDate').value;

        let params = `page=${page}&size=${classSessionPageSize}`;

        if (teacherName) params += `&teacherName=${encodeURIComponent(teacherName)}`;
        if (studentName) params += `&studentName=${encodeURIComponent(studentName)}`;
        if (isPresent !== '') params += `&isPresent=${isPresent}`;
        if (startDate) {
            // 使用本地时区当天 00:00:00，避免 YYYY-MM-DD 被按 UTC 解析导致时间偏移
            const startTimestamp = Math.floor(new Date(`${startDate}T00:00:00`).getTime() / 1000);
            params += `&startTime=${startTimestamp}`;
        }
        if (endDate) {
            // 按用户选择的结束日期查询（包含未来课节）
            const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000);
            params += `&endTime=${endTimestamp}`;
        }

        const response = await fetch(`${BASE_PATH}/api/feifei/class-session-list?${params}`);
        const result = await response.json();

        if (result.success) {
            renderClassSessionTable(result.data.list);
            renderSessionPagination(result.data.pagination);
        } else {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: #d32f2f;">加载失败: ' + (result.error || '未知错误') + '</td></tr>';
        }
    } catch (error) {
        console.error('加载课节列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: #d32f2f;">加载失败</td></tr>';
    }
}

// 渲染课节表格
function renderClassSessionTable(list) {
    const tbody = document.getElementById('classSessionTableBody');

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: #999;">暂无数据</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(row => `
        <tr style="border-bottom: 1px solid #eee; cursor: pointer;" onclick="openSessionDetail('${row.id}', '${row.studId}')" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''">
            <td style="padding: 12px;">${row.teacherName || '-'}</td>
            <td style="padding: 12px;">${row.studentName || '-'}</td>
            <td style="padding: 12px;">${row.mobile || '-'}</td>
            <td style="padding: 12px; text-align: center;">
                ${row.isPresent == 1
                    ? '<span style="color: #34a853;">✓ 是</span>'
                    : '<span style="color: #d32f2f;">✗ 否</span>'}
            </td>
            <td style="padding: 12px;">${formatSessionTime(row.startTimestamp)}</td>
            <td style="padding: 12px;">${formatDateTimeStr(row.teacherjongTime)}</td>
            <td style="padding: 12px;">${formatDateTimeStr(row.studentEnterTime)}</td>
            <td style="padding: 12px;">${formatDateTimeStr(row.teacherLeaveTime)}</td>
            <td style="padding: 12px; text-align: center;">
                ${row.classFeedback
                    ? '<span style="color: #34a853;">有</span>'
                    : '<span style="color: #999;">无</span>'}
            </td>
            <td style="padding: 12px;">${renderRecordLinks(row.classRecord)}</td>
        </tr>
    `).join('');
}

// 格式化时间戳
function formatSessionTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 格式化日期时间字符串
function formatDateTimeStr(dateTimeStr) {
    if (!dateTimeStr) return '-';

    // 直接使用数据库返回的日期文本，避免浏览器按时区二次换算导致 +8 小时偏移
    const raw = String(dateTimeStr).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (match) {
        const [, , month, day, hour, minute] = match;
        return `${month}-${day} ${hour}:${minute}`;
    }

    // 兼容数字时间戳和其他格式
    if (typeof dateTimeStr === 'number') {
        const ms = dateTimeStr > 1e12 ? dateTimeStr : dateTimeStr * 1000;
        const date = new Date(ms);
        if (!isNaN(date.getTime())) {
            return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
    }

    const date = new Date(raw);
    if (isNaN(date.getTime())) return '-';
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 渲染录屏链接
function renderRecordLinks(classRecord) {
    if (!classRecord) return '-';

    try {
        const record = typeof classRecord === 'string' ? JSON.parse(classRecord) : classRecord;
        const fileList = record?.VodInfo?.FileList;
        if (!fileList || fileList.length === 0) return '-';

        return fileList.map((file, index) => {
            const url = file.Playset?.[0]?.Url || file.Url;
            if (!url) return '';
            return `<a href="${url}" target="_blank" style="color: #4285f4; text-decoration: none; margin-right: 8px;">录屏${index + 1}</a>`;
        }).filter(Boolean).join('') || '-';
    } catch (e) {
        return '-';
    }
}

// 渲染分页
function renderSessionPagination(pagination) {
    const container = document.getElementById('classSessionPagination');
    const { page, size, total } = pagination;
    const totalPages = Math.ceil(total / size);

    if (totalPages <= 1) {
        container.innerHTML = `<span style="color: #666;">共 ${total} 条记录</span>`;
        return;
    }

    let html = `<span style="color: #666; margin-right: 10px;">共 ${total} 条</span>`;

    // 上一页
    if (page > 1) {
        html += `<button onclick="loadClassSessionList(${page - 1})" style="padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">上一页</button>`;
    }

    // 页码
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    for (let i = startPage; i <= endPage; i++) {
        if (i === page) {
            html += `<button style="padding: 6px 12px; border: 1px solid #4285f4; background: #4285f4; color: white; border-radius: 4px; margin: 0 2px;">${i}</button>`;
        } else {
            html += `<button onclick="loadClassSessionList(${i})" style="padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer; margin: 0 2px;">${i}</button>`;
        }
    }

    // 下一页
    if (page < totalPages) {
        html += `<button onclick="loadClassSessionList(${page + 1})" style="padding: 6px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">下一页</button>`;
    }

    html += `<span style="color: #666; margin-left: 10px;">共 ${totalPages} 页</span>`;

    container.innerHTML = html;
}

// ========== 课节详情弹窗 ==========

// 打开详情弹窗
async function openSessionDetail(recordId, studId) {
    const modal = document.getElementById('classSessionDetailModal');
    modal.style.display = 'flex';

    // 重置内容
    document.getElementById('sessionDetailTitle').innerHTML = '';
    document.getElementById('recentSessionTabs').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionMaterials').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionScreenshots').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionRecords').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionFeedbackContent').innerHTML = '<span style="color: #999;">加载中...</span>';
    document.getElementById('sessionFeedbackContent2').innerHTML = '<span style="color: #999;">加载中...</span>';

    try {
        // 加载该学生近7节课
        const response = await fetch(`${BASE_PATH}/api/feifei/student-recent-sessions?studId=${studId}`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            recentSessionsList = result.data;
            currentSelectedSessionId = recordId;

            renderRecentSessionTabs();
            await loadSessionDetailContent(recordId);
        } else {
            document.getElementById('recentSessionTabs').innerHTML = '<span style="color: #999;">暂无课节数据</span>';
        }
    } catch (error) {
        console.error('加载详情失败:', error);
        document.getElementById('recentSessionTabs').innerHTML = '<span style="color: #d32f2f;">加载失败</span>';
    }
}

function closeSessionDetailModal() {
    document.getElementById('classSessionDetailModal').style.display = 'none';
}

// 渲染近7节课 Tab
function renderRecentSessionTabs() {
    const container = document.getElementById('recentSessionTabs');

    container.innerHTML = recentSessionsList.map(session => {
        const isActive = session.id == currentSelectedSessionId;
        const timeStr = formatSessionTime(session.startTimestamp);
        return `
            <button onclick="switchSessionTab('${session.id}')"
                    style="padding: 8px 16px; border: 1px solid ${isActive ? '#4285f4' : '#ddd'};
                           background: ${isActive ? '#4285f4' : 'white'};
                           color: ${isActive ? 'white' : '#333'};
                           border-radius: 6px; cursor: pointer; font-size: 13px;">
                ${timeStr}
            </button>
        `;
    }).join('');
}

// 切换课节 Tab
async function switchSessionTab(sessionId) {
    currentSelectedSessionId = sessionId;
    renderRecentSessionTabs();
    await loadSessionDetailContent(sessionId);
}

// 加载课节详情内容
async function loadSessionDetailContent(sessionId) {
    const session = recentSessionsList.find(s => s.id == sessionId);
    if (!session) return;

    currentSessionDetailData = session;

    // 更新标题：显示学生和老师
    const titleContainer = document.getElementById('sessionDetailTitle');
    const studentName = session.studentName || '未知学生';
    const teacherName = session.teacherName || '未知老师';
    titleContainer.innerHTML = `<span style="color: #333;">👨‍🎓 ${studentName}</span> <span style="color: #999; margin: 0 8px;">·</span> <span style="color: #333;">👩‍🏫 ${teacherName}</span>`;

    // 加载教材
    loadSessionMaterials(session.classId, session.courseId);

    // 渲染截图
    renderSessionScreenshots(session.blackboardImage);

    // 渲染录屏
    renderSessionRecordsDetail(session.classRecord);

    // 渲染反馈
    renderSessionFeedback(session.classFeedback);
    renderSessionFeedback2(session.classFeedback2);
}

// 加载教材
async function loadSessionMaterials(classId, courseId) {
    const container = document.getElementById('sessionMaterials');

    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/textbooks-by-class?classId=${classId}&courseId=${courseId}`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            container.innerHTML = result.data.map(tb =>
                `<span style="padding: 8px 16px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 13px;">${tb.title}</span>`
            ).join('');
        } else {
            container.innerHTML = '<span style="color: #999;">暂无教材</span>';
        }
    } catch (error) {
        console.error('加载教材失败:', error);
        container.innerHTML = '<span style="color: #999;">加载失败</span>';
    }
}

// 渲染截图
function renderSessionScreenshots(blackboardImage) {
    const container = document.getElementById('sessionScreenshots');

    if (!blackboardImage || blackboardImage.length === 0) {
        container.innerHTML = '<span style="color: #999;">暂无截图</span>';
        return;
    }

    try {
        const images = typeof blackboardImage === 'string' ? JSON.parse(blackboardImage) : blackboardImage;

        if (!Array.isArray(images) || images.length === 0) {
            container.innerHTML = '<span style="color: #999;">暂无截图</span>';
            return;
        }

        container.innerHTML = images.map((img, index) => {
            const url = img.picUrl || img.Url || img.url || img;
            if (!url || typeof url !== 'string') return '';
            return `
                <img src="${url}"
                     alt="截图${index + 1}"
                     style="width: 100px; height: 60px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #eee;"
                     onclick="openImagePreview('${url}')"
                     onerror="this.style.display='none'">
            `;
        }).filter(Boolean).join('') || '<span style="color: #999;">暂无截图</span>';
    } catch (e) {
        container.innerHTML = '<span style="color: #999;">暂无截图</span>';
    }
}

// 图片预览
function openImagePreview(url) {
    window.open(url, '_blank');
}

// 渲染录屏详情
function renderSessionRecordsDetail(classRecord) {
    const container = document.getElementById('sessionRecords');

    if (!classRecord) {
        container.innerHTML = '<span style="color: #999;">暂无录屏</span>';
        return;
    }

    try {
        const record = typeof classRecord === 'string' ? JSON.parse(classRecord) : classRecord;
        const fileList = record?.VodInfo?.FileList;

        if (!fileList || fileList.length === 0) {
            container.innerHTML = '<span style="color: #999;">暂无录屏</span>';
            return;
        }

        container.innerHTML = fileList.map((file, index) => {
            const url = file.Playset?.[0]?.Url || file.Url;
            if (!url) return '';
            return `<a href="${url}" target="_blank" style="color: #4285f4; text-decoration: none; padding: 8px 16px; border: 1px solid #4285f4; border-radius: 6px;">录屏${index + 1}</a>`;
        }).filter(Boolean).join('') || '<span style="color: #999;">暂无录屏</span>';
    } catch (e) {
        container.innerHTML = '<span style="color: #999;">暂无录屏</span>';
    }
}

// 渲染反馈
function renderSessionFeedback(classFeedback) {
    const typeContainer = document.getElementById('sessionFeedbackType');
    const contentContainer = document.getElementById('sessionFeedbackContent');

    if (!classFeedback) {
        typeContainer.innerHTML = '';
        contentContainer.innerHTML = '<span style="color: #999;">暂无反馈</span>';
        return;
    }

    try {
        const feedback = typeof classFeedback === 'string' ? JSON.parse(classFeedback) : classFeedback;
        const feedbackType = feedback.feedbackType || 'trial';

        // 渲染类型选择（只读）
        typeContainer.innerHTML = `
            <label style="margin-right: 20px; cursor: default; ${feedbackType === 'trial' ? 'color: #4285f4;' : 'color: #999;'}">
                <input type="radio" name="feedbackTypeDisplay" value="trial" ${feedbackType === 'trial' ? 'checked' : ''} disabled style="margin-right: 5px;">
                Trial Class
            </label>
            <label style="cursor: default; ${feedbackType === 'regular' ? 'color: #4285f4;' : 'color: #999;'}">
                <input type="radio" name="feedbackTypeDisplay" value="regular" ${feedbackType === 'regular' ? 'checked' : ''} disabled style="margin-right: 5px;">
                Regular Class
            </label>
        `;

        // 根据类型渲染不同内容
        if (feedbackType === 'trial') {
            contentContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Evaluation</h5>
                        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; min-height: 80px; font-size: 13px; line-height: 1.6;">
                            ${feedback.Evaluation || '暂无'}
                        </div>
                    </div>
                    <div>
                        <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Suggestion for the next action</h5>
                        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; min-height: 80px; font-size: 13px; line-height: 1.6;">
                            ${feedback.regular || '暂无'}
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Regular Class 反馈
            const doingWellHtml = feedback.doingWellList && feedback.doingWellList.length > 0
                ? `<div style="margin-bottom: 16px;">
                    <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Doing Well</h5>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8;">
                        ${feedback.doingWellList.map(item => `<li>${item.text || item}</li>`).join('')}
                    </ul>
                   </div>`
                : '';

            const needExerciseHtml = feedback.needExerciseList && feedback.needExerciseList.length > 0
                ? `<div>
                    <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Need Exercise</h5>
                    ${feedback.needExerciseList.map(item => `
                        <div style="background: #f9fafb; padding: 10px; border-radius: 6px; margin-bottom: 8px; font-size: 13px;">
                            <div><strong>You said:</strong> ${item.youSaid || '-'}</div>
                            <div><strong>Better say:</strong> ${item.betterSay || '-'}</div>
                        </div>
                    `).join('')}
                   </div>`
                : '';

            contentContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h5 style="font-size: 14px; margin-bottom: 8px; color: #333;">Key Content</h5>
                        <div style="background: #f9fafb; padding: 12px; border-radius: 6px; min-height: 80px; font-size: 13px; line-height: 1.6;">
                            ${feedback.keyContent || '暂无'}
                        </div>
                    </div>
                    <div>
                        ${doingWellHtml}
                        ${needExerciseHtml}
                        ${!doingWellHtml && !needExerciseHtml ? '<span style="color: #999;">暂无详细内容</span>' : ''}
                    </div>
                </div>
            `;
        }
    } catch (e) {
        console.error('解析反馈失败:', e);
        typeContainer.innerHTML = '';
        contentContainer.innerHTML = '<span style="color: #999;">暂无反馈</span>';
    }
}

// 更新自动反馈按钮状态
function updateAutoFeedbackButtonState(classFeedback2) {
    const button = document.getElementById('autoFeedbackGenerateBtn');
    if (!button) return;
    // 始终保持可点击状态，允许重新生成
    button.textContent = '生成反馈';
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
}

// 生成自动反馈
async function generateAutoFeedback() {
    if (!currentSessionDetailData) {
        showToast('未选择课节', 'warning');
        return;
    }

    const button = document.getElementById('autoFeedbackGenerateBtn');
    const recordId = currentSessionDetailData.id;
    const studId = currentSessionDetailData.studId;

    if (button) {
        button.disabled = true;
        button.textContent = '生成中...';
        button.style.opacity = '0.7';
    }

    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/auto-feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recordId: currentSessionDetailData.id,
                classId: currentSessionDetailData.classId,
                studId: currentSessionDetailData.studId
            })
        });
        const result = await response.json();

        if (response.ok && result.success) {
            showToast('已提交生成任务，正在等待生成...', 'success');
            // 开始轮询检查反馈是否已生成
            pollForFeedback2(recordId, studId);
        } else {
            showToast(result.message || result.data?.message || '生成失败', 'error');
            updateAutoFeedbackButtonState(currentSessionDetailData?.classFeedback2);
        }
    } catch (e) {
        showToast(`生成请求失败: ${e.message}`, 'error');
        updateAutoFeedbackButtonState(currentSessionDetailData?.classFeedback2);
    }
}

// 轮询检查 Feedback2 是否生成完成
async function pollForFeedback2(recordId, studId, attempt = 1) {
    const maxAttempts = 60; // 最多5分钟 (60次 × 5秒 = 300秒)
    const interval = 3000; // 每3秒检查一次

    if (attempt > maxAttempts) {
        showToast('生成超时，请稍后刷新查看', 'warning');
        updateAutoFeedbackButtonState(currentSessionDetailData?.classFeedback2);
        return;
    }

    const button = document.getElementById('autoFeedbackGenerateBtn');
    if (button) {
        button.textContent = `生成中...(${attempt})`;
    }

    try {
        // 优先使用状态检查 API
        const statusResponse = await fetch(`${BASE_PATH}/api/feifei/auto-feedback/status?recordId=${recordId}`);
        const statusResult = await statusResponse.json();

        if (statusResult.success && statusResult.data) {
            const { status, message, content } = statusResult.data;

            if (status === 'completed' && content) {
                // 反馈已生成
                currentSessionDetailData.classFeedback2 = content;
                renderSessionFeedback2(content);
                showToast('反馈生成完成', 'success');
                return;
            }

            if (status === 'failed') {
                showToast(`生成失败: ${message}`, 'error');
                updateAutoFeedbackButtonState(null);
                return;
            }

            if (status === 'processing') {
                // 继续轮询
                setTimeout(() => pollForFeedback2(recordId, studId, attempt + 1), interval);
                return;
            }
        }

        // 如果状态 API 没有数据，回退到查询数据库
        const response = await fetch(`${BASE_PATH}/api/feifei/student-recent-sessions?studId=${studId}`);
        const result = await response.json();

        if (result.success && result.data.length > 0) {
            const updatedSession = result.data.find(s => s.id == recordId);
            if (updatedSession && updatedSession.classFeedback2 && String(updatedSession.classFeedback2).trim() !== '') {
                // 反馈已生成，更新数据
                recentSessionsList = result.data;
                const idx = recentSessionsList.findIndex(s => s.id == recordId);
                if (idx !== -1) {
                    currentSessionDetailData = recentSessionsList[idx];
                }
                renderSessionFeedback2(updatedSession.classFeedback2);
                showToast('反馈生成完成', 'success');
                return;
            }
        }

        // 尚未生成，继续轮询
        setTimeout(() => pollForFeedback2(recordId, studId, attempt + 1), interval);
    } catch (e) {
        console.error('轮询检查失败:', e);
        setTimeout(() => pollForFeedback2(recordId, studId, attempt + 1), interval);
    }
}

// 渲染自动反馈
function renderSessionFeedback2(classFeedback2) {
    const contentContainer = document.getElementById('sessionFeedbackContent2');

    // 更新按钮状态
    updateAutoFeedbackButtonState(classFeedback2);

    if (!classFeedback2 || String(classFeedback2).trim() === '') {
        contentContainer.innerHTML = '<span style="color: #999;">暂无自动反馈，点击上方按钮生成</span>';
        return;
    }

    const content = String(classFeedback2).trim();
    contentContainer.innerHTML = `<div style="background: #f9fafb; padding: 16px; border-radius: 8px; font-size: 13px; line-height: 1.8; white-space: pre-wrap;">${content}</div>`;
}
