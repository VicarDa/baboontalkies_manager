const MATERIAL_ASSET_TYPES = ['slide', 'audio', 'video', 'exercise'];

const MATERIAL_ASSET_LABELS = {
    slide: 'Slide',
    audio: '音频',
    video: '视频',
    exercise: '练习'
};

const MATERIAL_STATUS_LABELS = {
    not_started: '未制作',
    queued: '待实现',
    processing: '制作中',
    ready: '已完成',
    failed: '失败'
};

const state = {
    groups: [],
    materials: [],
    filters: {
        keyword: '',
        groupId: ''
    }
};

document.addEventListener('DOMContentLoaded', function() {
    bindEvents();
    loadMaterialLibrary();
});

function bindEvents() {
    document.getElementById('uploadForm').addEventListener('submit', handleUploadSubmit);
    document.getElementById('uploadFile').addEventListener('change', handleFileChange);
    document.getElementById('keywordInput').addEventListener('input', handleFilterChange);
    document.getElementById('groupFilter').addEventListener('change', handleFilterChange);

    ['groupModalOverlay', 'materialModalOverlay', 'generateModalOverlay'].forEach((id) => {
        const overlay = document.getElementById(id);
        overlay.addEventListener('click', (event) => {
            if (event.target !== overlay) return;
            if (id === 'groupModalOverlay') closeGroupModal();
            if (id === 'materialModalOverlay') closeMaterialModal();
            if (id === 'generateModalOverlay') closeGenerateModal();
        });
    });
}

function handleFilterChange() {
    state.filters.keyword = document.getElementById('keywordInput').value.trim().toLowerCase();
    state.filters.groupId = document.getElementById('groupFilter').value;
    renderMaterialList();
}

function handleFileChange(event) {
    const file = event.target.files?.[0];
    const selectedFileName = document.getElementById('selectedFileName');
    const uploadTitle = document.getElementById('uploadTitle');

    if (!file) {
        selectedFileName.textContent = '支持上传 PDF、PPT、DOC、ZIP 等教材源文件。';
        return;
    }

    selectedFileName.textContent = `已选择文件：${file.name}`;
    if (!uploadTitle.value.trim()) {
        const title = file.name.replace(/\.[^.]+$/, '');
        uploadTitle.value = title;
    }
}

async function loadMaterialLibrary() {
    const materialsContainer = document.getElementById('materialsContainer');
    materialsContainer.innerHTML = '<div class="empty-state">正在加载教材列表...</div>';

    try {
        const result = await requestJson(`${BASE_PATH}/api/material-library/materials`);
        state.groups = result.data.groups || [];
        state.materials = result.data.materials || [];

        renderStats();
        renderGroupOptions();
        renderGroupList();
        renderMaterialList();
    } catch (error) {
        console.error('加载教材库失败:', error);
        materialsContainer.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(error.message)}</div>`;
        showToast(`加载教材库失败: ${error.message}`, 'error');
    }
}

function renderStats() {
    const readyCount = state.materials.reduce((sum, material) => {
        return sum + MATERIAL_ASSET_TYPES.reduce((assetSum, assetType) => {
            const asset = material.assetStatus?.[assetType];
            return assetSum + (asset?.status === 'ready' ? 1 : 0);
        }, 0);
    }, 0);

    document.getElementById('materialCount').textContent = String(state.materials.length);
    document.getElementById('groupCount').textContent = String(state.groups.length);
    document.getElementById('assetReadyCount').textContent = String(readyCount);
}

function buildGroupOptionsHtml({ includeAll = false, includeUngrouped = true, selectedValue = '' } = {}) {
    const options = [];

    if (includeAll) {
        options.push(`<option value="" ${selectedValue === '' ? 'selected' : ''}>全部教材组</option>`);
    }

    if (includeUngrouped) {
        options.push(`<option value="ungrouped" ${selectedValue === 'ungrouped' ? 'selected' : ''}>未分组</option>`);
    }

    state.groups.forEach((group) => {
        const value = String(group.id);
        options.push(`<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${escapeHtml(group.name)}</option>`);
    });

    return options.join('');
}

function renderGroupOptions() {
    const currentFilter = document.getElementById('groupFilter').value || state.filters.groupId || '';
    const currentUploadGroup = document.getElementById('uploadGroupId').value || 'ungrouped';
    const currentEditGroup = document.getElementById('materialModalGroupId').value || 'ungrouped';

    document.getElementById('groupFilter').innerHTML = buildGroupOptionsHtml({
        includeAll: true,
        includeUngrouped: true,
        selectedValue: currentFilter
    });

    document.getElementById('uploadGroupId').innerHTML = buildGroupOptionsHtml({
        includeAll: false,
        includeUngrouped: true,
        selectedValue: currentUploadGroup
    });

    document.getElementById('materialModalGroupId').innerHTML = buildGroupOptionsHtml({
        includeAll: false,
        includeUngrouped: true,
        selectedValue: currentEditGroup
    });
}

function renderGroupList() {
    const groupList = document.getElementById('groupList');

    if (!state.groups.length) {
        groupList.innerHTML = '<div class="empty-state" style="padding: 32px 12px;">暂无教材组，可先创建一个分组。</div>';
        return;
    }

    const materialCountByGroup = new Map();
    state.materials.forEach((material) => {
        const key = material.groupId === null ? 'ungrouped' : String(material.groupId);
        materialCountByGroup.set(key, (materialCountByGroup.get(key) || 0) + 1);
    });

    groupList.innerHTML = state.groups.map((group) => {
        const count = materialCountByGroup.get(String(group.id)) || 0;
        return `
            <div class="group-card">
                <div class="group-card-header">
                    <div>
                        <h4>${escapeHtml(group.name)}</h4>
                        <p>${escapeHtml(group.description || '未填写教材组说明')}</p>
                    </div>
                    <span class="group-count">${count} 本</span>
                </div>
                <div class="inline-actions" style="margin-top: 12px;">
                    <button type="button" class="secondary-btn" onclick="openGroupModal(${group.id})">编辑</button>
                    <button type="button" class="danger-btn" onclick="deleteGroup(${group.id})">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

function getFilteredMaterials() {
    return state.materials.filter((material) => {
        const keyword = state.filters.keyword;
        const groupId = state.filters.groupId;

        const matchesKeyword = !keyword || [
            material.title,
            material.originalFileName,
            material.description,
            material.groupName
        ].some((field) => String(field || '').toLowerCase().includes(keyword));

        let matchesGroup = true;
        if (groupId === 'ungrouped') {
            matchesGroup = material.groupId === null;
        } else if (groupId) {
            matchesGroup = String(material.groupId) === groupId;
        }

        return matchesKeyword && matchesGroup;
    });
}

function renderMaterialList() {
    const materialsContainer = document.getElementById('materialsContainer');
    const filteredMaterials = getFilteredMaterials();

    if (!filteredMaterials.length) {
        materialsContainer.innerHTML = '<div class="empty-state">当前筛选条件下暂无教材。你可以先上传教材，或者调整筛选条件。</div>';
        return;
    }

    const groupedMaterials = [];
    const ungrouped = filteredMaterials.filter((material) => material.groupId === null);

    if (ungrouped.length) {
        groupedMaterials.push({
            key: 'ungrouped',
            name: '未分组',
            description: '还没有归入任何教材组',
            materials: ungrouped
        });
    }

    state.groups.forEach((group) => {
        const materials = filteredMaterials.filter((material) => material.groupId === Number(group.id));
        if (!materials.length) return;

        groupedMaterials.push({
            key: `group-${group.id}`,
            name: group.name,
            description: group.description || '已归档到该教材组',
            materials
        });
    });

    materialsContainer.innerHTML = groupedMaterials.map((group) => renderMaterialGroupSection(group)).join('');
}

function renderMaterialGroupSection(group) {
    return `
        <section class="group-section">
            <div class="group-section-header">
                <div>
                    <h3>${escapeHtml(group.name)}</h3>
                    <p>${escapeHtml(group.description || '')}</p>
                </div>
                <span class="group-count">${group.materials.length} 本教材</span>
            </div>
            <div class="table-wrap">
                <table class="materials-table">
                    <thead>
                        <tr>
                            <th style="width: 90px;">排序</th>
                            <th style="min-width: 260px;">教材</th>
                            <th style="min-width: 200px;">源文件</th>
                            <th style="width: 110px;">Slide</th>
                            <th style="width: 110px;">音频</th>
                            <th style="width: 110px;">视频</th>
                            <th style="width: 110px;">练习</th>
                            <th style="width: 220px;">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${group.materials.map((material, index) => renderMaterialRow(material, index, group.materials.length)).join('')}
                    </tbody>
                </table>
            </div>
        </section>
    `;
}

function renderMaterialRow(material, index, total) {
    return `
        <tr>
            <td>
                <div style="font-weight: 700; color: #0f172a;">#${index + 1}</div>
                <div class="order-actions" style="margin-top: 8px;">
                    <button type="button" class="icon-btn" onclick="moveMaterial(${material.id}, 'up')" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="icon-btn" onclick="moveMaterial(${material.id}, 'down')" ${index === total - 1 ? 'disabled' : ''}>↓</button>
                </div>
            </td>
            <td>
                <h4 class="material-title">${escapeHtml(material.title)}</h4>
                <div class="material-meta">创建于 ${escapeHtml(formatDate(material.createdAt))}</div>
                <div class="material-meta">教材组：${escapeHtml(material.groupName || '未分组')}</div>
                ${material.description ? `<div class="material-desc">${escapeHtml(material.description)}</div>` : ''}
            </td>
            <td>
                <strong>${escapeHtml(material.originalFileName)}</strong>
                <div class="material-meta">${escapeHtml(formatFileSize(material.fileSize))}</div>
                ${material.fileUrl ? `<a class="file-link" href="${escapeHtml(material.fileUrl)}" target="_blank" rel="noopener noreferrer">查看源文件</a>` : '<span class="asset-note">文件地址不可用</span>'}
            </td>
            ${MATERIAL_ASSET_TYPES.map((assetType) => `<td>${renderAssetCell(material.assetStatus?.[assetType], assetType)}</td>`).join('')}
            <td>
                <div class="row-actions">
                    <button type="button" class="primary-btn" onclick="openGenerateModal(${material.id})">制作</button>
                    <button type="button" class="secondary-btn" onclick="openMaterialModal(${material.id})">编辑</button>
                    <button type="button" class="danger-btn" onclick="deleteMaterial(${material.id})">删除</button>
                </div>
            </td>
        </tr>
    `;
}

function renderAssetCell(asset, assetType) {
    const currentAsset = asset || {
        status: 'not_started',
        lastMessage: '',
        outputUrl: null
    };
    const status = currentAsset.status || 'not_started';
    const statusText = MATERIAL_STATUS_LABELS[status] || status;
    const title = currentAsset.lastMessage ? ` title="${escapeHtml(currentAsset.lastMessage)}"` : '';

    return `
        <span class="asset-pill asset-${escapeHtml(status)}"${title}>${escapeHtml(statusText)}</span>
        ${currentAsset.lastMessage ? `<span class="asset-note">${escapeHtml(currentAsset.lastMessage)}</span>` : ''}
        ${currentAsset.outputUrl ? `<a class="file-link" href="${escapeHtml(currentAsset.outputUrl)}" target="_blank" rel="noopener noreferrer">查看${escapeHtml(MATERIAL_ASSET_LABELS[assetType])}</a>` : ''}
    `;
}

async function handleUploadSubmit(event) {
    event.preventDefault();

    const fileInput = document.getElementById('uploadFile');
    const file = fileInput.files?.[0];
    if (!file) {
        showToast('请先选择教材文件', 'error');
        return;
    }

    const submitBtn = document.getElementById('uploadSubmitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '上传中...';

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', document.getElementById('uploadTitle').value.trim());
        formData.append('groupId', normalizeGroupValue(document.getElementById('uploadGroupId').value));
        formData.append('description', document.getElementById('uploadDescription').value.trim());

        await requestJson(`${BASE_PATH}/api/material-library/materials/upload`, {
            method: 'POST',
            body: formData
        }, false);

        document.getElementById('uploadForm').reset();
        document.getElementById('selectedFileName').textContent = '支持上传 PDF、PPT、DOC、ZIP 等教材源文件。';
        document.getElementById('uploadGroupId').value = 'ungrouped';

        showToast('教材上传成功', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('上传教材失败:', error);
        showToast(`上传失败: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function openGroupModal(groupId = null) {
    const overlay = document.getElementById('groupModalOverlay');
    const title = document.getElementById('groupModalTitle');
    const idInput = document.getElementById('groupModalId');
    const nameInput = document.getElementById('groupModalName');
    const descriptionInput = document.getElementById('groupModalDescription');

    if (groupId) {
        const group = state.groups.find((item) => Number(item.id) === Number(groupId));
        if (!group) return;
        title.textContent = '编辑教材组';
        idInput.value = String(group.id);
        nameInput.value = group.name || '';
        descriptionInput.value = group.description || '';
    } else {
        title.textContent = '新增教材组';
        idInput.value = '';
        nameInput.value = '';
        descriptionInput.value = '';
    }

    overlay.style.display = 'flex';
}

function closeGroupModal() {
    document.getElementById('groupModalOverlay').style.display = 'none';
}

async function saveGroup() {
    const id = document.getElementById('groupModalId').value;
    const name = document.getElementById('groupModalName').value.trim();
    const description = document.getElementById('groupModalDescription').value.trim();

    if (!name) {
        showToast('请输入教材组名称', 'error');
        return;
    }

    try {
        const url = id
            ? `${BASE_PATH}/api/material-library/groups/${id}`
            : `${BASE_PATH}/api/material-library/groups`;
        const method = id ? 'PUT' : 'POST';

        await requestJson(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });

        closeGroupModal();
        showToast(id ? '教材组已更新' : '教材组已创建', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('保存教材组失败:', error);
        showToast(`保存失败: ${error.message}`, 'error');
    }
}

async function deleteGroup(groupId) {
    const group = state.groups.find((item) => Number(item.id) === Number(groupId));
    if (!group) return;

    if (!confirm(`确定删除教材组“${group.name}”吗？该组必须为空才能删除。`)) {
        return;
    }

    try {
        await requestJson(`${BASE_PATH}/api/material-library/groups/${groupId}`, {
            method: 'DELETE'
        });

        showToast('教材组已删除', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('删除教材组失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

function openMaterialModal(materialId) {
    const material = state.materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return;

    document.getElementById('materialModalId').value = String(material.id);
    document.getElementById('materialModalTitle').value = material.title || '';
    document.getElementById('materialModalGroupId').value = material.groupId === null ? 'ungrouped' : String(material.groupId);
    document.getElementById('materialModalDescription').value = material.description || '';
    document.getElementById('materialModalOverlay').style.display = 'flex';
}

function closeMaterialModal() {
    document.getElementById('materialModalOverlay').style.display = 'none';
}

async function saveMaterial() {
    const id = document.getElementById('materialModalId').value;
    const title = document.getElementById('materialModalTitle').value.trim();
    const groupId = normalizeGroupValue(document.getElementById('materialModalGroupId').value);
    const description = document.getElementById('materialModalDescription').value.trim();

    if (!title) {
        showToast('教材名称不能为空', 'error');
        return;
    }

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                groupId,
                description
            })
        });

        closeMaterialModal();
        showToast('教材信息已更新', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('更新教材失败:', error);
        showToast(`更新失败: ${error.message}`, 'error');
    }
}

async function deleteMaterial(materialId) {
    const material = state.materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return;

    if (!confirm(`确定删除教材“${material.title}”吗？这会同时删除该教材的附件制作记录。`)) {
        return;
    }

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}`, {
            method: 'DELETE'
        });

        showToast('教材已删除', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('删除教材失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

async function moveMaterial(materialId, direction) {
    try {
        const result = await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction })
        });

        if (result.data?.moved === false) {
            showToast('已经到头了，不能继续移动', 'info');
            return;
        }

        await loadMaterialLibrary();
    } catch (error) {
        console.error('教材排序失败:', error);
        showToast(`排序失败: ${error.message}`, 'error');
    }
}

function openGenerateModal(materialId) {
    const material = state.materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return;

    document.getElementById('generateMaterialId').value = String(material.id);
    document.getElementById('generateModalSubtitle').textContent = `为《${material.title}》选择要制作的附件类型。`;
    document.querySelectorAll('.generateAssetType').forEach((checkbox) => {
        checkbox.checked = false;
    });
    document.getElementById('generateModalOverlay').style.display = 'flex';
}

function closeGenerateModal() {
    document.getElementById('generateModalOverlay').style.display = 'none';
}

async function submitGenerate() {
    const materialId = document.getElementById('generateMaterialId').value;
    const assetTypes = Array.from(document.querySelectorAll('.generateAssetType:checked')).map((checkbox) => checkbox.value);

    if (!assetTypes.length) {
        showToast('请至少选择一种附件类型', 'error');
        return;
    }

    try {
        const result = await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetTypes })
        });

        closeGenerateModal();
        showToast(result.message || '已提交制作请求', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('提交教材制作失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

function normalizeGroupValue(value) {
    return value === 'ungrouped' ? '' : value;
}

async function requestJson(url, options = {}, attachJsonHeader = true) {
    const finalOptions = { ...options };
    if (attachJsonHeader && !finalOptions.headers) {
        finalOptions.headers = { 'Content-Type': 'application/json' };
    }

    const response = await fetch(url, finalOptions);
    const rawText = await response.text();
    let result = {};

    try {
        result = rawText ? JSON.parse(rawText) : {};
    } catch (_error) {
        if (!response.ok) {
            throw new Error(rawText || '请求失败');
        }
        result = {};
    }

    if (!response.ok || result.success === false) {
        throw new Error(result.error || result.message || '请求失败');
    }

    return result;
}

function formatFileSize(size) {
    const bytes = Number(size || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.loadMaterialLibrary = loadMaterialLibrary;
window.openGroupModal = openGroupModal;
window.closeGroupModal = closeGroupModal;
window.saveGroup = saveGroup;
window.deleteGroup = deleteGroup;
window.openMaterialModal = openMaterialModal;
window.closeMaterialModal = closeMaterialModal;
window.saveMaterial = saveMaterial;
window.deleteMaterial = deleteMaterial;
window.moveMaterial = moveMaterial;
window.openGenerateModal = openGenerateModal;
window.closeGenerateModal = closeGenerateModal;
window.submitGenerate = submitGenerate;
