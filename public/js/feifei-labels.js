/**
 * 标签管理页面 JavaScript
 */

// 全局变量
let allFeifeiLabels = [];
let selectedParentLabelId = null;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadFeifeiLabels();
});

// ========== 标签管理 ==========

async function loadFeifeiLabels() {
    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/labels`);
        const result = await response.json();
        if (result.success) {
            allFeifeiLabels = result.data;
            renderLabelTree(result.data);
        }
    } catch (error) {
        console.error('加载标签失败:', error);
        document.getElementById('labelTree').innerHTML = '<div style="text-align: center; padding: 20px; color: #d32f2f;">加载失败</div>';
    }
}

function renderLabelTree(labels) {
    const tree = document.getElementById('labelTree');
    const rootLabels = labels.filter(l => !l.parentId);

    if (rootLabels.length === 0) {
        tree.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">暂无标签分类</div>';
        return;
    }

    let html = '<ul style="list-style: none; padding: 0; margin: 0;">';
    rootLabels.forEach(label => {
        const childCount = labels.filter(l => l.parentId == label.id).length;
        html += `
            <li style="padding: 8px 10px; cursor: pointer; border-radius: 4px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; ${selectedParentLabelId == label.id ? 'background: #e3f2fd;' : ''}"
                onclick="selectLabelCategory(${label.id}, '${label.name}')"
                onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='${selectedParentLabelId == label.id ? '#e3f2fd' : ''}'">
                <span>${label.name} ${childCount > 0 ? `<span style="color: #999; font-size: 12px;">(${childCount})</span>` : ''}</span>
                <span>
                    <button onclick="event.stopPropagation(); editLabel(${label.id})" style="padding: 2px 6px; background: #fff; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; font-size: 11px; margin-right: 4px;">编辑</button>
                    <button onclick="event.stopPropagation(); deleteLabel(${label.id})" style="padding: 2px 6px; background: #fff; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; font-size: 11px; color: #d32f2f;">删除</button>
                </span>
            </li>
        `;
    });
    html += '</ul>';
    tree.innerHTML = html;
}

function selectLabelCategory(labelId, labelName) {
    selectedParentLabelId = labelId;
    document.getElementById('selectedLabelTitle').textContent = labelName + ' - 子标签';
    document.getElementById('addChildLabelBtn').style.display = 'inline-block';
    renderLabelTree(allFeifeiLabels);
    renderChildLabels(labelId);
}

function renderChildLabels(parentId) {
    const tbody = document.getElementById('childLabelsBody');
    const children = allFeifeiLabels.filter(l => l.parentId == parentId);

    if (children.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #999;">暂无子标签</td></tr>';
        return;
    }

    tbody.innerHTML = children.map(label => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #f0f0f0;">${label.name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: center;">${label.orderNum || 0}</td>
            <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; color: #666;">${label.remark || '-'}</td>
            <td style="padding: 10px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                <button onclick="editLabel(${label.id})" style="padding: 4px 10px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px;">编辑</button>
                <button onclick="deleteLabel(${label.id})" style="padding: 4px 10px; background: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer;">删除</button>
            </td>
        </tr>
    `).join('');
}

function openLabelModal(parentId) {
    document.getElementById('editLabelId').value = '';
    document.getElementById('editLabelParentId').value = parentId || '';
    document.getElementById('editLabelName').value = '';
    document.getElementById('editLabelOrder').value = '0';
    document.getElementById('editLabelRemark').value = '';
    document.getElementById('labelModalTitle').textContent = parentId ? '新增子标签' : '新增标签分类';
    document.getElementById('feifeiLabelModal').style.display = 'flex';
}

function closeLabelModal() {
    document.getElementById('feifeiLabelModal').style.display = 'none';
}

function editLabel(id) {
    const label = allFeifeiLabels.find(l => l.id == id);
    if (!label) return;

    document.getElementById('editLabelId').value = label.id;
    document.getElementById('editLabelParentId').value = label.parentId || '';
    document.getElementById('editLabelName').value = label.name;
    document.getElementById('editLabelOrder').value = label.orderNum || 0;
    document.getElementById('editLabelRemark').value = label.remark || '';
    document.getElementById('labelModalTitle').textContent = '编辑标签';
    document.getElementById('feifeiLabelModal').style.display = 'flex';
}

async function saveLabel() {
    const id = document.getElementById('editLabelId').value;
    const parentId = document.getElementById('editLabelParentId').value;
    const name = document.getElementById('editLabelName').value.trim();
    const orderNum = parseInt(document.getElementById('editLabelOrder').value) || 0;
    const remark = document.getElementById('editLabelRemark').value.trim();

    if (!name) {
        alert('请输入标签名称');
        return;
    }

    try {
        const url = id ? `${BASE_PATH}/api/feifei/labels/${id}` : `${BASE_PATH}/api/feifei/labels`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentId: parentId || null, orderNum, remark })
        });

        const result = await response.json();
        if (result.success) {
            closeLabelModal();
            loadFeifeiLabels();
            if (selectedParentLabelId) {
                setTimeout(() => renderChildLabels(selectedParentLabelId), 100);
            }
        } else {
            alert('保存失败: ' + result.error);
        }
    } catch (error) {
        console.error('保存标签失败:', error);
        alert('保存失败');
    }
}

async function deleteLabel(id) {
    if (!confirm('确定要删除此标签吗？')) return;

    try {
        const response = await fetch(`${BASE_PATH}/api/feifei/labels/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            loadFeifeiLabels();
            if (selectedParentLabelId) {
                setTimeout(() => renderChildLabels(selectedParentLabelId), 100);
            }
        } else {
            alert('删除失败: ' + result.error);
        }
    } catch (error) {
        console.error('删除标签失败:', error);
        alert('删除失败');
    }
}
