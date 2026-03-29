const MATERIAL_ASSET_TYPES = ['slide', 'audio', 'video', 'exercise', 'summary_image'];

const MATERIAL_ASSET_LABELS = {
    slide: 'Slide',
    audio: '音频',
    video: '视频',
    exercise: '练习',
    summary_image: '摘要图'
};

const MATERIAL_PARSE_STATUS_LABELS = {
    not_started: '未开始',
    queued: '等待解析',
    processing: '解析中',
    ready: '全部就绪',
    partial_failed: '部分失败',
    failed: '解析失败'
};

const MATERIAL_STORAGE_STATUS_LABELS = {
    ready: '可操作',
    moving: '目录迁移中',
    move_failed: '迁移失败'
};

const PDF_PARSE_STATUS_LABELS = {
    queued: '排队中',
    processing: '解析中',
    ready: '已完成',
    failed: '失败'
};

const ASSET_STATUS_LABELS = {
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
    document.getElementById('createMaterialForm').addEventListener('submit', handleCreateMaterialSubmit);
    document.getElementById('createMaterialFiles').addEventListener('change', handleCreateFilesChange);
    document.getElementById('appendPdfFiles').addEventListener('change', handleAppendFilesChange);
    document.getElementById('keywordInput').addEventListener('input', handleFilterChange);
    document.getElementById('groupFilter').addEventListener('change', handleFilterChange);

    ['groupModalOverlay', 'materialModalOverlay', 'appendPdfModalOverlay', 'generateModalOverlay'].forEach((id) => {
        const overlay = document.getElementById(id);
        overlay.addEventListener('click', (event) => {
            if (event.target !== overlay) return;
            if (id === 'groupModalOverlay') closeGroupModal();
            if (id === 'materialModalOverlay') closeMaterialModal();
            if (id === 'appendPdfModalOverlay') closeAppendPdfModal();
            if (id === 'generateModalOverlay') closeGenerateModal();
        });
    });
}

function handleFilterChange() {
    state.filters.keyword = document.getElementById('keywordInput').value.trim().toLowerCase();
    state.filters.groupId = document.getElementById('groupFilter').value;
    renderMaterialList();
}

function handleCreateFilesChange(event) {
    const count = event.target.files?.length || 0;
    document.getElementById('createMaterialFilesNote').textContent = count
        ? `已选择 ${count} 个 PDF 文件，创建后会自动上传到 OSS 并排队解析。`
        : '可一次选择多个 PDF；上传后会按教材内 PDF 子项保存并自动排队解析。';
}

function handleAppendFilesChange(event) {
    const count = event.target.files?.length || 0;
    document.getElementById('appendPdfFilesNote').textContent = count
        ? `已选择 ${count} 个 PDF 文件，提交后会追加到教材末尾。`
        : '可一次选择多个 PDF，新上传的 PDF 会自动追加到教材末尾并排队解析。';
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
    const pdfCount = state.materials.reduce((sum, material) => sum + (material.pdfCount || 0), 0);
    const readyPdfCount = state.materials.reduce((sum, material) => sum + (material.readyPdfCount || 0), 0);

    document.getElementById('materialCount').textContent = String(state.materials.length);
    document.getElementById('pdfCount').textContent = String(pdfCount);
    document.getElementById('readyPdfCount').textContent = String(readyPdfCount);
    document.getElementById('groupCount').textContent = String(state.groups.length);
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
    const createGroup = document.getElementById('createMaterialGroupId').value || 'ungrouped';
    const editGroup = document.getElementById('materialModalGroupId').value || 'ungrouped';

    document.getElementById('groupFilter').innerHTML = buildGroupOptionsHtml({
        includeAll: true,
        includeUngrouped: true,
        selectedValue: currentFilter
    });

    document.getElementById('createMaterialGroupId').innerHTML = buildGroupOptionsHtml({
        includeAll: false,
        includeUngrouped: true,
        selectedValue: createGroup
    });

    document.getElementById('materialModalGroupId').innerHTML = buildGroupOptionsHtml({
        includeAll: false,
        includeUngrouped: true,
        selectedValue: editGroup
    });
}

function renderGroupList() {
    const groupList = document.getElementById('groupList');

    if (!state.groups.length) {
        groupList.innerHTML = '<div class="empty-state" style="padding: 32px 12px;">暂无教材组，可先创建一个分组。</div>';
        return;
    }

    groupList.innerHTML = state.groups.map((group) => {
        return `
            <div class="group-card">
                <div class="group-card-header">
                    <div>
                        <h4>${escapeHtml(group.name)}</h4>
                        <p>${escapeHtml(group.description || '未填写教材组说明')}</p>
                    </div>
                    <span class="group-count">${Number(group.materialCount || 0)} 本教材</span>
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
            material.description,
            material.groupName,
            ...(material.pdfs || []).map((pdf) => `${pdf.displayName} ${pdf.originalFileName}`)
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
        materialsContainer.innerHTML = '<div class="empty-state">当前筛选条件下暂无教材。你可以先创建教材，或者调整筛选条件。</div>';
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
        <section class="material-group-section">
            <div class="material-group-header">
                <div>
                    <h3>${escapeHtml(group.name)}</h3>
                    <p>${escapeHtml(group.description || '')}</p>
                </div>
                <span class="group-count">${group.materials.length} 本教材</span>
            </div>
            <div class="material-cards">
                ${group.materials.map((material, index) => renderMaterialCard(material, index, group.materials.length)).join('')}
            </div>
        </section>
    `;
}

function renderMaterialCard(material, index, total) {
    const parseStatusLabel = MATERIAL_PARSE_STATUS_LABELS[material.parseStatus] || material.parseStatus;
    const storageStatusLabel = MATERIAL_STORAGE_STATUS_LABELS[material.storageStatus] || material.storageStatus;
    const generateDisabled = !material.canGenerate || material.storageStatus !== 'ready';

    return `
        <details class="material-card" ${material.storageStatus !== 'ready' ? 'open' : ''}>
            <summary class="material-summary">
                <div class="material-summary-main">
                    <div class="material-title-row">
                        <h4>${escapeHtml(material.title)}</h4>
                        <span class="status-pill status-${escapeHtml(material.parseStatus)}">${escapeHtml(parseStatusLabel)}</span>
                        <span class="status-pill status-${escapeHtml(material.storageStatus)}">${escapeHtml(storageStatusLabel)}</span>
                    </div>
                    <div class="material-meta">
                        <span>教材组：${escapeHtml(material.groupName || '未分组')}</span>
                        <span>PDF：${material.pdfCount || 0}</span>
                        <span>可制作：${material.readyPdfCount || 0} 个已解析 PDF</span>
                        <span>更新时间：${escapeHtml(formatDate(material.updatedAt))}</span>
                    </div>
                    ${material.description ? `<div class="material-desc">${escapeHtml(material.description)}</div>` : ''}
                    ${material.latestError ? `<div class="error-text" style="margin-top: 10px;">${escapeHtml(material.latestError)}</div>` : ''}
                    <div class="summary-pills">
                        ${renderAssetSummary(material.assetStatus)}
                    </div>
                </div>
                <div class="material-actions">
                    <div class="order-actions">
                        <button type="button" class="icon-btn" onclick="event.preventDefault(); event.stopPropagation(); moveMaterial(${material.id}, 'up')" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="icon-btn" onclick="event.preventDefault(); event.stopPropagation(); moveMaterial(${material.id}, 'down')" ${index === total - 1 ? 'disabled' : ''}>↓</button>
                    </div>
                    <button type="button" class="secondary-btn" onclick="event.preventDefault(); event.stopPropagation(); openMaterialModal(${material.id})">编辑</button>
                    <button type="button" class="secondary-btn" onclick="event.preventDefault(); event.stopPropagation(); openAppendPdfModal(${material.id})" ${material.storageStatus !== 'ready' ? 'disabled' : ''}>追加 PDF</button>
                    <button type="button" class="primary-btn" onclick="event.preventDefault(); event.stopPropagation(); openGenerateModal(${material.id})" ${generateDisabled ? 'disabled' : ''}>制作</button>
                    <button type="button" class="danger-btn" onclick="event.preventDefault(); event.stopPropagation(); deleteMaterial(${material.id})">删除</button>
                </div>
            </summary>
            <div class="material-body">
                <div class="pdf-table-wrap">
                    <table class="pdf-table">
                        <thead>
                            <tr>
                                <th style="width: 90px;">顺序</th>
                                <th style="min-width: 220px;">PDF</th>
                                <th style="min-width: 180px;">原件 / 封面 / 正文</th>
                                <th style="width: 120px;">解析状态</th>
                                <th style="min-width: 160px;">解析信息</th>
                                <th style="width: 220px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(material.pdfs || []).length ? material.pdfs.map((pdf, pdfIndex) => renderPdfRow(material, pdf, pdfIndex)).join('') : `
                                <tr>
                                    <td colspan="6" class="empty-state" style="padding: 32px 20px;">当前教材还没有 PDF，可使用“追加 PDF”上传。</td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        </details>
    `;
}

function renderAssetSummary(assetStatus) {
    return MATERIAL_ASSET_TYPES.map((assetType) => {
        const asset = assetStatus?.[assetType];
        const status = asset?.status || 'not_started';
        const label = ASSET_STATUS_LABELS[status] || status;
        const name = MATERIAL_ASSET_LABELS[assetType] || assetType;
        return `<span class="asset-pill asset-${escapeHtml(status)}">${escapeHtml(name)} · ${escapeHtml(label)}</span>`;
    }).join('');
}

function renderPdfRow(material, pdf, index) {
    const statusLabel = PDF_PARSE_STATUS_LABELS[pdf.parseStatus] || pdf.parseStatus;
    const orderIds = (material.pdfs || []).map((item) => item.id);

    return `
        <tr>
            <td>
                <div style="font-weight: 700; color: #0f172a;">#${index + 1}</div>
                <div class="order-actions" style="margin-top: 8px;">
                    <button type="button" class="icon-btn" onclick="movePdf(${material.id}, ${pdf.id}, 'up')" ${index === 0 || material.storageStatus !== 'ready' ? 'disabled' : ''}>↑</button>
                    <button type="button" class="icon-btn" onclick="movePdf(${material.id}, ${pdf.id}, 'down')" ${index === orderIds.length - 1 || material.storageStatus !== 'ready' ? 'disabled' : ''}>↓</button>
                </div>
            </td>
            <td>
                <div style="font-weight: 700; color: #111827;">${escapeHtml(pdf.displayName)}</div>
                <div class="form-note">原始文件：${escapeHtml(pdf.originalFileName)}</div>
                <div class="form-note">创建时间：${escapeHtml(formatDate(pdf.createdAt))}</div>
                ${pdf.pageCount ? `<div class="form-note">页数：${pdf.pageCount}</div>` : ''}
            </td>
            <td>
                <div class="link-list">
                    ${pdf.sourceUrl ? `<a href="${escapeHtml(pdf.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原始 PDF</a>` : '<span>原始 PDF 暂不可用</span>'}
                    ${pdf.coverUrl ? `<a href="${escapeHtml(pdf.coverUrl)}" target="_blank" rel="noopener noreferrer">查看封面图</a>` : '<span>封面未生成</span>'}
                    ${pdf.contentUrl ? `<a href="${escapeHtml(pdf.contentUrl)}" target="_blank" rel="noopener noreferrer">查看正文 Markdown</a>` : '<span>正文未生成</span>'}
                    ${pdf.parseUrl ? `<a href="${escapeHtml(pdf.parseUrl)}" target="_blank" rel="noopener noreferrer">查看 parse.json</a>` : '<span>parse.json 未生成</span>'}
                </div>
            </td>
            <td>
                <span class="status-pill status-${escapeHtml(pdf.parseStatus)}">${escapeHtml(statusLabel)}</span>
            </td>
            <td>
                ${pdf.parserName ? `<div class="form-note">解析器：${escapeHtml(pdf.parserName)} ${escapeHtml(pdf.parserVersion || '')}</div>` : '<div class="form-note">解析器：-</div>'}
                ${pdf.parsedAt ? `<div class="form-note">完成时间：${escapeHtml(formatDate(pdf.parsedAt))}</div>` : '<div class="form-note">完成时间：-</div>'}
                ${pdf.errorMessage ? `<div class="error-text" style="margin-top: 8px;">${escapeHtml(pdf.errorMessage)}</div>` : ''}
            </td>
            <td>
                <div class="pdf-actions">
                    <button type="button" class="secondary-btn" onclick="reparsePdf(${pdf.id})" ${material.storageStatus !== 'ready' ? 'disabled' : ''}>重新解析</button>
                    <button type="button" class="danger-btn" onclick="deletePdf(${pdf.id})" ${material.storageStatus !== 'ready' ? 'disabled' : ''}>删除 PDF</button>
                </div>
            </td>
        </tr>
    `;
}

async function handleCreateMaterialSubmit(event) {
    event.preventDefault();

    const filesInput = document.getElementById('createMaterialFiles');
    const files = Array.from(filesInput.files || []);
    if (!files.length) {
        showToast('请至少选择一个 PDF 文件', 'error');
        return;
    }

    const submitBtn = document.getElementById('createMaterialSubmitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '创建中...';

    try {
        const formData = new FormData();
        formData.append('title', document.getElementById('createMaterialTitle').value.trim());
        formData.append('groupId', normalizeGroupValue(document.getElementById('createMaterialGroupId').value));
        formData.append('description', document.getElementById('createMaterialDescription').value.trim());
        files.forEach((file) => formData.append('files[]', file));

        await requestJson(`${BASE_PATH}/api/material-library/materials`, {
            method: 'POST',
            body: formData
        }, false);

        document.getElementById('createMaterialForm').reset();
        document.getElementById('createMaterialGroupId').value = 'ungrouped';
        document.getElementById('createMaterialFilesNote').textContent = '可一次选择多个 PDF；上传后会按教材内 PDF 子项保存并自动排队解析。';
        showToast('教材创建成功，PDF 已开始后台解析', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('创建教材失败:', error);
        showToast(`创建失败: ${error.message}`, 'error');
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

function openAppendPdfModal(materialId) {
    const material = state.materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return;

    document.getElementById('appendPdfMaterialId').value = String(material.id);
    document.getElementById('appendPdfModalSubtitle').textContent = `为《${material.title}》追加多个 PDF。`;
    document.getElementById('appendPdfFiles').value = '';
    document.getElementById('appendPdfFilesNote').textContent = '可一次选择多个 PDF，新上传的 PDF 会自动追加到教材末尾并排队解析。';
    document.getElementById('appendPdfModalOverlay').style.display = 'flex';
}

function closeAppendPdfModal() {
    document.getElementById('appendPdfModalOverlay').style.display = 'none';
}

async function submitAppendPdfs() {
    const materialId = document.getElementById('appendPdfMaterialId').value;
    const files = Array.from(document.getElementById('appendPdfFiles').files || []);

    if (!files.length) {
        showToast('请先选择要追加的 PDF 文件', 'error');
        return;
    }

    try {
        const formData = new FormData();
        files.forEach((file) => formData.append('files[]', file));

        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/pdfs`, {
            method: 'POST',
            body: formData
        }, false);

        closeAppendPdfModal();
        showToast('PDF 已追加并开始后台解析', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('追加 PDF 失败:', error);
        showToast(`追加失败: ${error.message}`, 'error');
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

async function movePdf(materialId, pdfId, direction) {
    const material = state.materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return;

    const pdfs = [...(material.pdfs || [])];
    const index = pdfs.findIndex((item) => Number(item.id) === Number(pdfId));
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pdfs.length) return;

    [pdfs[index], pdfs[targetIndex]] = [pdfs[targetIndex], pdfs[index]];
    const orderedPdfIds = pdfs.map((item) => item.id);

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/pdfs/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedPdfIds })
        });
        await loadMaterialLibrary();
    } catch (error) {
        console.error('PDF 排序失败:', error);
        showToast(`PDF 排序失败: ${error.message}`, 'error');
    }
}

async function reparsePdf(pdfId) {
    try {
        const result = await requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}/reparse`, {
            method: 'POST'
        });
        showToast(result.message || '已提交重新解析任务', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('重新解析失败:', error);
        showToast(`重新解析失败: ${error.message}`, 'error');
    }
}

async function deletePdf(pdfId) {
    if (!confirm('确定删除这个 PDF 吗？其原始文件、封面和解析结果都会一起删除。')) {
        return;
    }

    try {
        await requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}`, {
            method: 'DELETE'
        });
        showToast('PDF 已删除', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('删除 PDF 失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

async function deleteMaterial(materialId) {
    const material = state.materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return;

    if (!confirm(`确定删除教材“${material.title}”吗？该教材下所有 PDF 及其 OSS 解析结果都会一起删除。`)) {
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

function openGenerateModal(materialId) {
    const material = state.materials.find((item) => Number(item.id) === Number(materialId));
    if (!material) return;

    if (!material.canGenerate) {
        showToast('需至少一个 PDF 解析完成后才能制作附件', 'info');
        return;
    }

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
        console.error('提交制作失败:', error);
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
window.openAppendPdfModal = openAppendPdfModal;
window.closeAppendPdfModal = closeAppendPdfModal;
window.submitAppendPdfs = submitAppendPdfs;
window.moveMaterial = moveMaterial;
window.movePdf = movePdf;
window.reparsePdf = reparsePdf;
window.deletePdf = deletePdf;
window.deleteMaterial = deleteMaterial;
window.openGenerateModal = openGenerateModal;
window.closeGenerateModal = closeGenerateModal;
window.submitGenerate = submitGenerate;
