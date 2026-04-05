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
    textless: '无文字',
    background: '纯背景图'
};

const THUMBNAIL_BASE_LANGUAGE_OPTIONS = ['zh_hans', 'zh_hant', 'en', 'textless'];
const THUMBNAIL_COMPANION_OPTIONS = ['zh_hans', 'zh_hant', 'en', 'textless', 'background'];
const THUMBNAIL_ANNOTATION_LANGUAGES = ['zh_hans', 'zh_hant', 'en'];
const REQUEST_LOADING_DELAY_MS = 180;
const DOUBAO_MODEL_NAME = 'doubao-seed-2-0-pro-260215';
const WAVESPEED_MODEL_NAME = 'google/nano-banana-2/edit';
const ATLAS_VIDEO_MODEL_NAME = 'seedance-v1.5-pro-image-to-video';
const VOLCENGINE_TTS_MODEL_NAME = 'volcengine-bigmodel-tts-v3';

const DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE = `你是教材关键内容提炼助手。
请根据给定 PDF 的逐页解析内容，提炼整个 PDF 的标题、是否正文、正文开始页、正文结束页、正文词数，并按页输出核心段落与建议配图。
返回必须是严格 JSON，不要输出 Markdown，不要解释，不要添加多余字段。
JSON 格式必须为：{"title":"...","main":true,"main_start":2,"main_end":10,"words_count":123,"pages":[{"page":1,"seg":{"seg1":{"seg1_pic":"...","seg1_text":"..."},"seg2":{"seg2_pic":"...","seg2_text":"..."}}}]}。
要求：
0. title 填整个 PDF 的标题；main 填这个 PDF 是否属于正文（true/false）；main_start 和 main_end 填正文起止页码；words_count 填正文词数（整数）。
1. pages 必须覆盖输入中的每一页，page 使用数字页码。
2. seg 中每个 segN 只包含 segN_pic 和 segN_text 两个字段；没有内容时可以省略对应 segN。
3. segN_pic 写该段最适合的配图或画面描述，segN_text 写该段核心内容，保持精炼，不要编造。
4. 尽量保留原文主要语言，不要额外解释。
5. 不要返回 words 字段，words 由系统根据 **Words to Know** 与当前页 seg 内容自动匹配。

教材名：{{material_title}}
PDF 名：{{pdf_name}}

逐页解析内容：
{{page_source}}`;

const DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE = `用风格：“童话绘本感的信息图插画风（whimsical storybook infographic）”，生成包含如下内容及内容说明的图片，需要逻辑合理，文字不要太小。童话绘本风信息图，手绘水彩插画，柔和粉彩配色，治愈系幻想田园，复古儿童书插图风，细腻线稿，温暖发光氛围，高细节叙事海报，梦幻科普信息图。纯英文。现在图片内容如下：
【教材组】
{{material_group}}
【教材名】
{{material_name}}
【关键词】
{{keywods}}
【标题】
{{title}}
【正文】
{{body}}`;

const DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE = '{{language}}配套图：将这个图中的英文全部改为{{language}}；';
const DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE = '无内容配套图：将这个图中除了标题以外的文字去掉。';
const DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE = '生成背景图：将这个图中除了标题以外的文字和文字对应的图片去掉。';
const DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE = `找出如下句子在图中的位置，并找出各个句子对应图片的位置（不需要返回标注图，只返回格式化 JSON 即可）。

<标题内容>
{{title}}

<正文内容，每个seg一段>
{{segments}}

要求：
1. 返回严格 JSON，不要解释。
2. JSON 结构固定为 {"items":[{"sentence":"...","sentence_role":"title|seg","sentence_order":0,"text_box":{"x":0.1,"y":0.1,"width":0.2,"height":0.1},"image_box":{"x":0.3,"y":0.2,"width":0.25,"height":0.18}}]}。
3. 坐标必须是 0-1 的归一化框。
4. sentence 必须与给定标题或正文段落完全一致。
5. 每个标题或正文段落都要返回一条记录。`;
const DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE = `基于这张教材缩略图生成一个 16:9 的短视频镜头，首帧和尾帧保持统一，画面做自然轻微动态变化。
保持童话绘本感的信息图插画风，镜头稳定、构图清晰、节奏舒缓，不要新增画面外的新文字。
【教材组】
{{material_group}}
【教材名】
{{material_name}}
【关键词】
{{keywods}}
【标题】
{{title}}
【正文】
{{body}}`;

const DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE = `用简短语言解释如下词汇，json返回。每个词返回：词义数组（meaning，必须是 JSON 数组；如果有多个义项就拆成多项，每项包含 type 和 meaning）、词性汇总（type，例如不及物动词 / 可数名词）、原型（prototype）以及当前关键词与原型的关系（relation，例如 plural of body、third-person singular of swim 等）。例如：{"meaning":[{"type":"adjective","meaning":"xxx"}], "type":"adjective", "prototype":"body", "relation":"plural of body"}

词汇：{{keywords}}`;

const PROMPT_TOKEN_GROUPS = {
    materialKeyContent: [
        { token: '{{material_title}}', title: '教材名称' },
        { token: '{{pdf_name}}', title: 'PDF 名称' },
        { token: '{{page_source}}', title: '逐页解析内容' }
    ],
    keywordExplain: [
        { token: '{{keywords}}', title: '当前 PDF 的关键词列表' }
    ],
    summary: [
        { token: '{{material_group}}', title: '教材组名称' },
        { token: '{{material_name}}', title: '教材名称' },
        { token: '{{keywords}}', title: '关键词（推荐写法）' },
        { token: '{{keywods}}', title: '关键词（兼容旧写法）' },
        { token: '{{title}}', title: '标题' },
        { token: '{{body}}', title: '正文' }
    ],
    video: [
        { token: '{{material_group}}', title: '教材组名称' },
        { token: '{{material_name}}', title: '教材名称' },
        { token: '{{keywords}}', title: '关键词（推荐写法）' },
        { token: '{{keywods}}', title: '关键词（兼容旧写法）' },
        { token: '{{title}}', title: '标题' },
        { token: '{{body}}', title: '正文' }
    ],
    annotation: [
        { token: '{{title}}', title: '标题' },
        { token: '{{segments}}', title: '分段正文' },
        { token: '{{body}}', title: '完整正文' }
    ],
    companionLanguage: [
        { token: '{{language}}', title: '目标语言' }
    ]
};

const PROMPT_TOKEN_INPUTS = [
    { id: 'materialKeyContentPromptTemplate', group: 'materialKeyContent' },
    { id: 'materialKeywordExplainPromptTemplate', group: 'keywordExplain' },
    { id: 'summaryImagePromptTemplate', group: 'summary' },
    { id: 'thumbnailVideoPromptTemplate', group: 'video' },
    { id: 'thumbnailCompanionLanguagePromptTemplate', group: 'companionLanguage' },
    { id: 'thumbnailAnnotationPromptTemplate', group: 'annotation' },
    { id: 'productionThumbnailPromptTemplate', group: 'summary' },
    { id: 'productionVideoPromptTemplate', group: 'video' },
    { id: 'productionAnnotationPromptTemplate', group: 'annotation' },
    { id: 'thumbnailCompanionPrompt', group: 'companionLanguage' }
];

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
        cny_to_pesos: null,
        dollars_exchange: 7.12,
        excluded_students: [],
        hide_remaining_students: [],
        auto_feedback_prompt: '',
        auto_feedback_schema: null,
        material_key_content_prompt_template: DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE,
        material_keyword_explain_prompt_template: DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE,
        summary_image_prompt_template: DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
        thumbnail_video_prompt_template: DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE,
        thumbnail_companion_language_prompt_template: DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE,
        thumbnail_companion_textless_prompt_template: DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE,
        thumbnail_companion_background_prompt_template: DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE,
        thumbnail_annotation_prompt_template: DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE
    },
    filters: {
        keyword: '',
        groupId: ''
    },
    activeTab: 'management',
    groupPromptGroupId: '',
    openMaterialIds: new Set(),
    listPollTimer: null,
    listLoading: false,
    production: {
        materialId: null,
        data: null,
        loading: false,
        error: '',
        scope: 'all',
        selectedPageRefs: new Set(),
        selectedLanguages: new Set(),
        thumbnailPromptTemplate: DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
        videoPromptTemplate: DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE,
        videoSourceThumbnailId: '',
        annotationPromptTemplate: DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE,
        annotationThumbnailId: '',
        audioVoiceType: '',
        pollTimer: null
    },
    companion: {
        sourceThumbnailId: null,
        targetLanguage: '',
        promptText: ''
    },
    requestLoading: {
        depth: 0,
        timer: null,
        visible: false,
        title: '请稍候',
        message: '正在处理请求...'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initPromptTokenToolbars();
    bindEvents();
    loadMaterialLibraryConfig();
    loadMaterialLibrary();
});

function insertTokenAtCursor(textarea, token) {
    if (!textarea) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const nextValue = `${textarea.value.slice(0, start)}${token}${textarea.value.slice(end)}`;
    textarea.value = nextValue;
    textarea.focus();
    const cursor = start + token.length;
    textarea.setSelectionRange(cursor, cursor);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function initPromptTokenToolbars() {
    PROMPT_TOKEN_INPUTS.forEach(({ id, group }) => {
        const textarea = document.getElementById(id);
        if (!textarea || textarea.dataset.promptTokenToolbarReady === 'true') {
            return;
        }

        const tokens = PROMPT_TOKEN_GROUPS[group] || [];
        if (!tokens.length) {
            return;
        }

        const toolbar = document.createElement('div');
        toolbar.className = 'template-token-toolbar';

        const label = document.createElement('span');
        label.className = 'template-token-toolbar-label';
        label.textContent = '可插入占位符';
        toolbar.appendChild(label);

        tokens.forEach(({ token, title }) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'template-token-btn';
            button.textContent = token;
            button.title = title || token;
            button.addEventListener('click', () => insertTokenAtCursor(textarea, token));
            toolbar.appendChild(button);
        });

        textarea.parentNode.insertBefore(toolbar, textarea);
        textarea.dataset.promptTokenToolbarReady = 'true';
    });
}

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
    document.getElementById('materialKeywordExplainPromptTemplate').addEventListener('input', () => {
        state.config.material_keyword_explain_prompt_template = document.getElementById('materialKeywordExplainPromptTemplate').value;
    });
    document.getElementById('materialKeywordExplainPromptSaveBtn').addEventListener('click', saveMaterialKeywordExplainPromptTemplate);
    document.getElementById('materialKeywordExplainPromptResetBtn').addEventListener('click', resetMaterialKeywordExplainPromptTemplate);

    document.getElementById('groupPromptGroupId').addEventListener('change', (event) => {
        state.groupPromptGroupId = event.target.value;
        syncGroupScopedPromptInputs();
    });
    document.getElementById('summaryImagePromptSaveBtn').addEventListener('click', saveThumbnailPromptTemplate);
    document.getElementById('summaryImagePromptResetBtn').addEventListener('click', resetThumbnailPromptTemplate);
    document.getElementById('thumbnailVideoPromptSaveBtn').addEventListener('click', saveThumbnailVideoPromptTemplate);
    document.getElementById('thumbnailVideoPromptResetBtn').addEventListener('click', resetThumbnailVideoPromptTemplate);

    document.getElementById('thumbnailCompanionLanguagePromptTemplate').addEventListener('input', () => {
        state.config.thumbnail_companion_language_prompt_template = document.getElementById('thumbnailCompanionLanguagePromptTemplate').value;
    });
    document.getElementById('thumbnailCompanionTextlessPromptTemplate').addEventListener('input', () => {
        state.config.thumbnail_companion_textless_prompt_template = document.getElementById('thumbnailCompanionTextlessPromptTemplate').value;
    });
    document.getElementById('thumbnailCompanionBackgroundPromptTemplate').addEventListener('input', () => {
        state.config.thumbnail_companion_background_prompt_template = document.getElementById('thumbnailCompanionBackgroundPromptTemplate').value;
    });
    document.getElementById('thumbnailCompanionPromptSaveBtn').addEventListener('click', saveThumbnailCompanionPromptTemplates);
    document.getElementById('thumbnailCompanionPromptResetBtn').addEventListener('click', resetThumbnailCompanionPromptTemplates);
    document.getElementById('thumbnailAnnotationPromptSaveBtn').addEventListener('click', saveThumbnailAnnotationPromptTemplate);
    document.getElementById('thumbnailAnnotationPromptResetBtn').addEventListener('click', resetThumbnailAnnotationPromptTemplate);

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
        renderProductionGallery();
        renderProductionVideoSection();
        renderProductionAnnotationSection();
        renderProductionAudioSection();
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
        renderProductionVideoSection();
        renderProductionAudioSection();
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
    document.getElementById('productionThumbnailPromptSaveBtn').addEventListener('click', saveProductionThumbnailPromptTemplate);
    document.getElementById('productionThumbnailPromptResetBtn').addEventListener('click', resetProductionThumbnailPromptTemplate);
    document.getElementById('productionVideoPromptTemplate').addEventListener('input', (event) => {
        state.production.videoPromptTemplate = event.target.value;
    });
    document.getElementById('productionVideoPromptSaveBtn').addEventListener('click', saveProductionVideoPromptTemplate);
    document.getElementById('productionVideoPromptResetBtn').addEventListener('click', resetProductionVideoPromptTemplate);
    document.getElementById('productionVideoSourceThumbnailSelect').addEventListener('change', (event) => {
        state.production.videoSourceThumbnailId = event.target.value;
        renderProductionVideoSection();
    });
    document.getElementById('productionGenerateVideoBtn').addEventListener('click', submitThumbnailVideoGeneration);
    document.getElementById('productionAnnotationPromptTemplate').addEventListener('input', (event) => {
        state.production.annotationPromptTemplate = event.target.value;
    });
    document.getElementById('productionAnnotationPromptSaveBtn').addEventListener('click', saveProductionAnnotationPromptTemplate);
    document.getElementById('productionAnnotationPromptResetBtn').addEventListener('click', resetProductionAnnotationPromptTemplate);
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
    document.getElementById('productionAudioVoiceSelect').addEventListener('change', (event) => {
        state.production.audioVoiceType = event.target.value;
        renderProductionAudioSection();
    });
    document.getElementById('productionGenerateAudioBtn').addEventListener('click', submitMaterialAudioGeneration);

    document.getElementById('thumbnailCompanionTargetLanguage').addEventListener('change', (event) => {
        state.companion.targetLanguage = event.target.value;
        state.companion.promptText = buildCompanionPrompt(state.companion.targetLanguage);
        renderThumbnailCompanionModal();
    });
    document.getElementById('thumbnailCompanionPrompt').addEventListener('input', (event) => {
        state.companion.promptText = event.target.value;
    });
    document.getElementById('thumbnailCompanionPromptResetBtnInline').addEventListener('click', resetProductionCompanionPromptTemplate);
    document.getElementById('thumbnailCompanionPromptSaveBtnInline').addEventListener('click', saveProductionCompanionPromptTemplate);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            scheduleMaterialListPolling();
            scheduleProductionPolling();
        } else {
            stopMaterialListPolling();
            stopProductionPolling();
        }
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
            material_keyword_explain_prompt_template: config.material_keyword_explain_prompt_template || DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE,
            summary_image_prompt_template: config.summary_image_prompt_template || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
            thumbnail_video_prompt_template: config.thumbnail_video_prompt_template || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE,
            thumbnail_companion_language_prompt_template: config.thumbnail_companion_language_prompt_template || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE,
            thumbnail_companion_textless_prompt_template: config.thumbnail_companion_textless_prompt_template || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE,
            thumbnail_companion_background_prompt_template: config.thumbnail_companion_background_prompt_template || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE,
            thumbnail_annotation_prompt_template: config.thumbnail_annotation_prompt_template || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE
        };
    } catch (error) {
        console.error('加载教材配置失败:', error);
    }

    syncConfigInputs();
}

function syncConfigInputs() {
    document.getElementById('materialKeyContentPromptTemplate').value = state.config.material_key_content_prompt_template;
    document.getElementById('materialKeywordExplainPromptTemplate').value = state.config.material_keyword_explain_prompt_template;
    document.getElementById('thumbnailVideoPromptTemplate').value = state.config.thumbnail_video_prompt_template;
    document.getElementById('thumbnailCompanionLanguagePromptTemplate').value = state.config.thumbnail_companion_language_prompt_template;
    document.getElementById('thumbnailCompanionTextlessPromptTemplate').value = state.config.thumbnail_companion_textless_prompt_template;
    document.getElementById('thumbnailCompanionBackgroundPromptTemplate').value = state.config.thumbnail_companion_background_prompt_template;
    renderGroupPromptGroupOptions();
    syncGroupScopedPromptInputs();
}

function ensureGroupPromptGroupId(preferredValue = state.groupPromptGroupId) {
    if (!state.groups.length) {
        state.groupPromptGroupId = '';
        return '';
    }

    const preferred = String(preferredValue || '');
    const exists = state.groups.some((group) => String(group.id) === preferred);
    state.groupPromptGroupId = exists ? preferred : String(state.groups[0].id);
    return state.groupPromptGroupId;
}

function renderGroupPromptGroupOptions() {
    const select = document.getElementById('groupPromptGroupId');
    const selectedValue = ensureGroupPromptGroupId(select?.value || state.groupPromptGroupId);

    if (!state.groups.length) {
        select.innerHTML = '<option value="">暂无教材组</option>';
        select.value = '';
        select.disabled = true;
        return;
    }

    select.disabled = false;
    select.innerHTML = state.groups.map((group) => `
        <option value="${group.id}" ${String(group.id) === String(selectedValue) ? 'selected' : ''}>${escapeHtml(group.name)}</option>
    `).join('');
    select.value = selectedValue;
}

function getSelectedGroupPromptGroup() {
    const selectedId = ensureGroupPromptGroupId();
    return state.groups.find((group) => String(group.id) === String(selectedId)) || null;
}

function syncGroupScopedPromptInputs() {
    const selectedGroup = getSelectedGroupPromptGroup();
    const thumbnailPromptTemplate = selectedGroup?.thumbnailPromptTemplate
        || state.config.summary_image_prompt_template
        || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE;
    const videoPromptTemplate = selectedGroup?.thumbnailVideoPromptTemplate
        || state.config.thumbnail_video_prompt_template
        || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE;
    const companionLanguagePromptTemplate = selectedGroup?.thumbnailCompanionLanguagePromptTemplate
        || state.config.thumbnail_companion_language_prompt_template
        || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE;
    const companionTextlessPromptTemplate = selectedGroup?.thumbnailCompanionTextlessPromptTemplate
        || state.config.thumbnail_companion_textless_prompt_template
        || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE;
    const companionBackgroundPromptTemplate = selectedGroup?.thumbnailCompanionBackgroundPromptTemplate
        || state.config.thumbnail_companion_background_prompt_template
        || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE;
    const annotationPromptTemplate = selectedGroup?.thumbnailAnnotationPromptTemplate
        || state.config.thumbnail_annotation_prompt_template
        || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE;

    document.getElementById('summaryImagePromptTemplate').value = thumbnailPromptTemplate;
    document.getElementById('thumbnailVideoPromptTemplate').value = videoPromptTemplate;
    document.getElementById('thumbnailCompanionLanguagePromptTemplate').value = companionLanguagePromptTemplate;
    document.getElementById('thumbnailCompanionTextlessPromptTemplate').value = companionTextlessPromptTemplate;
    document.getElementById('thumbnailCompanionBackgroundPromptTemplate').value = companionBackgroundPromptTemplate;
    document.getElementById('thumbnailAnnotationPromptTemplate').value = annotationPromptTemplate;
}

function resetMaterialKeyContentPromptTemplate() {
    state.config.material_key_content_prompt_template = DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE;
    syncConfigInputs();
    showToast('关键内容提炼提示词模板已恢复默认，记得点击保存。', 'info');
}

function resetMaterialKeywordExplainPromptTemplate() {
    state.config.material_keyword_explain_prompt_template = DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE;
    syncConfigInputs();
    showToast('关键词解释提示词模板已恢复默认，记得点击保存。', 'info');
}

function resetThumbnailPromptTemplate() {
    document.getElementById('summaryImagePromptTemplate').value = DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE;
    showToast('缩略图提示词模板已恢复默认，记得点击保存到当前教材组。', 'info');
}

function resetThumbnailVideoPromptTemplate() {
    document.getElementById('thumbnailVideoPromptTemplate').value = DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE;
    showToast('视频提示词模板已恢复默认，记得点击保存到当前教材组。', 'info');
}

function resetThumbnailCompanionPromptTemplates() {
    document.getElementById('thumbnailCompanionLanguagePromptTemplate').value = DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE;
    document.getElementById('thumbnailCompanionTextlessPromptTemplate').value = DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE;
    document.getElementById('thumbnailCompanionBackgroundPromptTemplate').value = DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE;
    showToast('配套图提示词模板已恢复默认，记得点击保存到当前教材组。', 'info');
}

function resetThumbnailAnnotationPromptTemplate() {
    document.getElementById('thumbnailAnnotationPromptTemplate').value = DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE;
    showToast('位置标定提示词模板已恢复默认，记得点击保存到当前教材组。', 'info');
}

async function buildConfigSavePayload(overrides = {}) {
    const result = await requestJson(`${BASE_PATH}/api/config`);
    const currentConfig = result.config || {};
    const resolvedCnyToPesos = Number.isFinite(Number(currentConfig.cny_to_pesos)) && Number(currentConfig.cny_to_pesos) > 0
        ? Number(currentConfig.cny_to_pesos)
        : (Number.isFinite(Number(state.config.cny_to_pesos)) && Number(state.config.cny_to_pesos) > 0
            ? Number(state.config.cny_to_pesos)
            : null);

    return {
        cny_to_pesos: resolvedCnyToPesos,
        dollars_exchange: Number(currentConfig.dollars_exchange || state.config.dollars_exchange || 7.12),
        excluded_students: Array.isArray(currentConfig.excluded_students) ? currentConfig.excluded_students : [],
        hide_remaining_students: Array.isArray(currentConfig.hide_remaining_students) ? currentConfig.hide_remaining_students : [],
        auto_feedback_prompt: currentConfig.auto_feedback_prompt || state.config.auto_feedback_prompt || '',
        auto_feedback_schema: currentConfig.auto_feedback_schema ?? state.config.auto_feedback_schema ?? null,
        material_key_content_prompt_template: currentConfig.material_key_content_prompt_template || state.config.material_key_content_prompt_template || DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE,
        material_keyword_explain_prompt_template: currentConfig.material_keyword_explain_prompt_template || state.config.material_keyword_explain_prompt_template || DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE,
        summary_image_prompt_template: currentConfig.summary_image_prompt_template || state.config.summary_image_prompt_template || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
        thumbnail_video_prompt_template: currentConfig.thumbnail_video_prompt_template || state.config.thumbnail_video_prompt_template || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE,
        thumbnail_companion_language_prompt_template: currentConfig.thumbnail_companion_language_prompt_template || state.config.thumbnail_companion_language_prompt_template || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE,
        thumbnail_companion_textless_prompt_template: currentConfig.thumbnail_companion_textless_prompt_template || state.config.thumbnail_companion_textless_prompt_template || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE,
        thumbnail_companion_background_prompt_template: currentConfig.thumbnail_companion_background_prompt_template || state.config.thumbnail_companion_background_prompt_template || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE,
        thumbnail_annotation_prompt_template: currentConfig.thumbnail_annotation_prompt_template || state.config.thumbnail_annotation_prompt_template || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE,
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

async function saveMaterialKeywordExplainPromptTemplate() {
    const promptTemplate = document.getElementById('materialKeywordExplainPromptTemplate').value;
    if (!promptTemplate.includes('{{keywords}}')) {
        showToast('关键词解释提示词模板必须保留 {{keywords}} 占位符', 'error');
        return;
    }

    await saveConfigWithOverrides({
        material_keyword_explain_prompt_template: promptTemplate
    }, '关键词解释提示词模板已保存');
}

async function saveThumbnailPromptTemplate() {
    const promptTemplate = document.getElementById('summaryImagePromptTemplate').value;
    if (!promptTemplate.includes('{{title}}') || !promptTemplate.includes('{{body}}')) {
        showToast('缩略图提示词模板必须保留 {{title}} 和 {{body}} 占位符', 'error');
        return;
    }

    await saveMaterialGroupPromptTemplates(
        state.groupPromptGroupId,
        { thumbnailPromptTemplate: promptTemplate },
        '缩略图提示词模板已保存到当前教材组'
    );
}

async function saveThumbnailVideoPromptTemplate() {
    const promptTemplate = document.getElementById('thumbnailVideoPromptTemplate').value;
    await saveMaterialGroupPromptTemplates(
        state.groupPromptGroupId,
        { videoPromptTemplate: promptTemplate },
        '视频提示词模板已保存到当前教材组'
    );
}

async function saveProductionThumbnailPromptTemplate() {
    const promptTemplate = document.getElementById('productionThumbnailPromptTemplate').value;
    if (!promptTemplate.includes('{{title}}') || !promptTemplate.includes('{{body}}')) {
        showToast('缩略图提示词模板必须保留 {{title}} 和 {{body}} 占位符', 'error');
        return;
    }

    const groupId = state.production.data?.material?.groupId;
    const saved = await saveMaterialGroupPromptTemplates(
        groupId,
        { thumbnailPromptTemplate: promptTemplate },
        '已保存为当前教材组缩略图模板'
    );
    if (!saved) return;
    state.production.thumbnailPromptTemplate = promptTemplate;
    if (state.production.data?.promptTemplates) {
        state.production.data.promptTemplates.thumbnail = promptTemplate;
    }
    renderProductionThumbnailSection();
}

function resetProductionThumbnailPromptTemplate() {
    const groupTemplate = state.production.data?.promptTemplates?.thumbnail
        || state.config.summary_image_prompt_template
        || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE;
    state.production.thumbnailPromptTemplate = groupTemplate;
    renderProductionThumbnailSection();
    showToast('已恢复为当前教材组缩略图模板', 'info');
}

async function saveProductionVideoPromptTemplate() {
    const promptTemplate = document.getElementById('productionVideoPromptTemplate').value;
    const groupId = state.production.data?.material?.groupId;
    const saved = await saveMaterialGroupPromptTemplates(
        groupId,
        { videoPromptTemplate: promptTemplate },
        '已保存为当前教材组视频模板'
    );
    if (!saved) return;
    state.production.videoPromptTemplate = promptTemplate;
    if (state.production.data?.promptTemplates) {
        state.production.data.promptTemplates.video = promptTemplate;
    }
    renderProductionVideoSection();
}

function resetProductionVideoPromptTemplate() {
    const groupTemplate = state.production.data?.promptTemplates?.video
        || state.config.thumbnail_video_prompt_template
        || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE;
    state.production.videoPromptTemplate = groupTemplate;
    renderProductionVideoSection();
    showToast('已恢复为当前教材组视频模板', 'info');
}

async function saveThumbnailCompanionPromptTemplates() {
    const languagePrompt = document.getElementById('thumbnailCompanionLanguagePromptTemplate').value;
    const textlessPrompt = document.getElementById('thumbnailCompanionTextlessPromptTemplate').value;
    const backgroundPrompt = document.getElementById('thumbnailCompanionBackgroundPromptTemplate').value;
    if (!languagePrompt.includes('{{language}}')) {
        showToast('语言配套图模板必须保留 {{language}} 占位符', 'error');
        return;
    }
    if (!textlessPrompt.trim()) {
        showToast('无内容配套图模板不能为空', 'error');
        return;
    }
    if (!backgroundPrompt.trim()) {
        showToast('纯背景图模板不能为空', 'error');
        return;
    }

    await saveMaterialGroupPromptTemplates(
        state.groupPromptGroupId,
        {
            thumbnailCompanionLanguagePromptTemplate: languagePrompt,
            thumbnailCompanionTextlessPromptTemplate: textlessPrompt,
            thumbnailCompanionBackgroundPromptTemplate: backgroundPrompt
        },
        '配套图提示词模板已保存到当前教材组'
    );
}

async function saveThumbnailAnnotationPromptTemplate() {
    const promptTemplate = document.getElementById('thumbnailAnnotationPromptTemplate').value;
    if (!isValidAnnotationPromptTemplate(promptTemplate)) {
        showToast('位置标定提示词模板必须保留 {{title}}，并保留 {{segments}} 或 {{body}} 占位符', 'error');
        return;
    }

    await saveMaterialGroupPromptTemplates(
        state.groupPromptGroupId,
        { annotationPromptTemplate: promptTemplate },
        '位置标定提示词模板已保存到当前教材组'
    );
}

async function saveProductionAnnotationPromptTemplate() {
    const promptTemplate = document.getElementById('productionAnnotationPromptTemplate').value;
    if (!isValidAnnotationPromptTemplate(promptTemplate)) {
        showToast('位置标定提示词模板必须保留 {{title}}，并保留 {{segments}} 或 {{body}} 占位符', 'error');
        return;
    }

    const groupId = state.production.data?.material?.groupId;
    const saved = await saveMaterialGroupPromptTemplates(
        groupId,
        { annotationPromptTemplate: promptTemplate },
        '已保存为当前教材组位置标定模板'
    );
    if (!saved) return;
    state.production.annotationPromptTemplate = promptTemplate;
    if (state.production.data?.promptTemplates) {
        state.production.data.promptTemplates.annotation = promptTemplate;
    }
    renderProductionAnnotationSection();
}

function resetProductionAnnotationPromptTemplate() {
    const groupTemplate = state.production.data?.promptTemplates?.annotation
        || state.config.thumbnail_annotation_prompt_template
        || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE;
    state.production.annotationPromptTemplate = groupTemplate;
    renderProductionAnnotationSection();
    showToast('已恢复为当前教材组位置标定模板', 'info');
}

async function saveConfigWithOverrides(overrides, successMessage) {
    try {
        const payload = await withRequestLoading(async () => {
            const nextPayload = await buildConfigSavePayload(overrides);
            await requestJson(`${BASE_PATH}/api/config`, {
                method: 'POST',
                body: JSON.stringify(nextPayload)
            });
            return nextPayload;
        }, {
            title: '保存中',
            message: '正在保存教材页的提示词模板...'
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

function buildGroupPromptSavePayload(groupId, overrides = {}) {
    const group = state.groups.find((item) => String(item.id) === String(groupId));
    return {
        thumbnailPromptTemplate: overrides.thumbnailPromptTemplate !== undefined
            ? overrides.thumbnailPromptTemplate
            : (group?.thumbnailPromptTemplate || state.config.summary_image_prompt_template || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE),
        videoPromptTemplate: overrides.videoPromptTemplate !== undefined
            ? overrides.videoPromptTemplate
            : (group?.thumbnailVideoPromptTemplate || state.config.thumbnail_video_prompt_template || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE),
        thumbnailCompanionLanguagePromptTemplate: overrides.thumbnailCompanionLanguagePromptTemplate !== undefined
            ? overrides.thumbnailCompanionLanguagePromptTemplate
            : (group?.thumbnailCompanionLanguagePromptTemplate || state.config.thumbnail_companion_language_prompt_template || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE),
        thumbnailCompanionTextlessPromptTemplate: overrides.thumbnailCompanionTextlessPromptTemplate !== undefined
            ? overrides.thumbnailCompanionTextlessPromptTemplate
            : (group?.thumbnailCompanionTextlessPromptTemplate || state.config.thumbnail_companion_textless_prompt_template || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE),
        thumbnailCompanionBackgroundPromptTemplate: overrides.thumbnailCompanionBackgroundPromptTemplate !== undefined
            ? overrides.thumbnailCompanionBackgroundPromptTemplate
            : (group?.thumbnailCompanionBackgroundPromptTemplate || state.config.thumbnail_companion_background_prompt_template || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE),
        annotationPromptTemplate: overrides.annotationPromptTemplate !== undefined
            ? overrides.annotationPromptTemplate
            : (group?.thumbnailAnnotationPromptTemplate || state.config.thumbnail_annotation_prompt_template || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE)
    };
}

function applySavedGroupPromptTemplates(groupId, payload) {
    state.groups = state.groups.map((group) => (
        String(group.id) === String(groupId)
            ? {
                ...group,
                thumbnailPromptTemplate: payload.thumbnailPromptTemplate,
                thumbnailVideoPromptTemplate: payload.videoPromptTemplate,
                thumbnailCompanionLanguagePromptTemplate: payload.thumbnailCompanionLanguagePromptTemplate,
                thumbnailCompanionTextlessPromptTemplate: payload.thumbnailCompanionTextlessPromptTemplate,
                thumbnailCompanionBackgroundPromptTemplate: payload.thumbnailCompanionBackgroundPromptTemplate,
                thumbnailAnnotationPromptTemplate: payload.annotationPromptTemplate
            }
            : group
    ));
}

async function saveMaterialGroupPromptTemplates(groupId, overrides, successMessage) {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) {
        showToast('请先选择教材组后再保存模板', 'error');
        return false;
    }

    const payload = buildGroupPromptSavePayload(normalizedGroupId, overrides);
    try {
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/groups/${normalizedGroupId}/prompt-templates`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            }),
            {
                title: '保存模板',
                message: '正在保存当前教材组的提示词模板...'
            }
        );
        applySavedGroupPromptTemplates(normalizedGroupId, payload);
        renderGroupOptions();
        syncGroupScopedPromptInputs();
        showToast(successMessage, 'success');
        return true;
    } catch (error) {
        console.error('保存教材组提示词模板失败:', error);
        showToast(`保存失败: ${error.message}`, 'error');
        return false;
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

async function loadMaterialLibrary({ forceLoading = false } = {}) {
    const materialsContainer = document.getElementById('materialsContainer');
    const shouldShowLoading = forceLoading || (!state.listLoading && !state.materials.length);
    state.openMaterialIds = captureOpenMaterialIds();
    state.listLoading = true;

    if (shouldShowLoading) {
        materialsContainer.innerHTML = '<div class="empty-state">正在加载教材列表...</div>';
    }

    try {
        const result = await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials`),
            {
                title: '加载教材',
                message: '正在加载教材列表和状态，请稍候...',
                enabled: shouldShowLoading
            }
        );
        state.groups = result.data.groups || [];
        state.materials = result.data.materials || [];
        ensureGroupPromptGroupId();
        renderStats();
        renderGroupOptions();
        syncGroupScopedPromptInputs();
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

        scheduleMaterialListPolling();
    } catch (error) {
        console.error('加载教材库失败:', error);
        stopMaterialListPolling();
        if (!state.materials.length) {
            materialsContainer.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(error.message)}</div>`;
            showToast(`加载教材库失败: ${error.message}`, 'error');
        }
    } finally {
        state.listLoading = false;
    }
}

function captureOpenMaterialIds() {
    const detailsElements = Array.from(document.querySelectorAll('#materialsContainer details.material-card[open]'));
    return new Set(
        detailsElements
            .map((element) => Number.parseInt(element.dataset.materialId, 10))
            .filter(Boolean)
    );
}

function hasPendingMaterialListActivity() {
    return state.materials.some((material) => {
        const materialBusy = ['queued', 'processing'].includes(material.parseStatus) || material.storageStatus === 'moving';
        const pdfBusy = (material.pdfs || []).some((pdf) => (
            ['queued', 'processing'].includes(pdf.parseStatus)
            || ['queued', 'processing'].includes(pdf.structuredContentStatus)
        ));
        const assetBusy = Object.values(material.assetStatus || {}).some((asset) => (
            ['queued', 'processing'].includes(asset.status)
        ));
        return materialBusy || pdfBusy || assetBusy;
    });
}

function scheduleMaterialListPolling() {
    stopMaterialListPolling();
    if (document.visibilityState !== 'visible') return;
    if (!hasPendingMaterialListActivity()) return;

    state.listPollTimer = window.setTimeout(async () => {
        state.listPollTimer = null;
        if (state.listLoading) {
            scheduleMaterialListPolling();
            return;
        }

        try {
            await loadMaterialLibrary();
        } catch (_error) {
            // loadMaterialLibrary handles its own errors
        }
    }, 4000);
}

function stopMaterialListPolling() {
    if (state.listPollTimer) {
        window.clearTimeout(state.listPollTimer);
        state.listPollTimer = null;
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
    renderGroupPromptGroupOptions();
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
    const isOpen = state.openMaterialIds.has(material.id) || material.storageStatus !== 'ready';

    return `
        <details class="material-card" data-material-id="${material.id}" ${isOpen ? 'open' : ''}>
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
                                <th style="min-width: 240px;">解析信息</th>
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
    const canRegenerateKeyContent = pdf.parseStatus === 'ready'
        && !['queued', 'processing'].includes(pdf.structuredContentStatus);

    if (pdf.sourceUrl) links.push(`<a href="${escapeHtml(pdf.sourceUrl)}" target="_blank" rel="noopener">原始 PDF</a>`);
    if (pdf.coverUrl) links.push(`<a href="${escapeHtml(pdf.coverUrl)}" target="_blank" rel="noopener">封面图</a>`);
    if (pdf.contentUrl) links.push(`<a href="${escapeHtml(pdf.contentUrl)}" target="_blank" rel="noopener">正文 Markdown</a>`);
    if (pdf.pagesIndexUrl) links.push(`<a href="${escapeHtml(pdf.pagesIndexUrl)}" target="_blank" rel="noopener">逐页内容 JSON</a>`);
    if (pdf.parseUrl) links.push(`<a href="${escapeHtml(pdf.parseUrl)}" target="_blank" rel="noopener">parse.json</a>`);
    if (pdf.structuredContentUrl) links.push(`<a href="${escapeHtml(pdf.structuredContentUrl)}" target="_blank" rel="noopener">关键内容 JSON</a>`);

    const mainLabel = pdf.main === null || pdf.main === undefined
        ? '待识别'
        : (pdf.main ? '是' : '否');
    const mainRangeLabel = pdf.main === false
        ? '非正文'
        : ((pdf.mainStart && pdf.mainEnd)
            ? (pdf.mainStart === pdf.mainEnd ? `第 ${pdf.mainStart} 页` : `第 ${pdf.mainStart} - ${pdf.mainEnd} 页`)
            : '待识别');
    const wordsCountLabel = pdf.wordsCount === null || pdf.wordsCount === undefined
        ? '待识别'
        : String(pdf.wordsCount);
    const keywordsLabel = Array.isArray(pdf.keywords) && pdf.keywords.length
        ? pdf.keywords.join(', ')
        : (pdf.structuredContentStatus === 'ready' ? '无' : '待提炼');
    const keywordMeaningLabel = pdf.structuredContentStatus === 'ready' || (Array.isArray(pdf.keywords) && pdf.keywords.length)
        ? `${Number(pdf.keywordMeaningSuccessCount || 0)} / ${Number(pdf.keywordMeaningTotalCount ?? (Array.isArray(pdf.keywords) ? pdf.keywords.length : 0))}`
        : '待提炼';
    const parsedInfoHtml = `
        <div class="pdf-meta-list">
            <div class="pdf-meta-item"><strong>标题：</strong>${escapeHtml(pdf.title || '待识别')}</div>
            <div class="pdf-meta-item"><strong>正文：</strong>${escapeHtml(mainLabel)}</div>
            <div class="pdf-meta-item"><strong>正文页：</strong>${escapeHtml(mainRangeLabel)}</div>
            <div class="pdf-meta-item"><strong>词数：</strong>${escapeHtml(wordsCountLabel)}</div>
            <div class="pdf-meta-item pdf-meta-keywords"><strong>关键词：</strong>${escapeHtml(keywordsLabel)}</div>
            <div class="pdf-meta-item"><strong>关键词解析：</strong>${escapeHtml(keywordMeaningLabel)}</div>
            ${pdf.errorMessage ? `<div class="error-text">${escapeHtml(pdf.errorMessage)}</div>` : ''}
        </div>
    `;

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
            <td>${parsedInfoHtml}</td>
            <td>
                <div class="pdf-actions">
                    <button type="button" class="ghost-btn" onclick="regenerateKeyContent(${pdf.id})" ${canRegenerateKeyContent ? '' : 'disabled'}>生成关键内容</button>
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
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials`, {
                method: 'POST',
                body: formData
            }, false),
            {
                title: '创建教材',
                message: '正在创建教材并上传 PDF，请稍候...'
            }
        );
        showToast('教材已创建，PDF 已开始上传与解析', 'success');
        event.target.reset();
        document.getElementById('createMaterialFilesNote').textContent = '可一次选择多个 PDF；上传后会按教材内 PDF 子项保存并自动排队解析。';
        await loadMaterialLibrary({ forceLoading: true });
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
        await withRequestLoading(
            () => requestJson(url, {
                method: groupId ? 'PUT' : 'POST',
                body: JSON.stringify({ name, description })
            }),
            {
                title: groupId ? '更新教材组' : '创建教材组',
                message: groupId ? '正在更新教材组...' : '正在创建教材组...'
            }
        );
        showToast(groupId ? '教材组已更新' : '教材组已创建', 'success');
        closeGroupModal();
        await loadMaterialLibrary({ forceLoading: true });
    } catch (error) {
        console.error('保存教材组失败:', error);
        showToast(`保存失败: ${error.message}`, 'error');
    }
}

async function deleteGroup(groupId) {
    if (!window.confirm('确认删除这个教材组吗？删除前请确保该分组下没有教材。')) return;

    try {
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/groups/${groupId}`, { method: 'DELETE' }),
            {
                title: '删除教材组',
                message: '正在删除教材组，请稍候...'
            }
        );
        showToast('教材组已删除', 'success');
        await loadMaterialLibrary({ forceLoading: true });
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
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    title,
                    description,
                    groupId
                })
            }),
            {
                title: '更新教材',
                message: '正在保存教材信息，请稍候...'
            }
        );
        showToast('教材已更新', 'success');
        closeMaterialModal();
        await loadMaterialLibrary({ forceLoading: true });
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
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/pdfs`, {
                method: 'POST',
                body: formData
            }, false),
            {
                title: '追加 PDF',
                message: '正在上传并追加 PDF，请稍候...'
            }
        );
        showToast('PDF 已追加，后台将自动解析', 'success');
        closeAppendPdfModal();
        await loadMaterialLibrary({ forceLoading: true });
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
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/move`, {
                method: 'POST',
                body: JSON.stringify({ orderedMaterialIds: orderedIds })
            }),
            {
                title: '调整顺序',
                message: '正在调整教材顺序...'
            }
        );
        await loadMaterialLibrary({ forceLoading: true });
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
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/pdfs/reorder`, {
                method: 'POST',
                body: JSON.stringify({ orderedPdfIds })
            }),
            {
                title: '调整顺序',
                message: '正在调整 PDF 顺序...'
            }
        );
        await loadMaterialLibrary({ forceLoading: true });
    } catch (error) {
        console.error('调整 PDF 顺序失败:', error);
        showToast(`排序失败: ${error.message}`, 'error');
    }
}

async function reparsePdf(pdfId) {
    if (!window.confirm('确认重新解析这个 PDF 吗？旧的关键内容会被覆盖。')) return;

    try {
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}/reparse`, { method: 'POST' }),
            {
                title: '重新解析',
                message: '正在提交 PDF 重新解析任务...'
            }
        );
        showToast('已提交重新解析任务', 'success');
        await loadMaterialLibrary({ forceLoading: true });
        if (state.production.materialId) {
            fetchProductionData(state.production.materialId, { silent: true });
        }
    } catch (error) {
        console.error('重新解析 PDF 失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

async function regenerateKeyContent(pdfId) {
    if (!window.confirm('确认重新生成这个 PDF 的关键内容吗？旧的关键内容结果会被覆盖。')) return;

    try {
        await withRequestLoading(
            async () => {
                const preview = await requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}/key-content-preview`);
                logAiPrompt({
                    action: '关键内容提炼',
                    model: preview.data?.model || DOUBAO_MODEL_NAME,
                    prompt: preview.data?.finalPrompt || '',
                    meta: {
                        materialId: preview.data?.materialId,
                        materialTitle: preview.data?.materialTitle,
                        pdfId: preview.data?.pdfId,
                        pdfName: preview.data?.pdfName
                    }
                });

                return requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}/regenerate-key-content`, { method: 'POST' });
            },
            {
                title: '生成关键内容',
                message: '正在重新请求 AI 提炼关键内容...'
            }
        );
        showToast('已提交关键内容生成任务', 'success');
        await loadMaterialLibrary({ forceLoading: true });
        if (state.production.materialId) {
            await fetchProductionData(state.production.materialId, { silent: true });
        }
    } catch (error) {
        console.error('重新生成关键内容失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

async function deletePdf(pdfId) {
    if (!window.confirm('确认删除这个 PDF 吗？相关解析结果也会一起删除。')) return;

    try {
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/pdfs/${pdfId}`, { method: 'DELETE' }),
            {
                title: '删除 PDF',
                message: '正在删除 PDF 及相关解析结果...'
            }
        );
        showToast('PDF 已删除', 'success');
        await loadMaterialLibrary({ forceLoading: true });
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
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}`, { method: 'DELETE' }),
            {
                title: '删除教材',
                message: '正在删除教材及相关数据...'
            }
        );
        showToast('教材已删除', 'success');
        await loadMaterialLibrary({ forceLoading: true });
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
    state.production.videoSourceThumbnailId = '';
    state.production.thumbnailPromptTemplate = state.config.summary_image_prompt_template;
    state.production.videoPromptTemplate = state.config.thumbnail_video_prompt_template;
    state.production.annotationPromptTemplate = state.config.thumbnail_annotation_prompt_template;
    state.production.audioVoiceType = '';
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
    state.production.videoSourceThumbnailId = '';
    state.production.videoPromptTemplate = state.config.thumbnail_video_prompt_template;
    state.production.annotationPromptTemplate = state.config.thumbnail_annotation_prompt_template;
    state.production.audioVoiceType = '';
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
        const result = await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/production`),
            {
                title: '加载工作台',
                message: '正在加载制作工作台数据...',
                enabled: !silent
            }
        );
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
        if (isFirstLoad || !state.production.videoPromptTemplate) {
            state.production.videoPromptTemplate = result.data.promptTemplates?.video || state.config.thumbnail_video_prompt_template;
        }
        if (isFirstLoad || !state.production.annotationPromptTemplate) {
            state.production.annotationPromptTemplate = result.data.promptTemplates?.annotation || state.config.thumbnail_annotation_prompt_template;
        }

        const eligibleAnnotationIds = getAnnotatableThumbnails(result.data.thumbnails || []).map((item) => String(item.id));
        if (!eligibleAnnotationIds.includes(String(state.production.annotationThumbnailId || ''))) {
            state.production.annotationThumbnailId = eligibleAnnotationIds[0] || '';
        }
        const eligibleVideoSourceIds = getProductionVideoSourceOptions(result.data).map((item) => String(item.id));
        if (!eligibleVideoSourceIds.includes(String(state.production.videoSourceThumbnailId || ''))) {
            state.production.videoSourceThumbnailId = eligibleVideoSourceIds[0] || '';
        }
        const eligibleAudioVoiceTypes = (result.data.audioVoices || []).map((item) => String(item.type || ''));
        if (!eligibleAudioVoiceTypes.includes(String(state.production.audioVoiceType || ''))) {
            state.production.audioVoiceType = eligibleAudioVoiceTypes[0] || '';
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
    if (document.visibilityState !== 'visible') return;
    if (!hasPendingProductionActivity()) return;
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

function hasPendingProductionActivity() {
    if (!state.production.materialId) return false;

    const material = state.materials.find((item) => item.id === state.production.materialId);
    if (material) {
        if (['queued', 'processing'].includes(material.parseStatus) || material.storageStatus === 'moving') {
            return true;
        }

        const pdfBusy = (material.pdfs || []).some((pdf) => (
            ['queued', 'processing'].includes(pdf.parseStatus)
            || ['queued', 'processing'].includes(pdf.structuredContentStatus)
        ));
        if (pdfBusy) {
            return true;
        }
    }

    const thumbnails = state.production.data?.thumbnails || [];
    const videos = state.production.data?.videos || [];
    const audios = state.production.data?.audios || [];
    return thumbnails.some((thumbnail) => (
        ['queued', 'processing'].includes(thumbnail.status)
        || ['queued', 'processing'].includes(thumbnail.annotationStatus)
    )) || videos.some((video) => ['queued', 'processing'].includes(video.status))
        || audios.some((audio) => ['queued', 'processing'].includes(audio.status));
}

function renderProductionLoadingState() {
    const material = state.materials.find((item) => item.id === state.production.materialId);
    document.getElementById('productionModalMaterialTitle').textContent = material ? `《${material.title}》制作工作台` : '制作工作台';
    document.getElementById('productionModalStatus').textContent = state.production.error
        ? `加载失败：${state.production.error}`
        : '正在加载制作数据...';
    document.getElementById('productionScopeSummary').textContent = '等待加载教材页信息';
    document.getElementById('productionPageSelectionPanel').style.display = '';
    document.getElementById('productionPageSelection').innerHTML = '<div class="empty-state compact">正在加载页列表...</div>';
    document.getElementById('productionThumbnailGallery').innerHTML = '<div class="empty-state compact">正在加载缩略图...</div>';
    document.getElementById('productionVideoResults').innerHTML = '<div class="empty-state compact">正在加载视频...</div>';
    document.getElementById('productionAnnotationResults').innerHTML = '<div class="empty-state compact">正在加载标定信息...</div>';
    document.getElementById('productionAudioResults').innerHTML = '<div class="empty-state compact">正在加载音频...</div>';
}

function renderProductionModal() {
    renderProductionHeader();
    renderProductionPageSelection();
    renderProductionScopeSummary();
    renderProductionThumbnailSection();
    renderProductionGallery();
    renderProductionVideoSection();
    renderProductionAnnotationSection();
    renderProductionAudioSection();
}

function renderProductionHeader() {
    const material = state.production.data?.material || state.materials.find((item) => item.id === state.production.materialId);
    document.getElementById('productionModalMaterialTitle').textContent = material ? `《${material.title}》制作工作台` : '制作工作台';
    const pageCount = state.production.data?.pages?.length || 0;
    const thumbnailCount = state.production.data?.thumbnails?.length || 0;
    const videoCount = state.production.data?.videos?.length || 0;
    const audioCount = state.production.data?.audios?.length || 0;
    document.getElementById('productionModalStatus').textContent = material
        ? `页内容 ${pageCount} 条 · 缩略图 ${thumbnailCount} 张 · 视频 ${videoCount} 条 · 音频 ${audioCount} 条 · 理解/标定模型：${DOUBAO_MODEL_NAME}`
        : '未找到教材信息';
}

function buildProductionPageSelectionPreview(page) {
    const preview = normalizePromptTextValue(page?.body)
        || getOrderedSegmentTexts(page?.seg || {}).join('\n')
        || '';

    return preview
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function renderProductionPageSelection() {
    const pages = state.production.data?.pages || [];
    const pageSelectionPanel = document.getElementById('productionPageSelectionPanel');
    document.getElementById('productionScopeAll').checked = state.production.scope === 'all';
    document.getElementById('productionScopeSelected').checked = state.production.scope === 'selected';

    if (state.production.scope === 'all') {
        pageSelectionPanel.style.display = 'none';
        document.getElementById('productionPageSelection').innerHTML = '';
        return;
    }

    pageSelectionPanel.style.display = '';

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
                    <div class="page-select-title">第 ${page.page} 页</div>
                    <div class="page-select-body">${escapeHtml(buildProductionPageSelectionPreview(page) || '暂无正文内容')}</div>
                </div>
            </label>
        `;
    }).join('');
}

function renderProductionScopeSummary() {
    const totalPages = state.production.data?.pages?.length || 0;
    const totalPdfs = state.production.data?.pdfTargets?.length || 0;
    const selectedCount = state.production.selectedPageRefs.size;
    document.getElementById('productionScopeSummary').textContent = state.production.scope === 'all'
        ? `当前作用范围：整本教材，共 ${totalPdfs} 个 PDF 已可用于批量制作。`
        : `当前作用范围：选定页，已选择 ${selectedCount} 页。`;
}

function renderProductionThumbnailSection() {
    document.getElementById('productionThumbnailPromptTemplate').value = state.production.thumbnailPromptTemplate || state.config.summary_image_prompt_template;
    document.getElementById('productionThumbnailLanguageGrid').innerHTML = THUMBNAIL_BASE_LANGUAGE_OPTIONS.map((language) => `
        <label class="checkbox-card">
            <input type="checkbox" class="productionThumbnailLanguage" value="${language}" ${state.production.selectedLanguages.has(language) ? 'checked' : ''}>
            <span>${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[language])}</span>
        </label>
    `).join('');
}

function renderProductionGallery() {
    const targets = getCurrentProductionTargets();
    const thumbnails = getVisibleProductionThumbnails();
    const targetMap = new Map(targets.map((target) => [getProductionTargetKey(target), target]));
    const grouped = new Map();

    thumbnails.forEach((thumbnail) => {
        const key = getProductionThumbnailTargetKey(thumbnail);
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(thumbnail);
    });

    if (!targets.length && !thumbnails.length) {
        document.getElementById('productionThumbnailGallery').innerHTML = '<div class="empty-state compact">还没有可展示的页或缩略图。</div>';
        return;
    }

    const sections = [];
    const orderedKeys = [...new Set([
        ...targets.map((target) => getProductionTargetKey(target)),
        ...grouped.keys()
    ])];

    orderedKeys.forEach((key) => {
        const target = targetMap.get(key);
        const items = grouped.get(key) || [];
        const title = target
            ? getProductionTargetTitle(target)
            : (state.production.scope === 'all' ? `已失配 PDF · ${key}` : `已失配页面 · ${key}`);
        sections.push(`
            <section class="production-page-section">
                <div class="production-page-header">
                    <div>
                        <h4>${escapeHtml(title)}</h4>
                        <p>${escapeHtml(getProductionTargetSubtitle(target))}</p>
                    </div>
                    <span class="group-count">${items.length} 张缩略图</span>
                </div>
                <div class="thumbnail-grid">
                    ${items.length ? items.map((thumbnail) => renderThumbnailCard(thumbnail)).join('') : `<div class="empty-state compact">${state.production.scope === 'all' ? '这个 PDF 还没有生成缩略图。' : '这一页还没有生成缩略图。'}</div>`}
                </div>
            </section>
        `);
    });

    document.getElementById('productionThumbnailGallery').innerHTML = sections.join('');
}

function renderProductionVideoSection() {
    const promptTemplate = state.production.videoPromptTemplate || state.config.thumbnail_video_prompt_template || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE;
    const sourceOptions = getProductionVideoSourceOptions();
    const select = document.getElementById('productionVideoSourceThumbnailSelect');
    document.getElementById('productionVideoPromptTemplate').value = promptTemplate;

    if (!sourceOptions.length) {
        select.innerHTML = '<option value="">暂无可用来源图</option>';
        document.getElementById('productionVideoResults').innerHTML = '<div class="empty-state compact">请先在当前范围内生成至少一张可用缩略图，再生成视频。</div>';
        return;
    }

    const currentValue = String(state.production.videoSourceThumbnailId || '');
    const normalizedValue = sourceOptions.some((item) => String(item.id) === currentValue)
        ? currentValue
        : String(sourceOptions[0].id);
    state.production.videoSourceThumbnailId = normalizedValue;

    select.innerHTML = sourceOptions.map((thumbnail) => `
        <option value="${thumbnail.id}" ${String(thumbnail.id) === normalizedValue ? 'selected' : ''}>
            ${escapeHtml(buildProductionVideoSourceLabel(thumbnail))}
        </option>
    `).join('');

    const visibleVideos = getVisibleProductionVideos();
    if (!visibleVideos.length) {
        document.getElementById('productionVideoResults').innerHTML = '<div class="empty-state compact">当前范围内还没有视频结果。</div>';
        return;
    }

    const grouped = new Map();
    visibleVideos.forEach((video) => {
        const groupKey = String(video.thumbnailId || video.sourceThumbnailId || '');
        if (!grouped.has(groupKey)) {
            grouped.set(groupKey, []);
        }
        grouped.get(groupKey).push(video);
    });

    const sections = sourceOptions.map((thumbnail) => {
        const videos = grouped.get(String(thumbnail.id)) || [];
        return `
            <section class="production-page-section">
                <div class="production-page-header">
                    <div>
                        <h4>${escapeHtml(buildProductionVideoSourceLabel(thumbnail))}</h4>
                        <p>${escapeHtml(buildProductionVideoSourceSubtitle(thumbnail))}</p>
                    </div>
                    <span class="group-count">${videos.length} 条视频</span>
                </div>
                <div class="thumbnail-grid">
                    ${videos.length ? videos.map((video) => renderVideoCard(video)).join('') : '<div class="empty-state compact">这张来源图下还没有生成视频。</div>'}
                </div>
            </section>
        `;
    });

    document.getElementById('productionVideoResults').innerHTML = sections.join('');
}

function renderThumbnailCard(thumbnail) {
    const statusLabel = ASSET_STATUS_LABELS[thumbnail.status] || thumbnail.status;
    const canCompanion = thumbnail.status === 'ready';
    const canAnnotate = thumbnail.status === 'ready' && THUMBNAIL_ANNOTATION_LANGUAGES.includes(thumbnail.language);
    const imageUrl = thumbnail.compressedJpgOutputUrl || thumbnail.outputUrl || thumbnail.pngOutputUrl || thumbnail.outputMeta?.compressedJpgOutputUrl || thumbnail.outputMeta?.pngOutputUrl || '';
    const annotationLabel = ASSET_STATUS_LABELS[thumbnail.annotationStatus] || thumbnail.annotationStatus || '未标定';
    const targetLabel = isPdfLevelThumbnail(thumbnail) ? '整本 PDF' : `第 ${thumbnail.page} 页`;

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
                    <span>${escapeHtml(targetLabel)}</span>
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

function renderVideoCard(video) {
    const statusLabel = ASSET_STATUS_LABELS[video.status] || video.status;
    const videoUrl = video.outputUrl || '';
    const sourceThumbnail = getProductionThumbnailById(video.sourceThumbnailId || video.thumbnailId);

    return `
        <article class="thumbnail-card video-card">
            <div class="thumbnail-preview">
                ${videoUrl
                    ? `<video src="${escapeHtml(videoUrl)}" controls playsinline preload="metadata"></video>`
                    : `<div class="thumbnail-placeholder">${escapeHtml(statusLabel)}</div>`}
                <div class="thumbnail-hover-actions">
                    <button type="button" class="danger-btn small-btn" onclick="deleteThumbnailVideo(${video.id})">删除</button>
                </div>
            </div>
            <div class="thumbnail-card-body">
                <div class="thumbnail-card-title">
                    <strong>视频 #${video.id}</strong>
                    <span class="status-pill status-${escapeHtml(video.status)}">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="thumbnail-card-meta">
                    <span>${escapeHtml(video.scopeType === 'pdf' ? '整本 PDF' : `第 ${video.page} 页`)}</span>
                    ${sourceThumbnail ? `<span>来源图：${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[sourceThumbnail.language] || sourceThumbnail.language)}</span>` : ''}
                </div>
                <div class="form-note">${escapeHtml(video.errorMessage || video.lastMessage || '暂无说明')}</div>
                <div class="thumbnail-card-links">
                    ${video.outputUrl ? `<a href="${escapeHtml(video.outputUrl)}" target="_blank" rel="noopener">MP4</a>` : ''}
                </div>
            </div>
        </article>
    `;
}

function renderProductionAnnotationSection() {
    const thumbnails = getAnnotatableThumbnails(getVisibleProductionThumbnails());
    const select = document.getElementById('productionAnnotationThumbnailSelect');
    document.getElementById('productionAnnotationPromptTemplate').value = state.production.annotationPromptTemplate || state.config.thumbnail_annotation_prompt_template;
    const currentValue = String(state.production.annotationThumbnailId || '');
    select.innerHTML = thumbnails.length
        ? thumbnails.map((thumbnail) => `
            <option value="${thumbnail.id}" ${String(thumbnail.id) === currentValue ? 'selected' : ''}>
                ${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[thumbnail.language] || thumbnail.language)} · ${escapeHtml(isPdfLevelThumbnail(thumbnail) ? '整本 PDF' : `第 ${thumbnail.page} 页`)} · ${thumbnail.generationKind === 'companion' ? '配套图' : '基础图'}
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

function getVisibleProductionAudioTargets() {
    if (state.production.scope === 'all') {
        return state.production.data?.pages || [];
    }

    const selectedKeys = new Set([...state.production.selectedPageRefs]);
    if (!selectedKeys.size) return [];
    return (state.production.data?.pages || []).filter((page) => selectedKeys.has(buildPageRefValue(page.materialPdfId, page.page)));
}

function getVisibleProductionAudios() {
    const audios = state.production.data?.audios || [];
    if (state.production.scope === 'all') {
        return audios;
    }

    const selectedKeys = new Set([...state.production.selectedPageRefs]);
    if (!selectedKeys.size) return [];
    return audios.filter((audio) => selectedKeys.has(buildPageRefValue(audio.materialPdfId, audio.page)));
}

function getProductionTargetByAudio(audio) {
    if (!audio) return null;
    if (Number(audio.page || 0) <= 0 || audio.scopeType === 'pdf') {
        return (state.production.data?.pdfTargets || []).find((target) => Number(target.materialPdfId) === Number(audio.materialPdfId)) || null;
    }
    return (state.production.data?.pages || []).find((target) => (
        Number(target.materialPdfId) === Number(audio.materialPdfId)
        && Number(target.page) === Number(audio.page)
    )) || null;
}

function renderAudioCard(audio) {
    const statusLabel = ASSET_STATUS_LABELS[audio.status] || audio.status;
    const audioUrl = audio.outputUrl || '';
    const locationLabel = audio.scopeType === 'pdf'
        ? '整本 PDF'
        : (Number(audio.seg || 0) > 0 ? `第 ${audio.page} 页 / 第 ${audio.seg} 段` : `第 ${audio.page} 页`);
    return `
        <article class="thumbnail-card audio-card">
            <div class="thumbnail-preview">
                ${audioUrl
                    ? `<audio src="${escapeHtml(audioUrl)}" controls preload="metadata"></audio>`
                    : `<div class="thumbnail-placeholder">${escapeHtml(statusLabel)}</div>`}
                <div class="thumbnail-hover-actions">
                    <button type="button" class="danger-btn small-btn" onclick="deleteMaterialAudio(${audio.id})">删除</button>
                </div>
            </div>
            <div class="thumbnail-card-body">
                <div class="thumbnail-card-title">
                    <strong>${escapeHtml(audio.voiceLabel || audio.voiceType || `音频 #${audio.id}`)}</strong>
                    <span class="status-pill status-${escapeHtml(audio.status)}">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="thumbnail-card-meta">
                    <span>${escapeHtml(locationLabel)}</span>
                    <span>${escapeHtml(audio.voiceType || '')}</span>
                </div>
                <div class="form-note">${escapeHtml(audio.errorMessage || audio.lastMessage || '暂无说明')}</div>
                <div class="thumbnail-card-links">
                    ${audioUrl ? `<a href="${escapeHtml(audioUrl)}" target="_blank" rel="noopener">MP3</a>` : ''}
                </div>
            </div>
        </article>
    `;
}

function renderProductionAudioSection() {
    const voiceOptions = state.production.data?.audioVoices || [];
    const select = document.getElementById('productionAudioVoiceSelect');
    const hint = document.getElementById('productionAudioVoiceHint');

    if (!voiceOptions.length) {
        select.innerHTML = '<option value="">暂无可用音色</option>';
        hint.textContent = '当前未配置可用音色。';
        document.getElementById('productionAudioResults').innerHTML = '<div class="empty-state compact">当前未配置音频合成。</div>';
        return;
    }

    const currentVoiceType = voiceOptions.some((item) => String(item.type) === String(state.production.audioVoiceType || ''))
        ? String(state.production.audioVoiceType || '')
        : String(voiceOptions[0].type);
    state.production.audioVoiceType = currentVoiceType;
    select.innerHTML = voiceOptions.map((voice) => `
        <option value="${escapeHtml(String(voice.type || ''))}" ${String(voice.type || '') === currentVoiceType ? 'selected' : ''}>
            ${escapeHtml(voice.label || voice.type)}${voice.locale ? ` · ${escapeHtml(voice.locale)}` : ''}
        </option>
    `).join('');

    const selectedVoice = voiceOptions.find((voice) => String(voice.type || '') === currentVoiceType);
    hint.textContent = selectedVoice
        ? `每个 segN_text 会单独生成一段音频。同一页有多个 seg，就会生成多段。当前音色：${selectedVoice.label}${selectedVoice.locale ? `（${selectedVoice.locale}）` : ''}${selectedVoice.description ? `，${selectedVoice.description}` : ''}。`
        : '每个 segN_text 会单独生成一段音频。同一页有多个 seg，就会生成多段。';

    if (state.production.scope === 'selected' && !state.production.selectedPageRefs.size) {
        document.getElementById('productionAudioResults').innerHTML = '<div class="empty-state compact">请先选择至少一页，再生成音频。</div>';
        return;
    }

    const targets = getVisibleProductionAudioTargets();
    const audios = getVisibleProductionAudios();
    if (!targets.length && !audios.length) {
        document.getElementById('productionAudioResults').innerHTML = '<div class="empty-state compact">当前范围内还没有音频结果。</div>';
        return;
    }

    const targetMap = new Map(targets.map((target) => [getProductionTargetKey(target), target]));
    const grouped = new Map();
    audios.forEach((audio) => {
        const key = Number(audio.page || 0) > 0 ? buildPageRefValue(audio.materialPdfId, audio.page) : `pdf:${audio.materialPdfId}`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(audio);
    });

    const orderedKeys = [...new Set([
        ...targets.map((target) => getProductionTargetKey(target)),
        ...grouped.keys()
    ])];

    document.getElementById('productionAudioResults').innerHTML = orderedKeys.map((key) => {
        const target = targetMap.get(key) || getProductionTargetByAudio((grouped.get(key) || [])[0]);
        const audioItems = grouped.get(key) || [];
        return `
            <section class="production-page-section">
                <div class="production-page-header">
                    <div>
                        <h4>${escapeHtml(getProductionTargetTitle(target))}</h4>
                        <p>${escapeHtml(getProductionTargetSubtitle(target))}</p>
                    </div>
                    <span class="group-count">${audioItems.length} 条音频</span>
                </div>
                <div class="thumbnail-grid">
                    ${audioItems.length ? audioItems.map((audio) => renderAudioCard(audio)).join('') : '<div class="empty-state compact">当前目标还没有音频。</div>'}
                </div>
            </section>
        `;
    }).join('');
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
        const selectedTargets = getSelectedProductionTargets();
        const productionMaterial = state.production.data?.material || null;
        selectedTargets.forEach((target) => {
            state.production.selectedLanguages.forEach((language) => {
                logAiPrompt({
                    action: '缩略图生成',
                    model: WAVESPEED_MODEL_NAME,
                    prompt: buildThumbnailPromptPreview({
                        promptTemplate,
                        language,
                        pageEntry: target,
                        material: productionMaterial
                    }),
                    meta: {
                        materialId,
                        materialPdfId: target.materialPdfId,
                        page: target.page,
                        scopeType: Number(target.page || 0) > 0 ? 'page' : 'pdf',
                        language
                    }
                });
            });
        });

        const body = {
            scope: state.production.scope,
            pageRefs: [...state.production.selectedPageRefs].map((value) => parsePageRefValue(value)),
            languages: [...state.production.selectedLanguages],
            promptTemplate
        };
        const result = await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/thumbnails`, {
                method: 'POST',
                body: JSON.stringify(body)
            }),
            {
                title: '生成缩略图',
                message: '正在提交缩略图生成任务...'
            }
        );
        showToast(result.message || '已提交缩略图生成任务', 'success');
        await fetchProductionData(materialId, { silent: true });
        await loadMaterialLibrary({ forceLoading: true });
    } catch (error) {
        console.error('提交缩略图生成任务失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

async function submitThumbnailVideoGeneration() {
    const materialId = state.production.materialId;
    if (!materialId) return;

    const promptTemplate = document.getElementById('productionVideoPromptTemplate').value;
    const thumbnailId = Number(state.production.videoSourceThumbnailId || 0);
    if (!thumbnailId) {
        showToast('请先选择一张来源缩略图', 'error');
        return;
    }

    const sourceThumbnail = getProductionThumbnailById(thumbnailId);
    if (!sourceThumbnail || sourceThumbnail.status !== 'ready') {
        showToast('所选来源缩略图尚未就绪', 'error');
        return;
    }

    try {
        const target = getProductionTargetByThumbnail(sourceThumbnail);
        logAiPrompt({
            action: '视频生成',
            model: ATLAS_VIDEO_MODEL_NAME,
            prompt: buildThumbnailVideoPromptPreview({
                promptTemplate,
                pageEntry: target,
                material: state.production.data?.material || null
            }),
            meta: {
                materialId,
                thumbnailId: sourceThumbnail.id,
                sourceThumbnailId: sourceThumbnail.id,
                materialPdfId: sourceThumbnail.materialPdfId,
                page: sourceThumbnail.page,
                scopeType: sourceThumbnail.scopeType || (isPdfLevelThumbnail(sourceThumbnail) ? 'pdf' : 'page'),
                taskCount: 2
            }
        });

        const result = await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/thumbnails/${thumbnailId}/videos`, {
                method: 'POST',
                body: JSON.stringify({
                    sourceThumbnailId: thumbnailId,
                    promptTemplate
                })
            }),
            {
                title: '生成视频',
                message: '正在提交视频生成任务...'
            }
        );
        showToast(result.message || '已提交视频生成任务', 'success');
        await fetchProductionData(materialId, { silent: true });
    } catch (error) {
        console.error('提交视频生成任务失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

async function submitMaterialAudioGeneration() {
    const materialId = state.production.materialId;
    if (!materialId) return;

    const voiceType = String(state.production.audioVoiceType || '').trim();
    if (!voiceType) {
        showToast('请先选择一个音色', 'error');
        return;
    }
    if (state.production.scope === 'selected' && !state.production.selectedPageRefs.size) {
        showToast('请至少选择一页', 'error');
        return;
    }

    try {
        const selectedTargets = getSelectedProductionAudioTargets();
        const selectedVoice = (state.production.data?.audioVoices || []).find((voice) => String(voice.type || '') === voiceType);
        selectedTargets.forEach((target) => {
            getOrderedSegmentEntries(target?.seg || {}).forEach((segment) => {
                logAiPrompt({
                    action: '音频合成',
                    model: VOLCENGINE_TTS_MODEL_NAME,
                    prompt: buildProductionAudioPromptPreview(target, segment),
                    meta: {
                        materialId,
                        materialPdfId: target.materialPdfId,
                        page: target.page,
                        seg: segment.order,
                        scopeType: 'segment',
                        voiceType,
                        voiceLabel: selectedVoice?.label || voiceType
                    }
                });
            });
        });

        const result = await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/materials/${materialId}/audios`, {
                method: 'POST',
                body: JSON.stringify({
                    scope: state.production.scope,
                    pageRefs: [...state.production.selectedPageRefs].map((value) => parsePageRefValue(value)),
                    voiceType
                })
            }),
            {
                title: '生成语音',
                message: '正在提交音频合成任务...'
            }
        );
        showToast(result.message || '已提交音频合成任务', 'success');
        await fetchProductionData(materialId, { silent: true });
    } catch (error) {
        console.error('提交音频合成任务失败:', error);
        showToast(`提交失败: ${error.message}`, 'error');
    }
}

function openThumbnailCompanionModal(thumbnailId) {
    const thumbnail = getProductionThumbnailById(thumbnailId);
    if (!thumbnail) return;
    const availableLanguages = THUMBNAIL_COMPANION_OPTIONS.filter((language) => language !== thumbnail.language);
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
    const promptTemplates = state.production.data?.promptTemplates || {};
    if (targetLanguage === 'background') {
        return promptTemplates.companionBackground
            || state.config.thumbnail_companion_background_prompt_template
            || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE;
    }
    if (targetLanguage === 'textless') {
        return promptTemplates.companionTextless
            || state.config.thumbnail_companion_textless_prompt_template
            || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE;
    }

    const label = THUMBNAIL_LANGUAGE_LABELS[targetLanguage] || targetLanguage;
    return (promptTemplates.companionLanguage
        || state.config.thumbnail_companion_language_prompt_template
        || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE)
        .replaceAll('{{language}}', label);
}

function buildCompanionTemplateForSave(targetLanguage, promptText) {
    const normalizedPrompt = String(promptText || '').trim();
    if (!normalizedPrompt) return '';
    if (targetLanguage === 'background' || targetLanguage === 'textless') {
        return normalizedPrompt;
    }
    if (normalizedPrompt.includes('{{language}}')) {
        return normalizedPrompt;
    }

    const label = THUMBNAIL_LANGUAGE_LABELS[targetLanguage] || targetLanguage;
    return normalizedPrompt.replaceAll(label, '{{language}}');
}

function renderThumbnailCompanionModal() {
    const thumbnail = getProductionThumbnailById(state.companion.sourceThumbnailId);
    if (!thumbnail) return;

    const options = THUMBNAIL_COMPANION_OPTIONS
        .filter((language) => language !== thumbnail.language)
        .map((language) => `<option value="${language}" ${state.companion.targetLanguage === language ? 'selected' : ''}>${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[language])}</option>`)
        .join('');

    document.getElementById('thumbnailCompanionSourceInfo').textContent = `${THUMBNAIL_LANGUAGE_LABELS[thumbnail.language]} · ${isPdfLevelThumbnail(thumbnail) ? '整本 PDF' : `第 ${thumbnail.page} 页`}`;
    document.getElementById('thumbnailCompanionPreview').innerHTML = thumbnail.compressedJpgOutputUrl
        ? `<img src="${escapeHtml(thumbnail.compressedJpgOutputUrl)}" alt="${escapeHtml(THUMBNAIL_LANGUAGE_LABELS[thumbnail.language])}">`
        : '<div class="thumbnail-placeholder">暂无预览</div>';
    document.getElementById('thumbnailCompanionTargetLanguage').innerHTML = options;
    document.getElementById('thumbnailCompanionPrompt').value = state.companion.promptText;
}

async function saveProductionCompanionPromptTemplate() {
    const targetLanguage = state.companion.targetLanguage;
    if (!targetLanguage) {
        showToast('请先选择配套图类型', 'error');
        return;
    }

    const promptTemplate = buildCompanionTemplateForSave(targetLanguage, state.companion.promptText);
    if (!promptTemplate) {
        showToast('配套图提示词不能为空', 'error');
        return;
    }

    const groupId = state.production.data?.material?.groupId;
    let overrides = {};
    let promptTemplateKey = '';
    let successMessage = '';

    if (targetLanguage === 'background') {
        overrides = { thumbnailCompanionBackgroundPromptTemplate: promptTemplate };
        promptTemplateKey = 'companionBackground';
        successMessage = '已保存为当前教材组纯背景图模板';
    } else if (targetLanguage === 'textless') {
        overrides = { thumbnailCompanionTextlessPromptTemplate: promptTemplate };
        promptTemplateKey = 'companionTextless';
        successMessage = '已保存为当前教材组无内容配套图模板';
    } else {
        if (!promptTemplate.includes('{{language}}')) {
            showToast('语言配套图模板必须保留 {{language}} 占位符', 'error');
            return;
        }
        overrides = { thumbnailCompanionLanguagePromptTemplate: promptTemplate };
        promptTemplateKey = 'companionLanguage';
        successMessage = '已保存为当前教材组语言配套图模板';
    }

    const saved = await saveMaterialGroupPromptTemplates(groupId, overrides, successMessage);
    if (!saved) return;

    if (state.production.data?.promptTemplates && promptTemplateKey) {
        state.production.data.promptTemplates[promptTemplateKey] = promptTemplate;
    }
    state.companion.promptText = buildCompanionPrompt(targetLanguage);
    renderThumbnailCompanionModal();
}

function resetProductionCompanionPromptTemplate() {
    if (!state.companion.targetLanguage) {
        showToast('请先选择配套图类型', 'error');
        return;
    }

    state.companion.promptText = buildCompanionPrompt(state.companion.targetLanguage);
    renderThumbnailCompanionModal();
    showToast('已恢复为当前教材组配套图模板', 'info');
}

async function submitThumbnailCompanion() {
    const sourceThumbnailId = state.companion.sourceThumbnailId;
    if (!sourceThumbnailId) return;
    if (!state.companion.targetLanguage) {
        showToast('请选择配套图类型', 'error');
        return;
    }
    if (!state.companion.promptText.trim()) {
        showToast('配套图提示词不能为空', 'error');
        return;
    }

    try {
        const sourceThumbnail = getProductionThumbnailById(sourceThumbnailId);
        logAiPrompt({
            action: '配套图生成',
            model: WAVESPEED_MODEL_NAME,
            prompt: state.companion.promptText,
            meta: {
                sourceThumbnailId,
                materialId: sourceThumbnail?.materialId || state.production.materialId,
                materialPdfId: sourceThumbnail?.materialPdfId || null,
                page: sourceThumbnail?.page || null,
                sourceLanguage: sourceThumbnail?.language || null,
                targetLanguage: state.companion.targetLanguage
            }
        });

        const result = await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/thumbnails/${sourceThumbnailId}/companion`, {
                method: 'POST',
                body: JSON.stringify({
                    targetLanguage: state.companion.targetLanguage,
                    promptTemplate: state.companion.promptText
                })
            }),
            {
                title: '生成配套图',
                message: '正在提交配套图生成任务...'
            }
        );
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
    if (!isValidAnnotationPromptTemplate(state.production.annotationPromptTemplate)) {
        showToast('位置标定提示词模板必须保留 {{title}}，并保留 {{segments}} 或 {{body}} 占位符', 'error');
        return;
    }

    try {
        const thumbnail = getProductionThumbnailById(thumbnailId);
        const target = getProductionTargetByThumbnail(thumbnail);
        const promptText = buildThumbnailAnnotationPromptPreview({
            title: target?.title || '',
            segments: target?.seg || {},
            body: target?.body || ''
        });
        logAiPrompt({
            action: '位置标定',
            model: DOUBAO_MODEL_NAME,
            prompt: promptText,
            meta: {
                thumbnailId,
                materialId: thumbnail?.materialId || state.production.materialId,
                materialPdfId: thumbnail?.materialPdfId || null,
                page: thumbnail?.page || null,
                language: thumbnail?.language || null
            }
        });

        const result = await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/thumbnails/${thumbnailId}/annotations`, {
                method: 'POST',
                body: JSON.stringify({
                    promptTemplate: state.production.annotationPromptTemplate
                })
            }),
            {
                title: '位置标定',
                message: '正在提交位置标定任务...'
            }
        );
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
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/thumbnails/${thumbnailId}`, {
                method: 'DELETE'
            }),
            {
                title: '删除缩略图',
                message: '正在删除缩略图及相关标定结果...'
            }
        );
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

async function deleteThumbnailVideo(videoId) {
    if (!window.confirm('确认删除这个视频吗？')) return;

    try {
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/videos/${videoId}`, {
                method: 'DELETE'
            }),
            {
                title: '删除视频',
                message: '正在删除视频...'
            }
        );
        showToast('视频已删除', 'success');
        await fetchProductionData(state.production.materialId, { silent: true });
    } catch (error) {
        console.error('删除视频失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

async function deleteMaterialAudio(audioId) {
    if (!window.confirm('确认删除这个音频吗？')) return;

    try {
        await withRequestLoading(
            () => requestJson(`${BASE_PATH}/api/material-library/audios/${audioId}`, {
                method: 'DELETE'
            }),
            {
                title: '删除音频',
                message: '正在删除音频...'
            }
        );
        showToast('音频已删除', 'success');
        await fetchProductionData(state.production.materialId, { silent: true });
    } catch (error) {
        console.error('删除音频失败:', error);
        showToast(`删除失败: ${error.message}`, 'error');
    }
}

function getProductionThumbnailById(thumbnailId) {
    return (state.production.data?.thumbnails || []).find((thumbnail) => Number(thumbnail.id) === Number(thumbnailId)) || null;
}

function isPdfLevelThumbnail(thumbnail) {
    return Number(thumbnail?.page || 0) <= 0 || thumbnail?.scopeType === 'pdf';
}

function getCurrentProductionTargets() {
    if (state.production.scope === 'all') {
        return state.production.data?.pdfTargets || [];
    }
    return state.production.data?.pages || [];
}

function getVisibleProductionThumbnails() {
    const thumbnails = state.production.data?.thumbnails || [];
    return thumbnails.filter((thumbnail) => state.production.scope === 'all'
        ? isPdfLevelThumbnail(thumbnail)
        : !isPdfLevelThumbnail(thumbnail));
}

function getProductionVideoSourceOptions(data = state.production.data) {
    const allThumbnails = data?.thumbnails || [];
    const visibleThumbnails = allThumbnails.filter((thumbnail) => state.production.scope === 'all'
        ? isPdfLevelThumbnail(thumbnail)
        : !isPdfLevelThumbnail(thumbnail));

    const selectedPageKeys = new Set([...state.production.selectedPageRefs]);
    const scopedThumbnails = visibleThumbnails.filter((thumbnail) => {
        if (thumbnail.status !== 'ready') return false;
        if (state.production.scope === 'all') return true;
        if (!selectedPageKeys.size) return false;
        return selectedPageKeys.has(buildPageRefValue(thumbnail.materialPdfId, thumbnail.page));
    });

    const textlessThumbnail = scopedThumbnails.find((thumbnail) => thumbnail.language === 'textless');
    if (!textlessThumbnail) {
        return scopedThumbnails;
    }

    return [
        textlessThumbnail,
        ...scopedThumbnails.filter((thumbnail) => thumbnail.id !== textlessThumbnail.id)
    ];
}

function getVisibleProductionVideos() {
    const videos = state.production.data?.videos || [];
    const allowedThumbnailIds = new Set(getProductionVideoSourceOptions().map((thumbnail) => Number(thumbnail.id)));
    return videos.filter((video) => allowedThumbnailIds.has(Number(video.thumbnailId)));
}

function buildProductionVideoSourceLabel(thumbnail) {
    if (!thumbnail) return '未找到来源图';
    return `${THUMBNAIL_LANGUAGE_LABELS[thumbnail.language] || thumbnail.language} · ${isPdfLevelThumbnail(thumbnail) ? '整本 PDF' : `第 ${thumbnail.page} 页`} · ${thumbnail.generationKind === 'companion' ? '配套图' : '基础图'}`;
}

function buildProductionVideoSourceSubtitle(thumbnail) {
    const target = getProductionTargetByThumbnail(thumbnail);
    return getProductionTargetSubtitle(target);
}

function getProductionTargetKey(target) {
    if (!target) return '';
    return Number(target.page || 0) > 0
        ? buildPageRefValue(target.materialPdfId, target.page)
        : `pdf:${target.materialPdfId}`;
}

function getProductionThumbnailTargetKey(thumbnail) {
    return isPdfLevelThumbnail(thumbnail)
        ? `pdf:${thumbnail.materialPdfId}`
        : buildPageRefValue(thumbnail.materialPdfId, thumbnail.page);
}

function getProductionTargetTitle(target) {
    if (!target) return '未找到缩略图目标';
    return Number(target.page || 0) > 0
        ? `${target.pdfDisplayName} · 第 ${target.page} 页`
        : `${target.pdfDisplayName} · 整本 PDF`;
}

function getProductionTargetSubtitle(target) {
    if (!target) return '暂无标题';
    if (Number(target.page || 0) > 0) {
        return target.title || '暂无页标题';
    }

    if (target.title && target.pageCount) {
        return `${target.title} · 共 ${target.pageCount} 页`;
    }
    if (target.title) {
        return target.title;
    }
    if (target.pageCount) {
        return `共 ${target.pageCount} 页`;
    }
    return '暂无 PDF 标题';
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

function normalizePromptTextValue(value) {
    return String(value ?? '').trim();
}

function getOrderedSegmentEntries(segments = {}) {
    return Object.entries(segments || {})
        .map(([key, value], index) => {
            const match = String(key || '').match(/seg(\d+)/i);
            const order = match ? Number.parseInt(match[1], 10) : index + 1;
            const textKey = Object.keys(value || {}).find((candidate) => /_text$/i.test(candidate)) || 'text';
            const picKey = Object.keys(value || {}).find((candidate) => /_pic$/i.test(candidate)) || 'pic';
            return {
                order,
                text: normalizePromptTextValue(value?.[textKey]),
                pic: normalizePromptTextValue(value?.[picKey])
            };
        })
        .filter((item) => item.text || item.pic)
        .sort((left, right) => left.order - right.order);
}

function getOrderedSegmentTexts(segments = {}) {
    return getOrderedSegmentEntries(segments)
        .map((segment) => segment.text)
        .filter(Boolean);
}

function buildProductionPageBodyPreview(pageEntry = {}) {
    const explicitBody = normalizePromptTextValue(pageEntry.body);
    if (explicitBody) {
        return explicitBody;
    }

    const segmentTexts = getOrderedSegmentTexts(pageEntry.seg || {});
    return segmentTexts.join('\n').trim();
}

function renderSummaryImagePromptPreview(template, {
    title,
    body,
    materialGroup,
    materialName,
    keywords
}) {
    const normalizedKeywords = Array.isArray(keywords)
        ? keywords.map((keyword) => normalizePromptTextValue(keyword)).filter(Boolean).join(', ')
        : normalizePromptTextValue(keywords);

    return String(template || '')
        .replaceAll('{{material_group}}', normalizePromptTextValue(materialGroup))
        .replaceAll('{{material_name}}', normalizePromptTextValue(materialName))
        .replaceAll('{{keywods}}', normalizedKeywords)
        .replaceAll('{{keywords}}', normalizedKeywords)
        .replaceAll('{{title}}', normalizePromptTextValue(title))
        .replaceAll('{{body}}', normalizePromptTextValue(body));
}

function buildThumbnailPromptPreview({ promptTemplate, language, pageEntry, material }) {
    const languageLabel = THUMBNAIL_LANGUAGE_LABELS[language] || language;
    const title = normalizePromptTextValue(pageEntry?.title);
    const body = buildProductionPageBodyPreview(pageEntry);

    return [
        `生成“${languageLabel}”的图片。`,
        renderSummaryImagePromptPreview(promptTemplate, {
            title,
            body,
            materialGroup: material?.groupName || '',
            materialName: material?.title || '',
            keywords: pageEntry?.words || []
        })
    ].join('\n');
}

function buildThumbnailVideoPromptPreview({ promptTemplate, pageEntry, material }) {
    const title = normalizePromptTextValue(pageEntry?.title);
    const body = buildProductionPageBodyPreview(pageEntry);
    return renderSummaryImagePromptPreview(promptTemplate, {
        title,
        body,
        materialGroup: material?.groupName || '',
        materialName: material?.title || '',
        keywords: pageEntry?.words || []
    });
}

function buildProductionAudioPromptPreview(pageEntry, segment = null) {
    const segmentText = normalizePromptTextValue(segment?.text);
    if (segmentText) {
        return segmentText;
    }
    const title = normalizePromptTextValue(pageEntry?.title);
    const body = buildProductionPageBodyPreview(pageEntry);
    return [title, body].filter(Boolean).join('\n\n').trim();
}

function buildThumbnailAnnotationPromptPreview({ title, segments, body }) {
    const promptTemplate = state.production.annotationPromptTemplate || state.config.thumbnail_annotation_prompt_template || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE;
    const normalizedTitle = normalizePromptTextValue(title);
    const normalizedSegments = getOrderedSegmentTexts(segments).join('\n');
    const normalizedBody = normalizePromptTextValue(body) || normalizedSegments;
    return promptTemplate
        .replaceAll('{{title}}', normalizedTitle)
        .replaceAll('{{segments}}', normalizedSegments)
        .replaceAll('{{body}}', normalizedBody)
        .trim();
}

function isValidAnnotationPromptTemplate(promptTemplate) {
    const normalized = String(promptTemplate || '');
    return normalized.includes('{{title}}')
        && (normalized.includes('{{segments}}') || normalized.includes('{{body}}'));
}

function getSelectedProductionTargets() {
    if (state.production.scope === 'all') {
        return state.production.data?.pdfTargets || [];
    }

    const selectedKeys = new Set([...state.production.selectedPageRefs]);
    return (state.production.data?.pages || []).filter((page) => selectedKeys.has(buildPageRefValue(page.materialPdfId, page.page)));
}

function getSelectedProductionAudioTargets() {
    if (state.production.scope === 'all') {
        return state.production.data?.pages || [];
    }

    const selectedKeys = new Set([...state.production.selectedPageRefs]);
    return (state.production.data?.pages || []).filter((page) => selectedKeys.has(buildPageRefValue(page.materialPdfId, page.page)));
}

function getProductionTargetByThumbnail(thumbnail) {
    if (!thumbnail) return null;
    if (isPdfLevelThumbnail(thumbnail)) {
        return (state.production.data?.pdfTargets || []).find((target) => Number(target.materialPdfId) === Number(thumbnail.materialPdfId)) || null;
    }
    return (state.production.data?.pages || []).find((target) => (
        Number(target.materialPdfId) === Number(thumbnail.materialPdfId)
        && Number(target.page) === Number(thumbnail.page)
    )) || null;
}

function logAiPrompt({ action, model, prompt, meta = {} }) {
    const normalizedPrompt = String(prompt || '');
    const header = `[AI Prompt] ${action}`;
    if (console.groupCollapsed) {
        console.groupCollapsed(header);
    } else {
        console.log(header);
    }
    console.log('model:', model || 'unknown');
    if (Object.keys(meta).length) {
        console.log('meta:', meta);
    }
    console.log('prompt:');
    console.log(normalizedPrompt);
    if (console.groupEnd) {
        console.groupEnd();
    }
}

function ensureRequestLoadingOverlay() {
    let overlay = document.getElementById('requestLoadingOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'requestLoadingOverlay';
    overlay.className = 'request-loading-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="request-loading-card" role="status" aria-live="polite">
            <div class="request-loading-spinner" aria-hidden="true"></div>
            <div class="request-loading-copy">
                <div class="request-loading-title" id="requestLoadingTitle">请稍候</div>
                <div class="request-loading-message" id="requestLoadingMessage">正在处理请求...</div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function updateRequestLoadingOverlay() {
    const overlay = ensureRequestLoadingOverlay();
    const titleElement = document.getElementById('requestLoadingTitle');
    const messageElement = document.getElementById('requestLoadingMessage');
    titleElement.textContent = state.requestLoading.title || '请稍候';
    messageElement.textContent = state.requestLoading.message || '正在处理请求...';
    return overlay;
}

function beginRequestLoading({ title = '请稍候', message = '正在处理请求...' } = {}) {
    state.requestLoading.depth += 1;
    state.requestLoading.title = title;
    state.requestLoading.message = message;

    if (state.requestLoading.visible) {
        updateRequestLoadingOverlay();
        return;
    }

    if (state.requestLoading.timer) return;

    state.requestLoading.timer = window.setTimeout(() => {
        state.requestLoading.timer = null;
        if (state.requestLoading.depth <= 0) return;
        const overlay = updateRequestLoadingOverlay();
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        state.requestLoading.visible = true;
    }, REQUEST_LOADING_DELAY_MS);
}

function endRequestLoading() {
    state.requestLoading.depth = Math.max(0, state.requestLoading.depth - 1);
    if (state.requestLoading.depth > 0) return;

    if (state.requestLoading.timer) {
        window.clearTimeout(state.requestLoading.timer);
        state.requestLoading.timer = null;
    }

    const overlay = document.getElementById('requestLoadingOverlay');
    if (overlay) {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
    }
    state.requestLoading.visible = false;
}

async function withRequestLoading(task, options = {}) {
    const { enabled = true, title, message } = options;
    if (!enabled) {
        return task();
    }

    beginRequestLoading({ title, message });
    try {
        return await task();
    } finally {
        endRequestLoading();
    }
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
window.regenerateKeyContent = regenerateKeyContent;
window.deletePdf = deletePdf;
window.deleteMaterial = deleteMaterial;
window.openProductionModal = openProductionModal;
window.closeProductionModal = closeProductionModal;
window.openThumbnailCompanionModal = openThumbnailCompanionModal;
window.closeThumbnailCompanionModal = closeThumbnailCompanionModal;
window.submitThumbnailCompanion = submitThumbnailCompanion;
window.deleteThumbnail = deleteThumbnail;
window.queueThumbnailAnnotation = queueThumbnailAnnotation;
