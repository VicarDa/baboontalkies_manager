const MATERIAL_ASSET_LABELS = {
    slide: 'Slide',
    audio: '音频',
    video: '视频',
    exercise: '练习',
    summary_image: '摘要图'
};

const THUMBNAIL_LANGUAGE_LABELS = {
    zh_hans: '简体中文',
    zh_hant: '繁体中文',
    en: '英文',
    textless: '无文字'
};

const THUMBNAIL_LANGUAGE_OPTIONS = ['zh_hans', 'zh_hant', 'en', 'textless'];
const THUMBNAIL_ANNOTATION_LANGUAGES = ['zh_hans', 'zh_hant', 'en'];

const DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE = `你是教材关键内容提炼助手。
请根据给定 PDF 的逐页解析内容，提炼文章标题，并按页输出核心段落与建议配图。
返回必须是严格 JSON，不要输出 Markdown，不要解释，不要添加多余字段。
JSON 格式必须为：{"title":"...","pages":[{"page":1,"seg":{"seg1":{"seg1_pic":"...","seg1_text":"..."},"seg2":{"seg2_pic":"...","seg2_text":"..."}}}]}
要求：
1. pages 必须覆盖输入中的每一页，page 使用数字页码。
2. seg 中每个 segN 只包含 segN_pic 和 segN_text 两个字段；没有内容时可以省略对应 segN。
3. segN_pic 写该段最适合的配图或画面描述，segN_text 写该段核心内容，保持精炼，不要编造。
4. 尽量保留原文主要语言，不要额外解释。
5. 不要返回 words 字段，words 由系统从 markdown 中的 **Words to Know** 自动提取。

教材名：{{material_title}}
PDF 名：{{pdf_name}}

逐页解析内容：
{{page_source}}`;

const DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE = `用风格：“童话绘本感的信息图插画风（whimsical storybook infographic）”，生成包含如下内容及内容说明的图片，需要逻辑合理，文字不要太小。童话绘本风信息图，手绘水彩插画，柔和粉彩配色，治愈系幻想田园，复古儿童书插图风，细腻线稿，温暖发光氛围，高细节叙事海报，梦幻科普信息图。纯英文。现在图片内容如下：
【标题】
{{title}}
【正文】
{{body}}`;

const DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE = '{{language}}配套图：将这个图中的英文全部改为{{language}}；';
const DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE = '无内容配套图：将这个图中除了标题以外的文字去掉。';

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

const STRUCTURED_CONTENT_STATUS_LABELS = {
    not_started: '未开始',
    queued: '排队中',
    processing: '提炼中',
    ready: '已完成',
    failed: '失败'
};

const ASSET_STATUS_LABELS = {
    not_started: '未制作',
    queued: '排队中',
    processing: '制作中',
    ready: '已完成',
    failed: '失败'
};

const state = {
    groups: [],
    materials: [],
    config: {
        cny_to_pesos: 7.65,
        dollars_exchange: 7.12,
        excluded_students: [],
        hide_remaining_students: [],
        auto_feedback_prompt: '',
        auto_feedback_schema: null,
        material_key_content_prompt_template: DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE,
        summary_image_prompt_template: DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
        thumbnail_companion_language_prompt_template: DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE,
        thumbnail_companion_textless_prompt_template: DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE
    },
    filters: {
        keyword: '',
        groupId: ''
    },
    activeTab: 'management',
    production: {
        materialId: null,
        data: null,
        loading: false,
        error: '',
        scope: 'all',
        selectedPageRefs: new Set(),
        selectedLanguages: new Set(),
        thumbnailPromptTemplate: DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
        annotationThumbnailId: '',
        pollTimer: null
    },
    companion: {
        sourceThumbnailId: null,
        targetLanguage: '',
        promptText: ''
    }
};

document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadMaterialLibraryConfig();
    loadMaterialLibrary();
});

function bindEvents() {
    document.getElementById('createMaterialForm').addEventListener('submit', handleCreateMaterialSubmit);
    document.getElementById('createMaterialFiles').addEventListener('change', handleCreateFilesChange);
    document.getElementById('appendPdfFiles').addEventListener('change', handleAppendFilesChange);
    document.getElementById('keywordInput').addEventListener('input', handleFilterChange);
    document.getElementById('groupFilter').addEventListener('change', handleFilterChange);

    document.getElementById('materialsManagementTabBtn').addEventListener('click', () => setActiveTab('management'));
    document.getElementById('materialsListTabBtn').addEventListener('click', () => setActiveTab('list'));

    document.getElementById('materialKeyContentPromptTemplate').addEventListener('input', () => {
        state.config.material_key_content_prompt_template = document.getElementById('materialKeyContentPromptTemplate').value;
    });
    document.getElementById('materialKeyContentPromptSaveBtn').addEventListener('click', saveMaterialKeyContentPromptTemplate);
    document.getElementById('materialKeyContentPromptResetBtn').addEventListener('click', resetMaterialKeyContentPromptTemplate);

    document.getElementById('summaryImagePromptTemplate').addEventListener('input', () => {
        state.config.summary_image_prompt_template = document.getElementById('summaryImagePromptTemplate').value;
    });
    document.getElementById('summaryImagePromptSaveBtn').addEventListener('click', saveThumbnailPromptTemplate);
    document.getElementById('summaryImagePromptResetBtn').addEventListener('click', resetThumbnailPromptTemplate);

    document.getElementById('thumbnailCompanionLanguagePromptTemplate').addEventListener('input', () => {
        state.config.thumbnail_companion_language_prompt_template = document.getElementById('thumbnailCompanionLanguagePromptTemplate').value;
    });
    document.getElementById('thumbnailCompanionTextlessPromptTemplate').addEventListener('input', () => {
        state.config.thumbnail_companion_textless_prompt_template = document.getElementById('thumbnailCompanionTextlessPromptTemplate').value;
    });
    document.getElementById('thumbnailCompanionPromptSaveBtn').addEventListener('click', saveThumbnailCompanionPromptTemplates);
    document.getElementById('thumbnailCompanionPromptResetBtn').addEventListener('click', resetThumbnailCompanionPromptTemplates);

    ['groupModalOverlay', 'materialModalOverlay', 'appendPdfModalOverlay', 'productionModalOverlay', 'thumbnailCompanionModalOverlay'].forEach((id) => {
        const overlay = document.getElementById(id);
        overlay.addEventListener('click', (event) => {
            if (event.target !== overlay) return;
            if (id === 'groupModalOverlay') closeGroupModal();
            if (id === 'materialModalOverlay') closeMaterialModal();
            if (id === 'appendPdfModalOverlay') closeAppendPdfModal();
            if (id === 'productionModalOverlay') closeProductionModal();
            if (id === 'thumbnailCompanionModalOverlay') closeThumbnailCompanionModal();
        });
    });

    document.getElementById('productionScopeControls').addEventListener('change', (event) => {
        if (event.target.name !== 'productionScope') return;
        state.production.scope = event.target.value === 'selected' ? 'selected' : 'all';
        renderProductionPageSelection();
        renderProductionScopeSummary();
    });

    document.getElementById('productionPageSelection').addEventListener('change', (event) => {
        if (!event.target.classList.contains('productionPageCheckbox')) return;
        const value = event.target.value;
        if (event.target.checked) {
            state.production.selectedPageRefs.add(value);
        } else {
            state.production.selectedPageRefs.delete(value);
        }
        renderProductionScopeSummary();
    });

    document.getElementById('productionThumbnailLanguageGrid').addEventListener('change', (event) => {
        if (!event.target.classList.contains('productionThumbnailLanguage')) return;
        const language = event.target.value;
        if (event.target.checked) {
            state.production.selectedLanguages.add(language);
        } else {
            state.production.selectedLanguages.delete(language);
        }
    });

    document.getElementById('productionThumbnailPromptTemplate').addEventListener('input', (event) => {
        state.production.thumbnailPromptTemplate = event.target.value;
    });
    document.getElementById('productionGenerateThumbnailBtn').addEventListener('click', submitThumbnailGeneration);
    document.getElementById('productionRefreshBtn').addEventListener('click', () => {
        if (state.production.materialId) {
            fetchProductionData(state.production.materialId, { silent: false });
        }
    });
    document.getElementById('productionAnnotationThumbnailSelect').addEventListener('change', (event) => {
        state.production.annotationThumbnailId = event.target.value;
        renderProductionAnnotationSection();
    });
    document.getElementById('productionAnnotateBtn').addEventListener('click', submitThumbnailAnnotation);

    document.getElementById('thumbnailCompanionTargetLanguage').addEventListener('change', (event) => {
        state.companion.targetLanguage = event.target.value;
        state.companion.promptText = buildCompanionPrompt(state.companion.targetLanguage);
        renderThumbnailCompanionModal();
    });
    document.getElementById('thumbnailCompanionPrompt').addEventListener('input', (event) => {
        state.companion.promptText = event.target.value;
    });
}

function setActiveTab(tabName) {
    state.activeTab = tabName === 'list' ? 'list' : 'management';
    document.getElementById('materialsManagementTabBtn').classList.toggle('active', state.activeTab === 'management');
    document.getElementById('materialsListTabBtn').classList.toggle('active', state.activeTab === 'list');
    document.getElementById('materialsManagementTab').classList.toggle('active', state.activeTab === 'management');
    document.getElementById('materialsListTab').classList.toggle('active', state.activeTab === 'list');
}

function handleFilterChange() {
    state.filters.keyword = document.getElementById('keywordInput').value.trim().toLowerCase();
    state.filters.groupId = document.getElementById('groupFilter').value;
    renderMaterialList();
}

async function loadMaterialLibraryConfig() {
    try {
        const result = await requestJson(`${BASE_PATH}/api/config`);
        const config = result.config || {};
        state.config = {
            ...state.config,
            ...config,
            material_key_content_prompt_template: config.material_key_content_prompt_template || DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE,
            summary_image_prompt_template: config.summary_image_prompt_template || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
            thumbnail_companion_language_prompt_template: config.thumbnail_companion_language_prompt_template || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE,
            thumbnail_companion_textless_prompt_template: config.thumbnail_companion_textless_prompt_template || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE
        };
    } catch (error) {
        console.error('加载教材配置失败:', error);
    }

    syncConfigInputs();
}

function syncConfigInputs() {
    document.getElementById('materialKeyContentPromptTemplate').value = state.config.material_key_content_prompt_template;
    document.getElementById('summaryImagePromptTemplate').value = state.config.summary_image_prompt_template;
    document.getElementById('thumbnailCompanionLanguagePromptTemplate').value = state.config.thumbnail_companion_language_prompt_template;
    document.getElementById('thumbnailCompanionTextlessPromptTemplate').value = state.config.thumbnail_companion_textless_prompt_template;
}

function resetMaterialKeyContentPromptTemplate() {
    state.config.material_key_content_prompt_template = DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE;
    syncConfigInputs();
    showToast('关键内容提炼提示词模板已恢复默认，记得点击保存。', 'info');
}

function resetThumbnailPromptTemplate() {
    state.config.summary_image_prompt_template = DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE;
    syncConfigInputs();
    if (!state.production.materialId) return;
    state.production.thumbnailPromptTemplate = DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE;
    renderProductionThumbnailSection();
    showToast('缩略图提示词模板已恢复默认，记得点击保存。', 'info');
}

function resetThumbnailCompanionPromptTemplates() {
    state.config.thumbnail_companion_language_prompt_template = DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE;
    state.config.thumbnail_companion_textless_prompt_template = DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE;
    syncConfigInputs();
    showToast('配套图提示词模板已恢复默认，记得点击保存。', 'info');
}

async function buildConfigSavePayload(overrides = {}) {
    const result = await requestJson(`${BASE_PATH}/api/config`);
    const currentConfig = result.config || {};

    return {
        cny_to_pesos: Number(currentConfig.cny_to_pesos || state.config.cny_to_pesos || 7.65),
        dollars_exchange: Number(currentConfig.dollars_exchange || state.config.dollars_exchange || 7.12),
        excluded_students: Array.isArray(currentConfig.excluded_students) ? currentConfig.excluded_students : [],
        hide_remaining_students: Array.isArray(currentConfig.hide_remaining_students) ? currentConfig.hide_remaining_students : [],
        auto_feedback_prompt: currentConfig.auto_feedback_prompt || state.config.auto_feedback_prompt || '',
        auto_feedback_schema: currentConfig.auto_feedback_schema ?? state.config.auto_feedback_schema ?? null,
        material_key_content_prompt_template: currentConfig.material_key_content_prompt_template || state.config.material_key_content_prompt_template || DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE,
        summary_image_prompt_template: currentConfig.summary_image_prompt_template || state.config.summary_image_prompt_template || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
        thumbnail_companion_language_prompt_template: currentConfig.thumbnail_companion_language_prompt_template || state.config.thumbnail_companion_language_prompt_template || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE,
        thumbnail_companion_textless_prompt_template: currentConfig.thumbnail_companion_textless_prompt_template || state.config.thumbnail_companion_textless_prompt_template || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE,
        ...overrides
    };
}

async function saveMaterialKeyContentPromptTemplate() {
    const promptTemplate = document.getElementById('materialKeyContentPromptTemplate').value;
    if (
        !promptTemplate.includes('{{material_title}}')
        || !promptTemplate.includes('{{pdf_name}}')
        || !promptTemplate.includes('{{page_source}}')
    ) {
        showToast('关键内容模板必须保留 {{material_title}}、{{pdf_name}} 和 {{page_source}} 占位符', 'error');
        return;
    }

    await saveConfigWithOverrides({
        material_key_content_prompt_template: promptTemplate
    }, '关键内容提炼提示词模板已保存');
}

async function saveThumbnailPromptTemplate() {
    const promptTemplate = document.getElementById('summaryImagePromptTemplate').value;
    if (!promptTemplate.includes('{{title}}') || !promptTemplate.includes('{{body}}')) {
        showToast('缩略图提示词模板必须保留 {{title}} 和 {{body}} 占位符', 'error');
        return;
    }

    await saveConfigWithOverrides({
        summary_image_prompt_template: promptTemplate
    }, '缩略图提示词模板已保存');

    if (!state.production.materialId) return;
    state.production.thumbnailPromptTemplate = promptTemplate;
    renderProductionThumbnailSection();
}

async function saveThumbnailCompanionPromptTemplates() {
    const languagePrompt = document.getElementById('thumbnailCompanionLanguagePromptTemplate').value;
    const textlessPrompt = document.getElementById('thumbnailCompanionTextlessPromptTemplate').value;
    if (!languagePrompt.includes('{{language}}')) {
        showToast('语言配套图模板必须保留 {{language}} 占位符', 'error');
        return;
    }
    if (!textlessPrompt.trim()) {
        showToast('无内容配套图模板不能为空', 'error');
        return;
    }

    await saveConfigWithOverrides({
        thumbnail_companion_language_prompt_template: languagePrompt,
        thumbnail_companion_textless_prompt_template: textlessPrompt
    }, '配套图提示词模板已保存');
}

async function saveConfigWithOverrides(overrides, successMessage) {
    try {
        const payload = await buildConfigSavePayload(overrides);
        await requestJson(`${BASE_PATH}/api/config`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        state.config = {
            ...state.config,
            ...payload
        };
        syncConfigInputs();
        showToast(successMessage, 'success');
    } catch (error) {
        console.error('保存教材配置失败:', error);
        showToast(`保存失败: ${error.message}`, 'error');
    }
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

        if (state.production.materialId) {
            const currentMaterialExists = state.materials.some((material) => material.id === state.production.materialId);
            if (currentMaterialExists) {
                renderProductionHeader();
            } else {
                closeProductionModal();
            }
        }
    } catch (error) {
        console.error('加载教材库失败:', error);
        materialsContainer.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(error.message)}</div>`;
        showToast(`加载教材库失败: ${error.message}`, 'error');
    }
}

function renderStats() {
    const pdfCount = state.materials.reduce((sum, material) => sum + Number(material.pdfCount || 0), 0);
    const readyPdfCount = state.materials.reduce((sum, material) => sum + Number(material.readyPdfCount || 0), 0);
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
    document.getElementById('groupFilter').innerHTML = buildGroupOptionsHtml({
        includeAll: true,
        includeUngrouped: true,
        selectedValue: document.getElementById('groupFilter').value || state.filters.groupId || ''
    });
    document.getElementById('createMaterialGroupId').innerHTML = buildGroupOptionsHtml({
        includeUngrouped: true,
        selectedValue: document.getElementById('createMaterialGroupId').value || 'ungrouped'
    });
    document.getElementById('materialModalGroupId').innerHTML = buildGroupOptionsHtml({
        includeUngrouped: true,
        selectedValue: document.getElementById('materialModalGroupId').value || 'ungrouped'
    });
}

function renderGroupList() {
    const groupList = document.getElementById('groupList');
    if (!state.groups.length) {
        groupList.innerHTML = '<div class="empty-state" style="padding: 32px 12px;">暂无教材组，可先创建一个分组。</div>';
        return;
    }

    groupList.innerHTML = state.groups.map((group) => `
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
    `).join('');
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

    materialsContainer.innerHTML = groupedMaterials.map((group) => `
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
    `).join('');
}

function renderMaterialCard(material, index, total) {
    const parseStatusLabel = MATERIAL_PARSE_STATUS_LABELS[material.parseStatus] || material.parseStatus;
    const storageStatusLabel = MATERIAL_STORAGE_STATUS_LABELS[material.storageStatus] || material.storageStatus;
    const canOpenProduction = material.storageStatus === 'ready' && Number(material.readyPdfCount || 0) > 0;

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
                        <span>可制作页来源：${material.readyPdfCount || 0} 个已解析 PDF</span>
                        <span>更新时间：${escapeHtml(formatDate(material.updatedAt))}</span>
                    </div>
                    ${material.description ? `<div class="material-desc">${escapeHtml(material.description)}</div>` : ''}
                    ${material.latestError ? `<div class="error-text" style="margin-top: 10px;">${escapeHtml(material.latestError)}</div>` : ''}
                    <div class="summary-pills">${renderAssetSummary(material.assetStatus)}</div>
                    ${renderAssetLinks(material.assetStatus)}
                </div>
                <div class="material-actions">
                    <div class="order-actions">
                        <button type="button" class="icon-btn" onclick="event.preventDefault(); event.stopPropagation(); moveMaterial(${material.id}, 'up')" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="icon-btn" onclick="event.preventDefault(); event.stopPropagation(); moveMaterial(${material.id}, 'down')" ${index === total - 1 ? 'disabled' : ''}>↓</button>
                    </div>
                    <button type="button" class="secondary-btn" onclick="event.preventDefault(); event.stopPropagation(); openMaterialModal(${material.id})">编辑</button>
                    <button type="button" class="secondary-btn" onclick="event.preventDefault(); event.stopPropagation(); openAppendPdfModal(${material.id})" ${material.storageStatus !== 'ready' ? 'disabled' : ''}>追加 PDF</button>
                    <button type="button" class="primary-btn" onclick="event.preventDefault(); event.stopPropagation(); openProductionModal(${material.id})" ${canOpenProduction ? '' : 'disabled'}>制作</button>
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
                                <th style="min-width: 220px;">原件 / 封面 / 解析</th>
                                <th style="width: 140px;">解析状态</th>
                                <th style="width: 140px;">关键内容</th>
                                <th style="min-width: 160px;">备注</th>
                                <th style="width: 220px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(material.pdfs || []).length
                                ? material.pdfs.map((pdf, pdfIndex) => renderPdfRow(material, pdf, pdfIndex)).join('')
                                : '<tr><td colspan="7" class="empty-state" style="padding: 24px 12px;">该教材还没有 PDF。</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </details>
    `;
}

function renderAssetSummary(assetStatus = {}) {
    return Object.values(assetStatus || {}).map((asset) => `
        <span class="asset-pill asset-${escapeHtml(asset.status)}">${escapeHtml(asset.label)} · ${escapeHtml(ASSET_STATUS_LABELS[asset.status] || asset.status)}</span>
    `).join('');
}

function renderAssetLinks(assetStatus = {}) {
    const links = [];
    Object.values(assetStatus).forEach((asset) => {
        if (asset.outputMeta?.compressedJpgOutputUrl) {
            links.push(`<a href="${escapeHtml(asset.outputMeta.compressedJpgOutputUrl)}" target="_blank" rel="noopener">${escapeHtml(asset.label)} JPG</a>`);
        }
        if (asset.outputMeta?.pngOutputUrl) {
            links.push(`<a href="${escapeHtml(asset.outputMeta.pngOutputUrl)}" target="_blank" rel="noopener">${escapeHtml(asset.label)} PNG</a>`);
        }
        if (!asset.outputMeta?.compressedJpgOutputUrl && !asset.outputMeta?.pngOutputUrl && asset.outputUrl) {
            links.push(`<a href="${escapeHtml(asset.outputUrl)}" target="_blank" rel="noopener">${escapeHtml(asset.label)} 输出</a>`);
        }
    });

    if (!links.length) return '';
    return `<div class="link-list" style="margin-top: 10px;">${links.join('')}</div>`;
}

function renderPdfRow(material, pdf, index) {
    const parseStatusLabel = PDF_PARSE_STATUS_LABELS[pdf.parseStatus] || pdf.parseStatus;
    const structuredStatusLabel = STRUCTURED_CONTENT_STATUS_LABELS[pdf.structuredContentStatus] || pdf.structuredContentStatus;
    const pdfCount = material.pdfs?.length || 0;
    const links = [];

    if (pdf.sourceUrl) links.push(`<a href="${escapeHtml(pdf.sourceUrl)}" target="_blank" rel="noopener">原始 PDF</a>`);
    if (pdf.coverUrl) links.push(`<a href="${escapeHtml(pdf.coverUrl)}" target="_blank" rel="noopener">封面图</a>`);
    if (pdf.contentUrl) links.push(`<a href="${escapeHtml(pdf.contentUrl)}" target="_blank" rel="noopener">正文 Markdown</a>`);
    if (pdf.pagesIndexUrl) links.push(`<a href="${escapeHtml(pdf.pagesIndexUrl)}" target="_blank" rel="noopener">逐页内容 JSON</a>`);
    if (pdf.parseUrl) links.push(`<a href="${escapeHtml(pdf.parseUrl)}" target="_blank" rel="noopener">parse.json</a>`);
    if (pdf.structuredContentUrl) links.push(`<a href="${escapeHtml(pdf.structuredContentUrl)}" target="_blank" rel="noopener">关键内容 JSON</a>`);

    return `
        <tr>
            <td>
                <div class="order-actions">
                    <button type="button" class="icon-btn" onclick="movePdf(${material.id}, ${pdf.id}, 'up')" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="icon-btn" onclick="movePdf(${material.id}, ${pdf.id}, 'down')" ${index === pdfCount - 1 ? 'disabled' : ''}>↓</button>
                </div>
            </td>
            <td>
                <strong>${escapeHtml(pdf.displayName)}</strong>
                <div class="form-note">${escapeHtml(pdf.originalFileName || '')}</div>
                <div class="form-note">页数：${pdf.pageCount || '未知'} · 顺序：${index + 1}</div>
            </td>
            <td><div class="link-list">${links.length ? links.join('') : '<span>暂无链接</span>'}</div></td>
            <td><span class="status-pill status-${escapeHtml(pdf.parseStatus)}">${escapeHtml(parseStatusLabel)}</span></td>
            <td>
                <span class="status-pill status-${escapeHtml(pdf.structuredContentStatus)}">${escapeHtml(structuredStatusLabel)}</span>
                ${pdf.structuredContentError ? `<div class="error-text" style="margin-top:8px;">${escapeHtml(pdf.structuredContentError)}</div>` : ''}
            </td>
            <td>
                ${pdf.errorMessage ? `<div class="error-text">${escapeHtml(pdf.errorMessage)}</div>` : '<span class="form-note">无</span>'}
            </td>
            <td>
                <div class="pdf-actions">
                    <button type="button" class="secondary-btn" onclick="reparsePdf(${pdf.id})">重新解析</button>
                    <button type="button" class="danger-btn" onclick="deletePdf(${pdf.id})">删除</button>
                </div>
            </td>
        </tr>
    `;
}

async function handleCreateMaterialSubmit(event) {
    event.preventDefault();

    const title = document.getElementById('createMaterialTitle').value.trim();
    const description = document.getElementById('createMaterialDescription').value.trim();
    const groupId = normalizeGroupValue(document.getElementById('createMaterialGroupId').value);
    const files = Array.from(document.getElementById('createMaterialFiles').files || []);

    if (!title) {
        showToast('教材名称不能为空', 'error');
        return;
    }
    if (!files.length) {
        showToast('请至少选择一个 PDF 文件', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    if (groupId !== null) {
        formData.append('groupId', String(groupId));
    }
    files.forEach((file) => formData.append('files[]', file));

    const submitBtn = document.getElementById('createMaterialSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '创建中...';

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials`, {
            method: 'POST',
            body: formData
        }, false);
        showToast('教材已创建，PDF 已开始上传与解析', 'success');
        event.target.reset();
        document.getElementById('createMaterialFilesNote').textContent = '可一次选择多个 PDF；上传后会按教材内 PDF 子项保存并自动排队解析。';
        await loadMaterialLibrary();
        setActiveTab('list');
    } catch (error) {
        console.error('创建教材失败:', error);
        showToast(`创建失败: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '创建教材并上传 PDF';
    }
}

function openGroupModal(groupId = null) {
    const group = state.groups.find((item) => Number(item.id) === Number(groupId));
    document.getElementById('groupModalTitle').textContent = group ? '编辑教材组' : '新增教材组';
    document.getElementById('groupModalId').value = group ? String(group.id) : '';
    document.getElementById('groupModalName').value = group?.name || '';
    document.getElementById('groupModalDescription').value = group?.description || '';
    document.getElementById('groupModalOverlay').style.display = 'flex';
}

function closeGroupModal() {
    document.getElementById('groupModalOverlay').style.display = 'none';
}

async function saveGroup() {
    const groupId = document.getElementById('groupModalId').value;
    const name = document.getElementById('groupModalName').value.trim();
    const description = document.getElementById('groupModalDescription').value.trim();

    if (!name) {
        showToast('教材组名称不能为空', 'error');
        return;
    }

    try {
        const url = groupId
            ? `${BASE_PATH}/api/material-library/groups/${groupId}`
            : `${BASE_PATH}/api/material-library/groups`;
        await requestJson(url, {
            method: groupId ? 'PUT' : 'POST',
            body: JSON.stringify({ name, description })
        });
        showToast(groupId ? '教材组已更新' : '教材组已创建', 'success');
        closeGroupModal();
        await loadMaterialLibrary();
    } catch (error) {
        console.error('保存教材组失败:', error);
        showToast(`保存失败: ${error.message}`, 'error');
    }
}

async function deleteGroup(groupId) {
    if (!window.confirm('确认删除这个教材组吗？删除前请确保该分组下没有教材。')) return;

    try {
        await requestJson(`${BASE_PATH}/api/material-library/groups/${groupId}`, { method: 'DELETE' });
        showToast('教材组已删除', 'success');
        await loadMaterialLibrary();
    } catch (error) {
        console.error('删除教材组失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

function openMaterialModal(materialId) {
    const material = state.materials.find((item) => item.id === materialId);
    if (!material) return;

    document.getElementById('materialModalId').value = String(material.id);
    document.getElementById('materialModalTitle').value = material.title || '';
    document.getElementById('materialModalDescription').value = material.description || '';
    document.getElementById('materialModalGroupId').value = material.groupId === null ? 'ungrouped' : String(material.groupId);
    document.getElementById('materialModalOverlay').style.display = 'flex';
}

function closeMaterialModal() {
    document.getElementById('materialModalOverlay').style.display = 'none';
}

async function saveMaterial() {
    const materialId = document.getElementById('materialModalId').value;
    const title = document.getElementById('materialModalTitle').value.trim();
    const description = document.getElementById('materialModalDescription').value.trim();
    const groupId = normalizeGroupValue(document.getElementById('materialModalGroupId').value);

    if (!title) {
        showToast('教材名称不能为空', 'error');
        return;
    }

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}`, {
            method: 'PUT',
            body: JSON.stringify({
                title,
                description,
                groupId
            })
        });
        showToast('教材已更新', 'success');
        closeMaterialModal();
        await loadMaterialLibrary();
    } catch (error) {
        console.error('更新教材失败:', error);
        showToast(`更新失败: ${error.message}`, 'error');
    }
}

function openAppendPdfModal(materialId) {
    const material = state.materials.find((item) => item.id === materialId);
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
        showToast('请至少选择一个 PDF 文件', 'error');
        return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('files[]', file));

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/pdfs`, {
            method: 'POST',
            body: formData
        }, false);
        showToast('PDF 已追加，后台将自动解析', 'success');
        closeAppendPdfModal();
        await loadMaterialLibrary();
    } catch (error) {
        console.error('追加 PDF 失败:', error);
        showToast(`追加失败: ${error.message}`, 'error');
    }
}

async function moveMaterial(materialId, direction) {
    const material = state.materials.find((item) => item.id === materialId);
    if (!material) return;

    const groupMaterials = state.materials
        .filter((item) => item.groupId === material.groupId)
        .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
    const currentIndex = groupMaterials.findIndex((item) => item.id === materialId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groupMaterials.length) return;

    const orderedIds = groupMaterials.map((item) => item.id);
    [orderedIds[currentIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[currentIndex]];

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/move`, {
            method: 'POST',
            body: JSON.stringify({ orderedMaterialIds: orderedIds })
        });
        await loadMaterialLibrary();
    } catch (error) {
        console.error('调整教材顺序失败:', error);
        showToast(`排序失败: ${error.message}`, 'error');
    }
}

async function movePdf(materialId, pdfId, direction) {
    const material = state.materials.find((item) => item.id === materialId);
    if (!material) return;
    const pdfs = [...(material.pdfs || [])];
    const currentIndex = pdfs.findIndex((pdf) => pdf.id === pdfId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= pdfs.length) return;

    const orderedPdfIds = pdfs.map((pdf) => pdf.id);
    [orderedPdfIds[currentIndex], orderedPdfIds[targetIndex]] = [orderedPdfIds[targetIndex], orderedPdfIds[currentIndex]];

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/pdfs/reorder`, {
            method: 'POST',
            body: JSON.stringify({ orderedPdfIds })
        });
        await loadMaterialLibrary();
    } catch (error) {
        console.error('调整 PDF 顺序失败:', error);
        showToast(`排序失败: ${error.message}`, 'error');
    }
}

async function reparsePdf(pdfId) {
    if (!window.confirm('确认重新解析这个 PDF 吗？旧的关键内容会被覆盖。')) return;

    try {
        await requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}/reparse`, { method: 'POST' });
        showToast('已提交重新解析任务', 'success');
        await loadMaterialLibrary();
        if (state.production.materialId) {
            fetchProductionData(state.production.materialId, { silent: true });
        }
    } catch (error) {
        console.error('重新解析 PDF 失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

async function deletePdf(pdfId) {
    if (!window.confirm('确认删除这个 PDF 吗？相关解析结果也会一起删除。')) return;

    try {
        await requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}`, { method: 'DELETE' });
        showToast('PDF 已删除', 'success');
        await loadMaterialLibrary();
        if (state.production.materialId) {
            fetchProductionData(state.production.materialId, { silent: true });
        }
    } catch (error) {
        console.error('删除 PDF 失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

async function deleteMaterial(materialId) {
    if (!window.confirm('确认删除这个教材吗？教材下的 PDF、解析结果和生成素材都会一起删除。')) return;

    try {
        await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}`, { method: 'DELETE' });
        showToast('教材已删除', 'success');
        await loadMaterialLibrary();
        if (state.production.materialId === materialId) {
            closeProductionModal();
        }
    } catch (error) {
        console.error('删除教材失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

function openProductionModal(materialId) {
    state.production.materialId = materialId;
    state.production.scope = 'all';
    state.production.selectedPageRefs = new Set();
    state.production.selectedLanguages = new Set();
    state.production.data = null;
    state.production.error = '';
    state.production.annotationThumbnailId = '';
    state.production.thumbnailPromptTemplate = state.config.summary_image_prompt_template;
    document.getElementById('productionModalOverlay').style.display = 'flex';
    renderProductionLoadingState();
    fetchProductionData(materialId, { silent: false });
}

function closeProductionModal() {
    stopProductionPolling();
    state.production.materialId = null;
    state.production.data = null;
    state.production.error = '';
    state.production.selectedPageRefs = new Set();
    state.production.selectedLanguages = new Set();
    state.production.annotationThumbnailId = '';
    document.getElementById('productionModalOverlay').style.display = 'none';
    closeThumbnailCompanionModal();
}

async function fetchProductionData(materialId, { silent = false } = {}) {
    if (!materialId) return;
    if (!silent) {
        state.production.loading = true;
        renderProductionLoadingState();
    }

    try {
        const result = await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/production`);
        const isFirstLoad = !state.production.data || state.production.materialId !== materialId;
        state.production.materialId = materialId;
        state.production.data = result.data;
        state.production.error = '';
        state.production.loading = false;

        const pageKeys = new Set((result.data.pages || []).map((page) => buildPageRefValue(page.materialPdfId, page.page)));
        state.production.selectedPageRefs = new Set([...state.production.selectedPageRefs].filter((value) => pageKeys.has(value)));
        if (isFirstLoad || !state.production.thumbnailPromptTemplate) {
            state.production.thumbnailPromptTemplate = result.data.promptTemplates?.thumbnail || state.config.summary_image_prompt_template;
        }

        const eligibleAnnotationIds = getAnnotatableThumbnails(result.data.thumbnails || []).map((item) => String(item.id));
        if (!eligibleAnnotationIds.includes(String(state.production.annotationThumbnailId || ''))) {
            state.production.annotationThumbnailId = eligibleAnnotationIds[0] || '';
        }

        renderProductionModal();
        scheduleProductionPolling();
    } catch (error) {
        console.error('加载制作工作台失败:', error);
        state.production.error = error.message;
        state.production.loading = false;
        renderProductionLoadingState();
    }
}

function scheduleProductionPolling() {
    stopProductionPolling();
    if (!state.production.materialId) return;
    state.production.pollTimer = window.setTimeout(() => {
        if (!state.production.materialId) return;
        fetchProductionData(state.production.materialId, { silent: true });
    }, 4000);
}

function stopProductionPolling() {
    if (state.production.pollTimer) {
        window.clearTimeout(state.production.pollTimer);
        state.production.pollTimer = null;
    }
}

function renderProductionLoadingState() {
    const material = state.materials.find((item) => item.id === state.production.materialId);
    document.getElementById('productionModalMaterialTitle').textContent = material ? `《${material.title}》制作工作台` : '制作工作台';
    document.getElementById('productionModalStatus').textContent = state.production.error
        ? `加载失败：${state.production.error}`
        : '正在加载制作数据...';
    document.getElementById('productionScopeSummary').textContent = '等待加载教材页信息';
    document.getElementById('productionPageSelection').innerHTML = '<div class="empty-state compact">正在加载页列表...</div>';
    document.getElementById('productionThumbnailGallery').innerHTML = '<div class="empty-state compact">正在加载缩略图...</div>';
    document.getElementById('productionAnnotationResults').innerHTML = '<div class="empty-state compact">正在加载标定信息...</div>';
}

function renderProductionModal() {
    renderProductionHeader();
    renderProductionPageSelection();
    renderProductionScopeSummary();
    renderProductionThumbnailSection();
    renderProductionGallery();
    renderProductionAnnotationSection();
}

function renderProductionHeader() {
    const material = state.production.data?.material || state.materials.find((item) => item.id === state.production.materialId);
    document.getElementById('productionModalMaterialTitle').textContent = material ? `《${material.title}》制作工作台` : '制作工作台';
    const pageCount = state.production.data?.pages?.length || 0;
    const thumbnailCount = state.production.data?.thumbnails?.length || 0;
    document.getElementById('productionModalStatus').textContent = material
        ? `页内容 ${pageCount} 条 · 缩略图 ${thumbnailCount} 张 · 理解/标定模型：doubao-seed-2-0-pro-260215`
        : '未找到教材信息';
}

function renderProductionPageSelection() {
    const pages = state.production.data?.pages || [];
    document.getElementById('productionScopeAll').checked = state.production.scope === 'all';
    document.getElementById('productionScopeSelected').checked = state.production.scope === 'selected';

    if (!pages.length) {
        document.getElementById('productionPageSelection').innerHTML = '<div class="empty-state compact">当前教材暂无可用于制作的页，请先等待关键内容提炼完成。</div>';
        return;
    }

    document.getElementById('productionPageSelection').innerHTML = pages.map((page) => {
        const value = buildPageRefValue(page.materialPdfId, page.page);
        const checked = state.production.selectedPageRefs.has(value) ? 'checked' : '';
        const disabled = state.production.scope === 'all' ? 'disabled' : '';
        return `
            <label class="page-select-card">
                <input type="checkbox" class="productionPageCheckbox" value="${escapeHtml(value)}" ${checked} ${disabled}>
                <div>
                    <div class="page-select-title">${escapeHtml(page.pdfDisplayName)} · 第 ${page.page} 页</div>
                    <div class="page-select-body">${escapeHtml(page.title || '未提取标题')}</div>
                </div>
            </label>
        `;
    }).join('');
}

function renderProductionScopeSummary() {
    const totalPages = state.production.data?.pages?.length || 0;
    const selectedCount = state.production.scope === 'all' ? totalPages : state.production.selectedPageRefs.size;
    document.getElementById('productionScopeSummary').textContent = state.production.scope === 'all'
        ? `当前作用范围：整本教材，共 ${totalPages} 页已可用于批量制作。`
        : `当前作用范围：选定页，已选择 ${selectedCount} 页。`;
}

function renderProductionThumbnailSection() {
    document.getElementById('productionThumbnailPromptTemplate').value = state.production.thumbnailPromptTemplate || state.config.summary_image_prompt_template;
    document.getElementById('productionThumbnailLanguageGrid').innerHTML = THUMBNAIL_LANGUAGE_OPTIONS.map((language) => `
        <label class="checkbox-card">
            <input type="checkbox" class="productionThumbnailLanguage" value="${language}" ${state.production.selectedLanguages.has(language) ? 'checked' : ''}>
            <span>${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[language])}</span>
        </label>
    `).join('');
}

function renderProductionGallery() {
    const pages = state.production.data?.pages || [];
    const thumbnails = state.production.data?.thumbnails || [];
    const pageMap = new Map(pages.map((page) => [buildPageRefValue(page.materialPdfId, page.page), page]));
    const grouped = new Map();

    thumbnails.forEach((thumbnail) => {
        const key = buildPageRefValue(thumbnail.materialPdfId, thumbnail.page);
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(thumbnail);
    });

    if (!pages.length && !thumbnails.length) {
        document.getElementById('productionThumbnailGallery').innerHTML = '<div class="empty-state compact">还没有可展示的页或缩略图。</div>';
        return;
    }

    const sections = [];
    const orderedKeys = [...new Set([
        ...pages.map((page) => buildPageRefValue(page.materialPdfId, page.page)),
        ...grouped.keys()
    ])];

    orderedKeys.forEach((key) => {
        const page = pageMap.get(key);
        const items = grouped.get(key) || [];
        const title = page
            ? `${page.pdfDisplayName} · 第 ${page.page} 页`
            : `已失配页面 · ${key}`;
        sections.push(`
            <section class="production-page-section">
                <div class="production-page-header">
                    <div>
                        <h4>${escapeHtml(title)}</h4>
                        <p>${escapeHtml(page?.title || '暂无页标题')}</p>
                    </div>
                    <span class="group-count">${items.length} 张缩略图</span>
                </div>
                <div class="thumbnail-grid">
                    ${items.length ? items.map((thumbnail) => renderThumbnailCard(thumbnail)).join('') : '<div class="empty-state compact">这一页还没有生成缩略图。</div>'}
                </div>
            </section>
        `);
    });

    document.getElementById('productionThumbnailGallery').innerHTML = sections.join('');
}

function renderThumbnailCard(thumbnail) {
    const statusLabel = ASSET_STATUS_LABELS[thumbnail.status] || thumbnail.status;
    const canCompanion = thumbnail.status === 'ready';
    const canAnnotate = thumbnail.status === 'ready' && THUMBNAIL_ANNOTATION_LANGUAGES.includes(thumbnail.language);
    const imageUrl = thumbnail.compressedJpgOutputUrl || thumbnail.outputUrl || thumbnail.pngOutputUrl || thumbnail.outputMeta?.compressedJpgOutputUrl || thumbnail.outputMeta?.pngOutputUrl || '';
    const annotationLabel = ASSET_STATUS_LABELS[thumbnail.annotationStatus] || thumbnail.annotationStatus || '未标定';

    return `
        <article class="thumbnail-card">
            <div class="thumbnail-preview">
                ${imageUrl
                    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[thumbnail.language] || thumbnail.language)}">`
                    : `<div class="thumbnail-placeholder">${escapeHtml(statusLabel)}</div>`}
                <div class="thumbnail-hover-actions">
                    <button type="button" class="secondary-btn small-btn" onclick="openThumbnailCompanionModal(${thumbnail.id})" ${canCompanion ? '' : 'disabled'}>生成配套图</button>
                    <button type="button" class="secondary-btn small-btn" onclick="queueThumbnailAnnotation(${thumbnail.id})" ${canAnnotate ? '' : 'disabled'}>位置标定</button>
                    <button type="button" class="danger-btn small-btn" onclick="deleteThumbnail(${thumbnail.id})">删除</button>
                </div>
            </div>
            <div class="thumbnail-card-body">
                <div class="thumbnail-card-title">
                    <strong>${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[thumbnail.language] || thumbnail.language)}</strong>
                    <span class="status-pill status-${escapeHtml(thumbnail.status)}">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="thumbnail-card-meta">
                    <span>${thumbnail.generationKind === 'companion' ? '配套图' : '基础图'}</span>
                    ${thumbnail.derivedFromThumbnailId ? `<span>来源 #${thumbnail.derivedFromThumbnailId}</span>` : ''}
                </div>
                <div class="form-note">${escapeHtml(thumbnail.lastMessage || '暂无说明')}</div>
                <div class="thumbnail-card-links">
                    ${thumbnail.compressedJpgOutputUrl ? `<a href="${escapeHtml(thumbnail.compressedJpgOutputUrl)}" target="_blank" rel="noopener">JPG</a>` : ''}
                    ${thumbnail.pngOutputUrl ? `<a href="${escapeHtml(thumbnail.pngOutputUrl)}" target="_blank" rel="noopener">PNG</a>` : ''}
                </div>
                <div class="annotation-meta">
                    标定状态：<span class="status-pill status-${escapeHtml(thumbnail.annotationStatus || 'not_started')}">${escapeHtml(annotationLabel)}</span>
                    ${thumbnail.annotationError ? `<div class="error-text" style="margin-top:6px;">${escapeHtml(thumbnail.annotationError)}</div>` : ''}
                </div>
            </div>
        </article>
    `;
}

function renderProductionAnnotationSection() {
    const thumbnails = getAnnotatableThumbnails(state.production.data?.thumbnails || []);
    const select = document.getElementById('productionAnnotationThumbnailSelect');
    const currentValue = String(state.production.annotationThumbnailId || '');
    select.innerHTML = thumbnails.length
        ? thumbnails.map((thumbnail) => `
            <option value="${thumbnail.id}" ${String(thumbnail.id) === currentValue ? 'selected' : ''}>
                ${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[thumbnail.language] || thumbnail.language)} · 第 ${thumbnail.page} 页 · ${thumbnail.generationKind === 'companion' ? '配套图' : '基础图'}
            </option>
        `).join('')
        : '<option value="">暂无可标定缩略图</option>';

    if (!thumbnails.length) {
        document.getElementById('productionAnnotationResults').innerHTML = '<div class="empty-state compact">请先生成英文或中文缩略图，再进行位置标定。</div>';
        return;
    }

    const targetThumbnailId = state.production.annotationThumbnailId || String(thumbnails[0].id);
    state.production.annotationThumbnailId = targetThumbnailId;
    const annotations = (state.production.data?.annotations || []).filter((item) => String(item.thumbnailId) === String(targetThumbnailId));
    const selectedThumbnail = thumbnails.find((item) => String(item.id) === String(targetThumbnailId));

    if (!annotations.length) {
        document.getElementById('productionAnnotationResults').innerHTML = `
            <div class="empty-state compact">
                ${selectedThumbnail?.annotationStatus === 'processing' || selectedThumbnail?.annotationStatus === 'queued'
                    ? '位置标定任务进行中，请稍后自动刷新查看。'
                    : '当前缩略图还没有标定结果。'}
            </div>
        `;
        return;
    }

    document.getElementById('productionAnnotationResults').innerHTML = annotations.map((item) => `
        <div class="annotation-card">
            <div class="annotation-card-head">
                <strong>${escapeHtml(item.sentenceRole === 'title' ? '标题' : `正文段 ${item.sentenceOrder}`)}</strong>
                <span>${escapeHtml(item.modelName || 'doubao-seed-2-0-pro-260215')}</span>
            </div>
            <div class="annotation-card-text">${escapeHtml(item.sentenceText)}</div>
            <div class="annotation-card-boxes">
                <code>文字框 ${escapeHtml(JSON.stringify(item.textBox || {}))}</code>
                <code>图片框 ${escapeHtml(JSON.stringify(item.imageBox || {}))}</code>
            </div>
        </div>
    `).join('');
}

function getAnnotatableThumbnails(thumbnails) {
    return thumbnails.filter((thumbnail) => THUMBNAIL_ANNOTATION_LANGUAGES.includes(thumbnail.language));
}

async function submitThumbnailGeneration() {
    const materialId = state.production.materialId;
    if (!materialId) return;

    const promptTemplate = document.getElementById('productionThumbnailPromptTemplate').value;
    if (!promptTemplate.includes('{{title}}') || !promptTemplate.includes('{{body}}')) {
        showToast('缩略图提示词模板必须保留 {{title}} 和 {{body}} 占位符', 'error');
        return;
    }
    if (!state.production.selectedLanguages.size) {
        showToast('请至少选择一种缩略图语言', 'error');
        return;
    }
    if (state.production.scope === 'selected' && !state.production.selectedPageRefs.size) {
        showToast('请至少选择一页', 'error');
        return;
    }

    try {
        const body = {
            scope: state.production.scope,
            pageRefs: [...state.production.selectedPageRefs].map((value) => parsePageRefValue(value)),
            languages: [...state.production.selectedLanguages],
            promptTemplate
        };
        const result = await requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/thumbnails`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        showToast(result.message || '已提交缩略图生成任务', 'success');
        await fetchProductionData(materialId, { silent: true });
        await loadMaterialLibrary();
    } catch (error) {
        console.error('提交缩略图生成任务失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

function openThumbnailCompanionModal(thumbnailId) {
    const thumbnail = getProductionThumbnailById(thumbnailId);
    if (!thumbnail) return;
    const availableLanguages = THUMBNAIL_LANGUAGE_OPTIONS.filter((language) => language !== thumbnail.language);
    state.companion.sourceThumbnailId = thumbnailId;
    state.companion.targetLanguage = availableLanguages[0] || '';
    state.companion.promptText = buildCompanionPrompt(state.companion.targetLanguage);
    renderThumbnailCompanionModal();
    document.getElementById('thumbnailCompanionModalOverlay').style.display = 'flex';
}

function closeThumbnailCompanionModal() {
    document.getElementById('thumbnailCompanionModalOverlay').style.display = 'none';
    state.companion.sourceThumbnailId = null;
    state.companion.targetLanguage = '';
    state.companion.promptText = '';
}

function buildCompanionPrompt(targetLanguage) {
    if (!targetLanguage) return '';
    if (targetLanguage === 'textless') {
        return state.config.thumbnail_companion_textless_prompt_template || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE;
    }

    const label = THUMBNAIL_LANGUAGE_LABELS[targetLanguage] || targetLanguage;
    return (state.config.thumbnail_companion_language_prompt_template || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE)
        .replaceAll('{{language}}', label);
}

function renderThumbnailCompanionModal() {
    const thumbnail = getProductionThumbnailById(state.companion.sourceThumbnailId);
    if (!thumbnail) return;

    const options = THUMBNAIL_LANGUAGE_OPTIONS
        .filter((language) => language !== thumbnail.language)
        .map((language) => `<option value="${language}" ${state.companion.targetLanguage === language ? 'selected' : ''}>${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[language])}</option>`)
        .join('');

    document.getElementById('thumbnailCompanionSourceInfo').textContent = `${THUMBNAIL_LANGUAGE_LABELS[thumbnail.language]} · 第 ${thumbnail.page} 页`;
    document.getElementById('thumbnailCompanionPreview').innerHTML = thumbnail.compressedJpgOutputUrl
        ? `<img src="${escapeHtml(thumbnail.compressedJpgOutputUrl)}" alt="${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[thumbnail.language])}">`
        : '<div class="thumbnail-placeholder">暂无预览</div>';
    document.getElementById('thumbnailCompanionTargetLanguage').innerHTML = options;
    document.getElementById('thumbnailCompanionPrompt').value = state.companion.promptText;
}

async function submitThumbnailCompanion() {
    const sourceThumbnailId = state.companion.sourceThumbnailId;
    if (!sourceThumbnailId) return;
    if (!state.companion.targetLanguage) {
        showToast('请选择配套图语言', 'error');
        return;
    }
    if (!state.companion.promptText.trim()) {
        showToast('配套图提示词不能为空', 'error');
        return;
    }

    try {
        const result = await requestJson(`${BASE_PATH}/api/material-library/thumbnails/${sourceThumbnailId}/companion`, {
            method: 'POST',
            body: JSON.stringify({
                targetLanguage: state.companion.targetLanguage,
                promptTemplate: state.companion.promptText
            })
        });
        showToast(result.message || '已提交配套图生成任务', 'success');
        closeThumbnailCompanionModal();
        await fetchProductionData(state.production.materialId, { silent: true });
    } catch (error) {
        console.error('提交配套图生成任务失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

function queueThumbnailAnnotation(thumbnailId) {
    state.production.annotationThumbnailId = String(thumbnailId);
    renderProductionAnnotationSection();
    submitThumbnailAnnotation();
}

async function submitThumbnailAnnotation() {
    const thumbnailId = state.production.annotationThumbnailId;
    if (!thumbnailId) {
        showToast('请选择要标定的位置缩略图', 'error');
        return;
    }

    try {
        const result = await requestJson(`${BASE_PATH}/api/material-library/thumbnails/${thumbnailId}/annotations`, {
            method: 'POST',
            body: JSON.stringify({})
        });
        showToast(result.message || '已提交位置标定任务', 'success');
        await fetchProductionData(state.production.materialId, { silent: true });
    } catch (error) {
        console.error('提交位置标定任务失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

async function deleteThumbnail(thumbnailId) {
    if (!window.confirm('确认删除这张缩略图吗？相关位置标定也会一起删除。')) return;

    try {
        await requestJson(`${BASE_PATH}/api/material-library/thumbnails/${thumbnailId}`, {
            method: 'DELETE'
        });
        showToast('缩略图已删除', 'success');
        if (state.companion.sourceThumbnailId === thumbnailId) {
            closeThumbnailCompanionModal();
        }
        await fetchProductionData(state.production.materialId, { silent: true });
    } catch (error) {
        console.error('删除缩略图失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

function getProductionThumbnailById(thumbnailId) {
    return (state.production.data?.thumbnails || []).find((thumbnail) => Number(thumbnail.id) === Number(thumbnailId)) || null;
}

function buildPageRefValue(materialPdfId, page) {
    return `${materialPdfId}:${page}`;
}

function parsePageRefValue(value) {
    const [materialPdfId, page] = String(value || '').split(':');
    return {
        materialPdfId: Number(materialPdfId),
        page: Number(page)
    };
}

function normalizeGroupValue(value) {
    return value && value !== 'ungrouped' ? Number(value) : null;
}

async function requestJson(url, options = {}, attachJsonHeader = true) {
    const requestOptions = { ...options };
    requestOptions.headers = {
        ...(attachJsonHeader ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    const response = await fetch(url, requestOptions);
    const rawText = await response.text();
    const result = rawText ? JSON.parse(rawText) : {};

    if (!response.ok || result.success === false) {
        throw new Error(result.error || result.message || `请求失败 (${response.status})`);
    }

    return result;
}

function formatDate(value) {
    if (!value) return '未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hour}:${minute}`;
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
window.openProductionModal = openProductionModal;
window.closeProductionModal = closeProductionModal;
window.openThumbnailCompanionModal = openThumbnailCompanionModal;
window.closeThumbnailCompanionModal = closeThumbnailCompanionModal;
window.submitThumbnailCompanion = submitThumbnailCompanion;
window.deleteThumbnail = deleteThumbnail;
window.queueThumbnailAnnotation = queueThumbnailAnnotation;
