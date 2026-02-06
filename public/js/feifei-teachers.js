/**
 * 教师管理页面 JavaScript
 */

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadFeifeiTeachers();
});

// ========== 教师管理 ==========

async function loadFeifeiTeachers() {
    const tbody = document.getElementById('feifeiTeacherTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">加载中...</td></tr>';

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

            tbody.innerHTML = teachers.map(teacher => `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">${teacher.teacher_name}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                        <span style="padding: 3px 10px; border-radius: 12px; font-size: 12px; ${teacher.type === '菲' ? 'background: #e3f2fd; color: #1976d2;' : 'background: #fff3e0; color: #e65100;'}">${teacher.type || '-'}</span>
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">${teacher.old30 || 0}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">${teacher.new30 || 0}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                        ${teacher.signinUrl
                            ? `<a href="${teacher.signinUrl}" target="_blank" style="color: #1976d2; text-decoration: none; font-size: 12px; word-break: break-all;">${teacher.signinUrl}</a>
                               <button onclick="copyToClipboard('${teacher.signinUrl}')" style="margin-left: 5px; padding: 2px 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; font-size: 11px;">复制</button>`
                            : '<span style="color: #999;">未关联</span>'}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                        ${teacher.uid
                            ? `<button onclick="openSigninConfigModal('${teacher.uid}', '${teacher.teacher_name}')"
                                      style="padding: 4px 10px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer;">签到配置</button>`
                            : '<span style="color: #999; font-size: 12px;">未关联</span>'}
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('加载教师列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #d32f2f;">加载失败</td></tr>';
    }
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
            document.getElementById('signinStartTime').value = result.data.signInStartTime || 120;
            document.getElementById('signinEndTime').value = result.data.signInEndTime || 0;
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
    const signInStartTime = parseInt(document.getElementById('signinStartTime').value) || 120;
    const signInEndTime = parseInt(document.getElementById('signinEndTime').value) || 0;

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
