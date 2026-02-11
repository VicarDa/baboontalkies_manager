/**
 * 签到管理页面 JavaScript
 */

let selectedSigninTeacherUid = '';

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadFeifeiTeachers();
});

// ========== 签到管理 ==========

async function loadFeifeiTeachers() {
    const tbody = document.getElementById('feifeiTeacherTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">加载中...</td></tr>';
    closeTeacherSigninDetails();

    try {
        const keyWord = document.getElementById('feifeiTeacherKeyword').value.toLowerCase();
        const hasClass = document.getElementById('feifeiTeacherHasClass').checked ? '1' : '';

        const params = new URLSearchParams();
        if (hasClass) params.append('hasClass', hasClass);

        const response = await fetch(`${BASE_PATH}/api/unified-teachers?${params}`);
        const result = await response.json();

        if (result.success) {
            let teachers = result.data;

            // 前端姓名筛选
            if (keyWord) {
                teachers = teachers.filter(t =>
                    t.teacher_name.toLowerCase().includes(keyWord)
                );
            }

            if (teachers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">暂无教师数据</td></tr>';
                return;
            }

            tbody.innerHTML = teachers.map(teacher => {
                const normalizedSigninUrl = buildSigninUrl(teacher.uid, teacher.signinUrl);
                return `
                <tr data-teacher-row="1"
                    data-uid="${teacher.uid || ''}"
                    data-name="${encodeURIComponent(teacher.teacher_name || '')}"
                    style="cursor: ${teacher.uid ? 'pointer' : 'default'};">
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">${teacher.teacher_name}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                        <span style="padding: 3px 10px; border-radius: 12px; font-size: 12px; ${teacher.type === '菲' ? 'background: #e3f2fd; color: #1976d2;' : 'background: #fff3e0; color: #e65100;'}">${teacher.type || '-'}</span>
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">${teacher.old30 || 0}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">${teacher.new30 || 0}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                        ${normalizedSigninUrl
                            ? `<a href="${normalizedSigninUrl}" target="_blank" onclick="event.stopPropagation()" style="color: #1976d2; text-decoration: none; font-size: 12px; word-break: break-all;">${normalizedSigninUrl}</a>
                               <button onclick="event.stopPropagation(); copyToClipboard('${normalizedSigninUrl}')" style="margin-left: 5px; padding: 2px 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; font-size: 11px;">复制</button>`
                            : '<span style="color: #999;">未关联</span>'}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                        ${teacher.uid
                            ? `<button onclick="event.stopPropagation(); openSigninConfigModal('${teacher.uid}', decodeURIComponent('${encodeURIComponent(teacher.teacher_name || '')}'))"
                                      style="padding: 4px 10px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer;">签到配置</button>`
                            : '<span style="color: #999; font-size: 12px;">未关联</span>'}
                    </td>
                </tr>
            `;
            }).join('');

            bindTeacherRowClicks();
        }
    } catch (error) {
        console.error('加载教师列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #d32f2f;">加载失败</td></tr>';
    }
}

function bindTeacherRowClicks() {
    const rows = document.querySelectorAll('#feifeiTeacherTableBody tr[data-teacher-row="1"]');
    rows.forEach(row => {
        row.addEventListener('click', async () => {
            const uid = row.dataset.uid;
            const name = decodeURIComponent(row.dataset.name || '');

            if (!uid) {
                showToast('该老师未关联 feifei 账号，无法查看签到明细', 'info');
                return;
            }

            selectedSigninTeacherUid = uid;
            highlightSelectedTeacherRow();
            await openTeacherSigninDetails(uid, name);
        });
    });
}

function highlightSelectedTeacherRow() {
    const rows = document.querySelectorAll('#feifeiTeacherTableBody tr[data-teacher-row="1"]');
    rows.forEach(row => {
        if (row.dataset.uid === selectedSigninTeacherUid) {
            row.style.background = '#f5f9ff';
        } else {
            row.style.background = '';
        }
    });
}

async function openTeacherSigninDetails(uid, teacherName) {
    const panel = document.getElementById('teacherSigninDetailsPanel');
    const title = document.getElementById('teacherSigninDetailsTitle');
    const tbody = document.getElementById('teacherSigninDetailsBody');

    if (!panel || !title || !tbody) return;

    panel.style.display = 'block';
    title.textContent = `${teacherName || uid} 的签到明细`;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 24px; color: #999;">加载中...</td></tr>';

    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/teachers/${uid}/signin-records?size=100`);
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '获取签到明细失败');
        }

        const rows = Array.isArray(result.data) ? result.data : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 24px; color: #999;">暂无签到记录</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(item => `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">${escapeHtml(item.studentName || '-')}</td>
                <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">${escapeHtml(item.className || '-')}</td>
                <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">${escapeHtml(formatClassTime(item.classBtime))}</td>
                <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">${escapeHtml(item.signInTime || '-')}</td>
            </tr>
        `).join('');

        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        console.error('加载签到明细失败:', error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 24px; color: #d32f2f;">加载失败</td></tr>';
    }
}

function closeTeacherSigninDetails() {
    const panel = document.getElementById('teacherSigninDetailsPanel');
    const tbody = document.getElementById('teacherSigninDetailsBody');
    if (panel) panel.style.display = 'none';
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 24px; color: #999;">请选择老师查看</td></tr>';
    }
    selectedSigninTeacherUid = '';
    highlightSelectedTeacherRow();
}

function buildSigninUrl(uid, rawUrl) {
    if (uid) {
        return `https://console.woowisland.com/teacher?teacherUid=${encodeURIComponent(uid)}#/courseDetail`;
    }

    const source = String(rawUrl || '');
    if (!source) return '';

    const queryMatch = source.match(/[?&]teacherUid=([^&#]+)/i);
    if (queryMatch && queryMatch[1]) {
        return `https://console.woowisland.com/teacher?teacherUid=${encodeURIComponent(decodeURIComponent(queryMatch[1]))}#/courseDetail`;
    }

    const pathMatch = source.match(/\/signin\/([^/?#]+)/i);
    if (pathMatch && pathMatch[1]) {
        return `https://console.woowisland.com/teacher?teacherUid=${encodeURIComponent(decodeURIComponent(pathMatch[1]))}#/courseDetail`;
    }

    return source;
}

function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('已复制到剪贴板', 'success');
}

async function openSigninConfigModal(uid, name) {
    document.getElementById('signinConfigTeacherUid').value = uid;
    document.getElementById('signinConfigTeacherName').textContent = name;

    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/teachers/${uid}/signin-config`);
        const result = await response.json();
        if (result.success && result.data) {
            document.getElementById('signinStartTime').value = result.data.signInStartTime ?? 120;
            document.getElementById('signinEndTime').value = result.data.signInEndTime ?? 0;
        }
    } catch (error) {
        console.error('加载签到配置失败:', error);
    }

    document.getElementById('feifeiSigninConfigModal').style.display = 'flex';
}

function closeSigninConfigModal() {
    document.getElementById('feifeiSigninConfigModal').style.display = 'none';
}

async function saveSigninConfig() {
    const uid = document.getElementById('signinConfigTeacherUid').value;
    const startInput = Number.parseInt(document.getElementById('signinStartTime').value, 10);
    const endInput = Number.parseInt(document.getElementById('signinEndTime').value, 10);
    const signInStartTime = Number.isFinite(startInput) ? Math.max(0, startInput) : 120;
    const signInEndTime = Number.isFinite(endInput) ? Math.max(0, endInput) : 0;

    if (signInEndTime > signInStartTime) {
        showToast('签到结束时间需小于等于签到开始时间（均为课前分钟数）', 'warning');
        return;
    }

    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/teachers/${uid}/signin-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signInStartTime, signInEndTime })
        });

        const result = await response.json();
        if (result.success) {
            closeSigninConfigModal();
            showToast('签到配置保存成功', 'success');
        } else {
            alert('保存失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存签到配置失败:', error);
        alert('保存失败');
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatClassTime(unixSeconds) {
    if (!unixSeconds) return '-';
    const ts = Number(unixSeconds);
    if (!Number.isFinite(ts) || ts <= 0) return '-';
    const date = new Date(ts * 1000);
    if (Number.isNaN(date.getTime())) return '-';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}
