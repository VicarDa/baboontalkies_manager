/**
 * 系统设置页面 JavaScript
 */

// 全局变量
let teachersList = [];
let allStudents = [];

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadTeachersConfig();
    loadExcludedStudentsConfig();
    loadAutoFeedbackConfig();
});

// ========== 自动反馈配置 ==========

async function loadAutoFeedbackConfig() {
    try {
        const response = await fetch(BASE_PATH + '/api/config');
        const data = await response.json();
        const config = data.config || {};

        const promptEl = document.getElementById('autoFeedbackPrompt');
        const schemaEl = document.getElementById('autoFeedbackSchema');

        if (promptEl && config.auto_feedback_prompt) {
            promptEl.value = config.auto_feedback_prompt;
        }
        if (schemaEl && config.auto_feedback_schema) {
            schemaEl.value = typeof config.auto_feedback_schema === 'string'
                ? config.auto_feedback_schema
                : JSON.stringify(config.auto_feedback_schema, null, 2);
        }
    } catch (error) {
        console.error('加载自动反馈配置失败:', error);
    }
}

// ========== 排除学生配置 ==========

async function loadExcludedStudentsConfig() {
    const container = document.getElementById('excludedStudentsContainer');

    try {
        // 加载所有学生和当前排除配置
        const [studentsRes, configRes] = await Promise.all([
            fetch(BASE_PATH + '/api/students'),
            fetch(BASE_PATH + '/api/config')
        ]);

        const studentsData = await studentsRes.json();
        const configData = await configRes.json();

        allStudents = studentsData.students || [];
        const excludedStudents = configData.config?.excluded_students || [];

        // 按姓名排序 (students 是字符串数组)
        allStudents.sort((a, b) => (a || '').localeCompare(b || '', 'zh-CN'));

        // 渲染复选框列表
        container.innerHTML = allStudents.map(studentName => {
            const isExcluded = excludedStudents.includes(studentName);
            return `
                <label style="display: inline-flex; align-items: center; gap: 5px; margin: 5px 10px; cursor: pointer; font-size: 13px;">
                    <input type="checkbox" class="excluded-student-checkbox" value="${studentName}" ${isExcluded ? 'checked' : ''}>
                    <span>${studentName}</span>
                </label>
            `;
        }).join('');

    } catch (error) {
        console.error('加载学生列表失败:', error);
        container.innerHTML = '<div style="text-align: center; color: #e74c3c; padding: 20px;">加载失败</div>';
    }
}

// ========== 老师配置管理 ==========

async function loadTeachersConfig() {
    const tbody = document.getElementById('teachersTableBody');
    if (!tbody) return;

    try {
        const url = BASE_PATH + '/api/teachers';
        console.log('🔄 加载老师配置列表, URL:', url);

        const response = await fetch(url);
        const contentType = response.headers.get('content-type');

        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('❌ 非JSON响应:', text.substring(0, 200));
            throw new Error('服务器返回了非JSON响应，请检查API配置');
        }

        const result = await response.json();

        if (result.success) {
            teachersList = result.teachers || [];
            renderTeachersTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #e74c3c;">
                加载失败: ${result.message}
            </td></tr>`;
        }
    } catch (error) {
        console.error('加载老师配置列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #e74c3c;">
            加载失败: ${error.message}
        </td></tr>`;
    }
}

function renderTeachersTable() {
    const tbody = document.getElementById('teachersTableBody');
    if (!tbody) return;

    if (teachersList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #999;">
            暂无老师数据，点击上方按钮添加
        </td></tr>`;
        return;
    }

    tbody.innerHTML = teachersList.map(teacher => {
        const typeColor = teacher.type === '菲' ? '#2196F3' : (teacher.type === '欧' ? '#9C27B0' : '#999');
        const typeLabel = teacher.type === '菲' ? '菲教' : (teacher.type === '欧' ? '欧教' : teacher.type || '未知');
        const unitLabel = teacher.salary_unit === 'pesos' ? 'Pesos' : (teacher.salary_unit === 'dollars' ? 'Dollars' : 'RMB');
        const escapedName = (teacher.teacher_name || '').replace(/'/g, "\\'");
        const aliasesDisplay = teacher.aliases && teacher.aliases.length > 0 ? teacher.aliases.join(', ') : '-';

        return `
        <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px;">${teacher.teacher_name || '-'}</td>
            <td style="padding: 10px; color: #666; font-size: 12px;">${aliasesDisplay}</td>
            <td style="padding: 10px; text-align: center;">
                <span style="background: ${typeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                    ${typeLabel}
                </span>
            </td>
            <td style="padding: 10px; text-align: center;">${teacher.salary_per_class_time || 0}</td>
            <td style="padding: 10px; text-align: center;">${unitLabel}</td>
            <td style="padding: 10px; font-size: 12px; color: #666;">${teacher.salary_account || '-'}</td>
            <td style="padding: 10px; text-align: center; white-space: nowrap;">
                <button onclick="editTeacher('${escapedName}')" style="padding: 6px 16px; margin-right: 5px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">编辑</button>
                <button onclick="deleteTeacher('${escapedName}')" style="padding: 6px 16px; background: white; color: #666; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 12px;">删除</button>
            </td>
        </tr>
        `;
    }).join('');
}

function showAddTeacherModal() {
    showTeacherModal(null);
}

function editTeacher(name) {
    const teacher = teachersList.find(t => t.teacher_name === name);
    if (teacher) {
        showTeacherModal(teacher);
    }
}

function showTeacherModal(teacher) {
    const isEdit = !!teacher;
    const originalName = teacher?.teacher_name || '';
    const modal = document.createElement('div');
    modal.id = 'teacherModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); display: flex; align-items: center;
        justify-content: center; z-index: 10001;
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; width: 400px; max-width: 90%;">
            <h3 style="margin: 0 0 20px 0; color: #333;">${isEdit ? '编辑老师' : '添加老师'}</h3>

            <input type="hidden" id="originalTeacherName" value="${originalName}">

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">老师名字</label>
                <input type="text" id="teacherName" value="${teacher?.teacher_name || ''}"
                       style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">老师别名（逗号分隔）</label>
                <input type="text" id="teacherAliases" value="${(teacher?.aliases || []).join(', ')}"
                       placeholder="例如：Teacher John, Mr. John"
                       style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">老师类型</label>
                <select id="teacherType" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;">
                    <option value="菲" ${teacher?.type === '菲' ? 'selected' : ''}>菲教</option>
                    <option value="欧" ${teacher?.type === '欧' ? 'selected' : ''}>欧教</option>
                </select>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">课时薪资</label>
                <input type="number" id="salaryPerClassTime" value="${teacher?.salary_per_class_time || ''}"
                       step="0.01" min="0"
                       style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">薪资币种</label>
                <select id="salaryUnit" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;">
                    <option value="pesos" ${teacher?.salary_unit === 'pesos' ? 'selected' : ''}>Pesos (菲律宾比索)</option>
                    <option value="dollars" ${teacher?.salary_unit === 'dollars' ? 'selected' : ''}>Dollars (美元)</option>
                    <option value="rmb" ${teacher?.salary_unit === 'rmb' ? 'selected' : ''}>RMB (人民币)</option>
                </select>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">收款账号</label>
                <input type="text" id="salaryAccount" value="${teacher?.salary_account || ''}"
                       placeholder="GCash/PayPal/支付宝等"
                       style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button onclick="closeTeacherModal()"
                        style="padding: 10px 20px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">
                    取消
                </button>
                <button onclick="saveTeacherConfig()"
                        style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    保存
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeTeacherModal();
    });

    document.body.appendChild(modal);
}

function closeTeacherModal() {
    const modal = document.getElementById('teacherModal');
    if (modal) modal.remove();
}

async function saveTeacherConfig() {
    const originalName = document.getElementById('originalTeacherName').value;
    const teacherName = document.getElementById('teacherName').value.trim();
    const teacherAliasesInput = document.getElementById('teacherAliases').value.trim();
    const aliases = teacherAliasesInput ? teacherAliasesInput.split(',').map(a => a.trim()).filter(a => a) : [];
    const type = document.getElementById('teacherType').value;
    const salaryPerClassTime = parseFloat(document.getElementById('salaryPerClassTime').value) || 0;
    const salaryUnit = document.getElementById('salaryUnit').value;
    const salaryAccount = document.getElementById('salaryAccount').value.trim();

    if (!teacherName) {
        alert('请输入老师名字');
        return;
    }

    try {
        const response = await fetch(BASE_PATH + '/api/teachers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                original_name: originalName,
                teacher_name: teacherName,
                aliases: aliases,
                type: type,
                salary_per_class_time: salaryPerClassTime,
                salary_unit: salaryUnit,
                salary_account: salaryAccount
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('老师配置已保存', 'success');
            closeTeacherModal();
            loadTeachersConfig();
        } else {
            alert('保存失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('保存老师配置失败:', error);
        alert('保存失败: ' + error.message);
    }
}

async function deleteTeacher(name) {
    if (!confirm(`确定要删除老师 "${name}" 吗？`)) {
        return;
    }

    try {
        const response = await fetch(BASE_PATH + '/api/teachers', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teacher_name: name })
        });

        const result = await response.json();

        if (result.success) {
            showToast('老师已删除', 'success');
            loadTeachersConfig();
        } else {
            alert('删除失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('删除老师失败:', error);
        alert('删除失败: ' + error.message);
    }
}

// ========== 保存系统配置 ==========

async function saveSystemConfig() {
    const dollarsExchange = parseFloat(document.getElementById('dollarsExchange').value) || 7.12;
    const pesosExchange = parseFloat(document.getElementById('pesosExchange').value) || 7.65;
    const autoFeedbackPrompt = document.getElementById('autoFeedbackPrompt').value.trim();
    const autoFeedbackSchemaRaw = document.getElementById('autoFeedbackSchema').value.trim();

    // 验证 Schema JSON 格式
    let autoFeedbackSchema = null;
    if (autoFeedbackSchemaRaw) {
        try {
            autoFeedbackSchema = JSON.parse(autoFeedbackSchemaRaw);
        } catch (e) {
            alert('Schema JSON 格式错误，请检查');
            return;
        }
    }

    // 收集被排除的学生
    const excludedCheckboxes = document.querySelectorAll('.excluded-student-checkbox:checked');
    const excludedStudents = Array.from(excludedCheckboxes).map(cb => cb.value);

    try {
        const response = await fetch(BASE_PATH + '/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dollars_exchange: dollarsExchange,
                cny_to_pesos: pesosExchange,
                auto_feedback_prompt: autoFeedbackPrompt,
                auto_feedback_schema: autoFeedbackSchema,
                excluded_students: excludedStudents
            })
        });

        const result = await response.json();

        if (result.success) {
            showToast('设置已保存', 'success');
        } else {
            alert('保存失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('保存设置失败:', error);
        alert('保存失败: ' + error.message);
    }
}
