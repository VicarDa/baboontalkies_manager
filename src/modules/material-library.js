import { promises as fsp } from 'fs';
import { randomUUID } from 'crypto';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import OSS from 'ali-oss';

const execFileAsync = promisify(execFile);

const MATERIAL_ASSET_TYPES = ['slide', 'audio', 'video', 'exercise', 'summary_image'];
const THUMBNAIL_BASE_LANGUAGES = ['zh_hans', 'zh_hant', 'en', 'textless'];
const THUMBNAIL_LANGUAGES = [...THUMBNAIL_BASE_LANGUAGES, 'background'];
const THUMBNAIL_LANGUAGE_LABELS = {
  zh_hans: '简体中文',
  zh_hant: '繁体中文',
  en: '英文',
  textless: '无文字',
  background: '纯背景图'
};
const THUMBNAIL_GENERATION_KINDS = {
  BASE: 'base',
  COMPANION: 'companion'
};
const THUMBNAIL_SCOPE = {
  ALL: 'all',
  SELECTED: 'selected'
};

const MATERIAL_ASSET_LABELS = {
  slide: 'Slide',
  audio: '音频',
  video: '视频',
  exercise: '练习',
  summary_image: '摘要图'
};

const MATERIAL_ASSET_STATUS = {
  NOT_STARTED: 'not_started',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed'
};

const MATERIAL_PARSE_STATUS = {
  NOT_STARTED: 'not_started',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  PARTIAL_FAILED: 'partial_failed',
  FAILED: 'failed'
};

const MATERIAL_STORAGE_STATUS = {
  READY: 'ready',
  MOVING: 'moving',
  MOVE_FAILED: 'move_failed'
};

const PDF_UPLOAD_STATUS = {
  UPLOADED: 'uploaded',
  LEGACY_LOCAL: 'legacy_local'
};

const PDF_PARSE_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed'
};

const STRUCTURED_CONTENT_STATUS = {
  NOT_STARTED: 'not_started',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed'
};
const THUMBNAIL_STATUS = MATERIAL_ASSET_STATUS;
const THUMBNAIL_VIDEO_STATUS = MATERIAL_ASSET_STATUS;
const MATERIAL_AUDIO_STATUS = MATERIAL_ASSET_STATUS;
const THUMBNAIL_ANNOTATION_STATUS = {
  NOT_STARTED: 'not_started',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed'
};

const JOB_TYPES = {
  PARSE_PDF: 'parse_pdf',
  REPARSE_PDF: 'reparse_pdf',
  MOVE_MATERIAL_PREFIX: 'move_material_prefix',
  EXTRACT_STRUCTURED_CONTENT: 'extract_structured_content',
  GENERATE_THUMBNAIL: 'generate_thumbnail',
  GENERATE_THUMBNAIL_COMPANION: 'generate_thumbnail_companion',
  GENERATE_THUMBNAIL_VIDEO: 'generate_thumbnail_video',
  GENERATE_AUDIO: 'generate_audio',
  ANNOTATE_THUMBNAIL_POSITIONS: 'annotate_thumbnail_positions'
};

const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const DEFAULT_JOB_MAX_ATTEMPTS = 3;
const JOB_POLL_INTERVAL_MS = 3000;
const JOB_POLL_BACKOFF_MAX_MS = 30000;
const JOB_STALE_RESET_MESSAGE = 'Worker restarted before task finished';
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024;
const MAX_FILE_COUNT = 50;
const MATERIAL_OSS_ROOT_PREFIX = 'BaboonStudy/Material';
const PARSER_NAME = 'marker';
const DOUBAO_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const DOUBAO_MODEL = 'doubao-seed-2-0-pro-260215';
const DOUBAO_REQUEST_TIMEOUT_MS = 120000;
const WAVESPEED_API_URL = 'https://api.wavespeed.ai/api/v3/google/nano-banana-2/edit';
const ATLAS_VIDEO_CREATE_URL = 'https://api.atlasautomation.ink/openapi/v1/video/create';
const ATLAS_VIDEO_QUERY_URL = 'https://api.atlasautomation.ink/openapi/get_task_id';
const ATLAS_VIDEO_MODEL = 'seedance-v1.5-pro-image-to-video';
const ATLAS_VIDEO_ASPECT_RATIO = '16:9';
const ATLAS_VIDEO_GENERATE_AUDIO = false;
const ATLAS_VIDEO_REQUEST_TIMEOUT_MS = 120000;
const ATLAS_VIDEO_STATUS_POLL_INTERVAL_MS = 10000;
const ATLAS_VIDEO_STATUS_MAX_POLLS = 60;
const DEFAULT_THUMBNAIL_VIDEO_TASK_COUNT = 2;
const MAX_THUMBNAIL_VIDEO_TASK_COUNT = 10;
const VOLCENGINE_TTS_API_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse';
const VOLCENGINE_TTS_RESOURCE_ID = 'volc.service_type.10029';
const VOLCENGINE_TTS_AUDIO_FORMAT = 'mp3';
const VOLCENGINE_TTS_SAMPLE_RATE = 24000;
const VOLCENGINE_TTS_REQUEST_TIMEOUT_MS = 180000;
const VOLCENGINE_TTS_EXPLICIT_LANGUAGE = 'en';
const VOLCENGINE_TTS_MODEL = 'bigmodel-tts-v3';
const DEFAULT_MATERIAL_AUDIO_SPEED_RATIO = 1;
const MIN_MATERIAL_AUDIO_SPEED_RATIO = 0.2;
const MAX_MATERIAL_AUDIO_SPEED_RATIO = 3;
const SUMMARY_IMAGE_OBJECT_NAME = 'summary_image.png';
const SUMMARY_IMAGE_JPG_OBJECT_NAME = 'summary_image.jpg';
const STRUCTURED_CONTENT_OBJECT_NAME = 'structured_content.json';
const THUMBNAIL_VIDEO_OBJECT_NAME = 'mp4';
const MATERIAL_AUDIO_OBJECT_NAME = 'mp3';
const SUMMARY_IMAGE_MAX_REFERENCE_IMAGES = 3;
const SUMMARY_IMAGE_JPEG_QUALITY = 46;
const STRUCTURED_CONTENT_MAX_SOURCE_CHARS = 60000;
const STRUCTURED_CONTENT_MAX_PAGE_CHARS = 4000;
const STRUCTURED_CONTENT_MAX_SEGMENTS_PER_PAGE = 6;
const KEY_CONTENT_TEMPLATE_MATERIAL_TITLE_TOKEN = '{{material_title}}';
const KEY_CONTENT_TEMPLATE_PDF_NAME_TOKEN = '{{pdf_name}}';
const KEY_CONTENT_TEMPLATE_PAGE_SOURCE_TOKEN = '{{page_source}}';
const MATERIAL_KEYWORD_EXPLAIN_TEMPLATE_KEYWORDS_TOKEN = '{{keywords}}';
const ANNOTATION_TEMPLATE_TITLE_TOKEN = '{{title}}';
const ANNOTATION_TEMPLATE_SEGMENTS_TOKEN = '{{segments}}';
const ANNOTATION_TEMPLATE_BODY_TOKEN = '{{body}}';
const COMPANION_TEMPLATE_LANGUAGE_TOKEN = '{{language}}';
const SUMMARY_IMAGE_TEMPLATE_TITLE_TOKEN = '{{title}}';
const SUMMARY_IMAGE_TEMPLATE_BODY_TOKEN = '{{body}}';
const SUMMARY_IMAGE_TEMPLATE_MATERIAL_GROUP_TOKEN = '{{material_group}}';
const SUMMARY_IMAGE_TEMPLATE_MATERIAL_NAME_TOKEN = '{{material_name}}';
const SUMMARY_IMAGE_TEMPLATE_KEYWODS_TOKEN = '{{keywods}}';
const SUMMARY_IMAGE_TEMPLATE_KEYWORDS_TOKEN = '{{keywords}}';
export const DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE = [
  '你是教材关键内容提炼助手。',
  '请根据给定 PDF 的逐页解析内容，提炼整个 PDF 的标题、是否正文、正文开始页、正文结束页、正文词数，并按页输出核心段落与建议配图。',
  '返回必须是严格 JSON，不要输出 Markdown，不要解释，不要添加多余字段。',
  'JSON 格式必须为：{"title":"...","main":true,"main_start":2,"main_end":10,"words_count":123,"pages":[{"page":1,"seg":{"seg1":{"seg1_pic":"...","seg1_text":"..."},"seg2":{"seg2_pic":"...","seg2_text":"..."}}}]}。',
  '要求：',
  '0. title 填整个 PDF 的标题；main 填这个 PDF 是否属于正文（true/false）；main_start 和 main_end 填正文起止页码；words_count 填正文词数（整数）。',
  '1. pages 必须覆盖输入中的每一页，page 使用数字页码。',
  '2. seg 中每个 segN 只包含 segN_pic 和 segN_text 两个字段；没有内容时可以省略对应 segN。',
  '3. segN_pic 写该段最适合的配图或画面描述，segN_text 写该段核心内容，保持精炼，不要编造。',
  '4. 尽量保留原文主要语言，不要额外解释。',
  '5. 不要返回 words 字段，words 由系统根据 **Words to Know** 与当前页 seg 内容自动匹配。',
  '',
  `教材名：${KEY_CONTENT_TEMPLATE_MATERIAL_TITLE_TOKEN}`,
  `PDF 名：${KEY_CONTENT_TEMPLATE_PDF_NAME_TOKEN}`,
  '',
  '逐页解析内容：',
  KEY_CONTENT_TEMPLATE_PAGE_SOURCE_TOKEN
].join('\n');
export const DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE = '{{language}}配套图：将这个图中的英文全部改为{{language}}；';
export const DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE = '无内容配套图：将这个图中除了标题以外的文字去掉。';
export const DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE = '生成背景图：将这个图中除了标题以外的文字和文字对应的图片去掉。';
export const DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE = [
  '找出如下句子在图中的位置，并找出各个句子对应图片的位置（不需要返回标注图，只返回格式化 JSON 即可）。',
  '',
  '<标题内容>',
  ANNOTATION_TEMPLATE_TITLE_TOKEN,
  '',
  '<正文内容，每个seg一段>',
  ANNOTATION_TEMPLATE_SEGMENTS_TOKEN,
  '',
  '要求：',
  '1. 返回严格 JSON，不要解释。',
  '2. JSON 结构固定为 {"items":[{"sentence":"...","sentence_role":"title|seg","sentence_order":0,"text_box":{"x":0.1,"y":0.1,"width":0.2,"height":0.1},"image_box":{"x":0.3,"y":0.2,"width":0.25,"height":0.18}}]}。',
  '3. 坐标必须是 0-1 的归一化框。',
  '4. sentence 必须与给定标题或正文段落完全一致。',
  '5. 每个标题或正文段落都要返回一条记录。'
].join('\n');
export const DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE = [
  '用风格：“童话绘本感的信息图插画风（whimsical storybook infographic）”，生成包含如下内容及内容说明的图片，需要逻辑合理，文字不要太小。童话绘本风信息图，手绘水彩插画，柔和粉彩配色，治愈系幻想田园，复古儿童书插图风，细腻线稿，温暖发光氛围，高细节叙事海报，梦幻科普信息图。纯英文。现在图片内容如下：',
  '【教材组】',
  SUMMARY_IMAGE_TEMPLATE_MATERIAL_GROUP_TOKEN,
  '',
  '【教材名】',
  SUMMARY_IMAGE_TEMPLATE_MATERIAL_NAME_TOKEN,
  '',
  '【关键词】',
  SUMMARY_IMAGE_TEMPLATE_KEYWODS_TOKEN,
  '',
  '【标题】',
  SUMMARY_IMAGE_TEMPLATE_TITLE_TOKEN,
  '',
  '【正文】',
  SUMMARY_IMAGE_TEMPLATE_BODY_TOKEN
].join('\n');
export const DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE = [
  '基于这张教材缩略图生成一个 16:9 的短视频镜头，首帧和尾帧保持统一，画面做自然轻微动态变化。',
  '保持童话绘本感的信息图插画风，镜头稳定、构图清晰、节奏舒缓，不要新增画面外的新文字。',
  '【教材组】',
  SUMMARY_IMAGE_TEMPLATE_MATERIAL_GROUP_TOKEN,
  '',
  '【教材名】',
  SUMMARY_IMAGE_TEMPLATE_MATERIAL_NAME_TOKEN,
  '',
  '【关键词】',
  SUMMARY_IMAGE_TEMPLATE_KEYWODS_TOKEN,
  '',
  '【标题】',
  SUMMARY_IMAGE_TEMPLATE_TITLE_TOKEN,
  '',
  '【正文】',
  SUMMARY_IMAGE_TEMPLATE_BODY_TOKEN
].join('\n');

export const DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE = [
  '用简短语言解释如下词汇，json返回。每个词返回：词义数组（meaning，必须是 JSON 数组；如果有多个义项就拆成多项，每项包含 type 和 meaning）、词性汇总（type，例如不及物动词 / 可数名词）、原型（prototype）以及当前关键词与原型的关系（relation，例如 plural of body、third-person singular of swim 等）。例如：{"meaning":[{"type":"adjective","meaning":"xxx"}], "type":"adjective", "prototype":"body", "relation":"plural of body"}',
  '',
  `词汇：${MATERIAL_KEYWORD_EXPLAIN_TEMPLATE_KEYWORDS_TOKEN}`
].join('\n');

const PLACEHOLDER_MESSAGES = {
  slide: 'Slide 生成逻辑待补充',
  audio: '音频生成逻辑待补充',
  video: '视频生成逻辑待补充',
  exercise: '练习生成逻辑待补充',
  summary_image: '摘要图生成逻辑待补充'
};

const MATERIAL_AUDIO_VOICE_OPTIONS = [
  {
    type: 'zh_male_shaonianzixin_moon_bigtts',
    label: '少年梓辛',
    locale: 'zh-CN',
    description: '中文男声',
    recommended: true
  },
  {
    type: 'zh_female_shuangkuaisisi_moon_bigtts',
    label: '爽快思思',
    locale: 'zh-CN',
    description: '中文女声'
  }
];

let materialWorkerStarted = false;
let materialWorkerBusy = false;
let materialWorkerTimer = null;
let materialWorkerId = `material-worker-${process.pid}`;
let materialWorkerFailureCount = 0;
let materialWorkerSuspendUntil = 0;

const safeJsonParse = (value, fallback = {}) => {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const createRetryableError = (message, retryDelaySeconds = 30) => {
  const error = new Error(message);
  error.retryDelaySeconds = retryDelaySeconds;
  return error;
};

const createPermanentError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.noRetry = true;
  return error;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeNullableId = (value) => {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeThumbnailVideoTaskCount = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_THUMBNAIL_VIDEO_TASK_COUNT;
  }

  return Math.min(Math.max(parsed, 1), MAX_THUMBNAIL_VIDEO_TASK_COUNT);
};

const normalizeThumbnailLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return THUMBNAIL_LANGUAGES.includes(normalized) ? normalized : null;
};

const normalizeThumbnailBaseLanguage = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return THUMBNAIL_BASE_LANGUAGES.includes(normalized) ? normalized : null;
};

const normalizeThumbnailScope = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === THUMBNAIL_SCOPE.ALL || normalized === 'material') return THUMBNAIL_SCOPE.ALL;
  if (normalized === THUMBNAIL_SCOPE.SELECTED || normalized === 'pages') return THUMBNAIL_SCOPE.SELECTED;
  return null;
};

const sanitizeDisplayText = (input = '') => {
  return String(input)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const sanitizeMaterialTitle = (input = '') => {
  const value = sanitizeDisplayText(input)
    .replace(/[\\/]+/g, '-')
    .replace(/\.+$/, '')
    .trim();

  return value || '未命名教材';
};

const sanitizeFileStem = (input = '') => {
  const stem = String(input)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return stem || 'material';
};

const sanitizeOssSegment = (input = '') => {
  const segment = sanitizeDisplayText(input)
    .replace(/[\\/:%?#<>*|"]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return segment || 'material';
};

const encodeOssKeyForUrl = (key = '') => {
  return String(key)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
};

const buildLocalPublicUrl = (relativePath) => {
  if (!relativePath) return null;
  return `/${String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '')}`;
};

const resolveOssPublicUrlConfig = () => {
  const endpointRaw = String(process.env.OSS_ENDPOINT || '').trim();
  const bucket = String(process.env.OSS_BUCKET || '').trim() || 'documents-pandada';
  const publicDomain = String(process.env.OSS_PUBLIC_DOMAIN || '').trim().replace(/\/+$/, '');

  if (publicDomain) {
    return {
      bucket,
      hostname: '',
      publicDomain
    };
  }

  if (!endpointRaw || !bucket) {
    return null;
  }

  const endpoint = /^https?:\/\//i.test(endpointRaw) ? endpointRaw : `https://${endpointRaw}`;
  const hostname = endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!hostname) return null;

  return {
    bucket,
    hostname,
    publicDomain: ''
  };
};

const buildAssetOutputUrl = (outputPath) => {
  if (!outputPath) return null;
  if (/^https?:\/\//i.test(outputPath)) return outputPath;

  if (String(outputPath).startsWith(MATERIAL_OSS_ROOT_PREFIX)) {
    const publicUrlConfig = resolveOssPublicUrlConfig();
    return publicUrlConfig ? buildOssPublicUrl(publicUrlConfig, outputPath) : null;
  }

  return buildLocalPublicUrl(outputPath);
};

const ensureDirectory = async (targetDir) => {
  await fsp.mkdir(targetDir, { recursive: true });
};

const cleanupUploadedFiles = async (files = []) => {
  await Promise.all((files || []).map(async (file) => {
    if (!file?.path) return;

    try {
      await fsp.unlink(file.path);
    } catch (_error) {
      // ignore cleanup failures
    }
  }));
};

const normalizeUploadedFiles = (req) => {
  if (Array.isArray(req.files)) {
    return req.files;
  }

  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files)
      .flat()
      .filter(Boolean);
  }

  return [];
};

const resolveOssConfig = () => {
  const accessKeyId = String(process.env.OSS_ACCESS_KEY_ID || '').trim();
  const accessKeySecret = String(process.env.OSS_ACCESS_KEY_SECRET || '').trim();
  const endpointRaw = String(process.env.OSS_ENDPOINT || '').trim();
  const bucket = String(process.env.OSS_BUCKET || '').trim() || 'documents-pandada';
  const publicDomain = String(process.env.OSS_PUBLIC_DOMAIN || '').trim();

  if (!accessKeyId || !accessKeySecret || !endpointRaw || !bucket) {
    throw createHttpError('未配置完整的 OSS 环境变量', 500);
  }

  const endpoint = /^https?:\/\//i.test(endpointRaw) ? endpointRaw : `https://${endpointRaw}`;
  const hostname = endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const region = hostname.endsWith('.aliyuncs.com')
    ? hostname.replace(/\.aliyuncs\.com$/i, '')
    : undefined;

  return {
    accessKeyId,
    accessKeySecret,
    endpoint,
    hostname,
    region,
    bucket,
    publicDomain: publicDomain.replace(/\/+$/, '')
  };
};

const createOssClient = (config = resolveOssConfig()) => {
  return new OSS({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    endpoint: config.endpoint,
    region: config.region,
    secure: true,
    timeout: '60000'
  });
};

const buildOssPublicUrl = (config, key) => {
  if (!key) return null;

  const encodedKey = encodeOssKeyForUrl(key);
  if (config.publicDomain) {
    return `${config.publicDomain}/${encodedKey}`;
  }

  return `https://${config.bucket}.${config.hostname}/${encodedKey}`;
};

const resolveDoubaoConfig = () => {
  const apiKey = String(process.env.DOUBAO_APIKEY || '').trim();
  if (!apiKey) {
    throw createPermanentError('未配置 DOUBAO_APIKEY 环境变量', 500);
  }

  return {
    apiKey,
    apiUrl: String(process.env.DOUBAO_API_URL || DOUBAO_API_URL).trim() || DOUBAO_API_URL,
    model: String(process.env.DOUBAO_MODEL || DOUBAO_MODEL).trim() || DOUBAO_MODEL
  };
};

const resolveWaveSpeedConfig = () => {
  const apiKey = String(process.env.WAVESPEED_APIKEY || '').trim();
  if (!apiKey) {
    throw createHttpError('未配置 WAVESPEED_APIKEY 环境变量', 500);
  }

  return {
    apiKey,
    apiUrl: String(process.env.WAVESPEED_API_URL || WAVESPEED_API_URL).trim() || WAVESPEED_API_URL
  };
};

const resolveAtlasVideoConfig = () => {
  const apiKey = String(process.env.TOKEN_ROUTER_ATLAS_API_KEY || '').trim();
  if (!apiKey) {
    throw createHttpError('未配置 TOKEN_ROUTER_ATLAS_API_KEY 环境变量', 500);
  }

  return {
    apiKey,
    createUrl: String(process.env.TOKEN_ROUTER_ATLAS_VIDEO_CREATE_URL || ATLAS_VIDEO_CREATE_URL).trim() || ATLAS_VIDEO_CREATE_URL,
    queryUrl: String(process.env.TOKEN_ROUTER_ATLAS_VIDEO_QUERY_URL || ATLAS_VIDEO_QUERY_URL).trim() || ATLAS_VIDEO_QUERY_URL,
    modelName: String(process.env.TOKEN_ROUTER_ATLAS_VIDEO_MODEL || ATLAS_VIDEO_MODEL).trim() || ATLAS_VIDEO_MODEL
  };
};

const normalizeMaterialAudioVoiceType = (value) => {
  const normalized = String(value || '').trim();
  return MATERIAL_AUDIO_VOICE_OPTIONS.some((item) => item.type === normalized) ? normalized : null;
};

const normalizeMaterialAudioSpeedRatio = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MATERIAL_AUDIO_SPEED_RATIO;
  }

  const clamped = Math.min(Math.max(parsed, MIN_MATERIAL_AUDIO_SPEED_RATIO), MAX_MATERIAL_AUDIO_SPEED_RATIO);
  return Math.round(clamped * 100) / 100;
};

const getMaterialAudioVoiceOption = (voiceType) => {
  return MATERIAL_AUDIO_VOICE_OPTIONS.find((item) => item.type === voiceType) || null;
};

const resolveVolcengineTtsConfig = () => {
  const appId = String(
    process.env.VOLCENGINE_TTS_APP_ID
    || process.env.VOLCENGINE_APP_ID
    || ''
  ).trim();
  const accessToken = String(
    process.env.VOLCENGINE_TTS_ACCESS_TOKEN
    || process.env.VOLCENGINE_ACCESS_TOKEN
    || ''
  ).trim();
  const secretKey = String(
    process.env.VOLCENGINE_TTS_SECRET_KEY
    || process.env.VOLCENGINE_SECRET_KEY
    || ''
  ).trim();

  if (!appId || !accessToken) {
    throw createHttpError('Volcengine TTS environment variables are incomplete', 500);
  }

  const sampleRate = Number.parseInt(process.env.VOLCENGINE_TTS_SAMPLE_RATE || '', 10) || VOLCENGINE_TTS_SAMPLE_RATE;
  const timeoutMs = Number.parseInt(process.env.VOLCENGINE_TTS_REQUEST_TIMEOUT_MS || '', 10) || VOLCENGINE_TTS_REQUEST_TIMEOUT_MS;
  const explicitLanguage = String(process.env.VOLCENGINE_TTS_EXPLICIT_LANGUAGE || VOLCENGINE_TTS_EXPLICIT_LANGUAGE).trim();

  return {
    appId,
    accessToken,
    secretKey,
    apiUrl: String(process.env.VOLCENGINE_TTS_API_URL || VOLCENGINE_TTS_API_URL).trim() || VOLCENGINE_TTS_API_URL,
    resourceId: String(process.env.VOLCENGINE_TTS_RESOURCE_ID || VOLCENGINE_TTS_RESOURCE_ID).trim() || VOLCENGINE_TTS_RESOURCE_ID,
    audioFormat: String(process.env.VOLCENGINE_TTS_AUDIO_FORMAT || VOLCENGINE_TTS_AUDIO_FORMAT).trim() || VOLCENGINE_TTS_AUDIO_FORMAT,
    sampleRate,
    timeoutMs,
    explicitLanguage
  };
};

const normalizeMaterialKeyContentPromptTemplate = (template) => {
  const normalized = String(template || '').trim() || DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE;
  const requiredTokens = [
    KEY_CONTENT_TEMPLATE_MATERIAL_TITLE_TOKEN,
    KEY_CONTENT_TEMPLATE_PDF_NAME_TOKEN,
    KEY_CONTENT_TEMPLATE_PAGE_SOURCE_TOKEN
  ];

  const missingToken = requiredTokens.find((token) => !normalized.includes(token));
  if (missingToken) {
    throw createHttpError(`关键内容提炼提示词模板必须保留 ${missingToken}`, 400);
  }

  return normalized;
};

const countSubstringOccurrences = (value, needle) => {
  if (!value || !needle) return 0;
  return String(value).split(needle).length - 1;
};

const isObviouslyCorruptedMaterialKeyContentPromptTemplate = (template) => {
  const normalized = String(template || '').trim();
  if (!normalized) return false;

  const questionMarkCount = countSubstringOccurrences(normalized, '?');
  const replacementCharCount = countSubstringOccurrences(normalized, '\uFFFD');
  const suspiciousCount = questionMarkCount + replacementCharCount;

  return suspiciousCount >= 20 && suspiciousCount / Math.max(normalized.length, 1) >= 0.08;
};

export const resolveMaterialKeyContentPromptTemplate = (template) => {
  const normalized = String(template || '').trim();
  if (!normalized || isObviouslyCorruptedMaterialKeyContentPromptTemplate(normalized)) {
    return DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE;
  }

  try {
    return normalizeMaterialKeyContentPromptTemplate(normalized);
  } catch (_) {
    return DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE;
  }
};

const renderMaterialKeyContentPrompt = (template, { materialTitle, pdfName, pageSource }) => {
  return normalizeMaterialKeyContentPromptTemplate(template)
    .replaceAll(KEY_CONTENT_TEMPLATE_MATERIAL_TITLE_TOKEN, String(materialTitle || '').trim())
    .replaceAll(KEY_CONTENT_TEMPLATE_PDF_NAME_TOKEN, String(pdfName || '').trim())
    .replaceAll(KEY_CONTENT_TEMPLATE_PAGE_SOURCE_TOKEN, String(pageSource || '').trim());
};

const buildMaterialKeyContentFinalPrompt = (template, { materialTitle, pdfName, pageSource }) => {
  const renderedPrompt = renderMaterialKeyContentPrompt(template, {
    materialTitle,
    pdfName,
    pageSource
  });

  return [
    renderedPrompt,
    '',
    '系统附加要求（必须遵守）：',
    '1. 返回严格 JSON，根层固定包含 title、main、main_start、main_end、words_count、pages 六个字段。',
    '2. title 为整个 PDF 的标题字符串。',
    '3. main 为这个 PDF 是否属于正文，返回 true 或 false。',
    '4. main_start 和 main_end 为正文开始页与结束页，返回正整数页码；如果不是正文，可返回 null。',
    '5. words_count 为正文词数，返回非负整数。',
    '6. pages 继续按页返回 seg 结构，不要省略。每一句为一个 seg（例如英文句号、感叹号、问号等分隔）。'
  ].join('\n');
};

const normalizeMaterialKeywordExplainPromptTemplate = (template) => {
  const normalized = String(template || '').trim() || DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE;
  if (!normalized.includes(MATERIAL_KEYWORD_EXPLAIN_TEMPLATE_KEYWORDS_TOKEN)) {
    throw createHttpError(`关键词解释提示词模板必须保留 ${MATERIAL_KEYWORD_EXPLAIN_TEMPLATE_KEYWORDS_TOKEN}`, 400);
  }

  return normalized;
};

export const resolveMaterialKeywordExplainPromptTemplate = (template) => {
  const normalized = String(template || '').trim();
  if (!normalized) {
    return DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE;
  }

  try {
    return normalizeMaterialKeywordExplainPromptTemplate(normalized);
  } catch (_) {
    return DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE;
  }
};

const renderMaterialKeywordExplainPrompt = (template, keywords = []) => {
  const keywordsText = (Array.isArray(keywords) ? keywords : [])
    .map((keyword) => normalizeStructuredContentValue(keyword))
    .filter(Boolean)
    .join('\n');

  return normalizeMaterialKeywordExplainPromptTemplate(template)
    .replaceAll(MATERIAL_KEYWORD_EXPLAIN_TEMPLATE_KEYWORDS_TOKEN, keywordsText);
};

const buildMaterialKeywordExplainFinalPrompt = (template, keywords = []) => {
  const renderedPrompt = renderMaterialKeywordExplainPrompt(template, keywords);
  return [
    renderedPrompt,
    '',
    '系统附加要求（必须遵守）：',
    '1. 只返回 JSON 数组，不要 Markdown，不要解释。',
    '2. 数组每一项必须固定包含 keyword、meaning、type、prototype、relation 五个字段。',
    '3. keyword 必须与输入词汇逐项对应，保持原词，不要改写。',
    '4. meaning 必须是 JSON 数组；如果有多个义项就返回多个对象。每个义项对象只包含 type、meaning 两个字段。',
    '5. type 写当前关键词所有义项的词性汇总，例如 不及物动词 / 可数名词；如果无法判断可写空字符串。',
    '6. prototype 写当前词的原型或基本形式；如果当前词本身就是原型，可以填写当前词本身。',
    '7. relation 写当前词与原型的完整关系，例如 plural of body、third-person singular of swim、past tense of go；如果没有特殊关系可写空字符串。',
    '8. 如果某个词无法解释，也要返回该词的 keyword，并将 meaning 设为 []，其他字段设为空字符串。',
    '9. 不要输出额外字段，不要遗漏输入词。'
  ].join('\n');
};

const normalizeThumbnailAnnotationPromptTemplate = (template) => {
  const normalized = String(template || '').trim() || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE;
  if (!normalized.includes(ANNOTATION_TEMPLATE_TITLE_TOKEN)) {
    throw createHttpError(`位置标定提示词模板必须保留 ${ANNOTATION_TEMPLATE_TITLE_TOKEN}`, 400);
  }
  if (!normalized.includes(ANNOTATION_TEMPLATE_SEGMENTS_TOKEN) && !normalized.includes(ANNOTATION_TEMPLATE_BODY_TOKEN)) {
    throw createHttpError(`位置标定提示词模板必须保留 ${ANNOTATION_TEMPLATE_SEGMENTS_TOKEN} 或 ${ANNOTATION_TEMPLATE_BODY_TOKEN}`, 400);
  }

  return normalized;
};

const renderThumbnailAnnotationPromptTemplate = (template, { title, segments, body }) => {
  const normalizedTitle = normalizeStructuredContentValue(title);
  const normalizedSegments = getOrderedSegmentTexts(segments || {}).join('\n');
  const normalizedBody = normalizeStructuredContentValue(body) || normalizedSegments;
  return normalizeThumbnailAnnotationPromptTemplate(template)
    .replaceAll(ANNOTATION_TEMPLATE_TITLE_TOKEN, normalizedTitle)
    .replaceAll(ANNOTATION_TEMPLATE_SEGMENTS_TOKEN, normalizedSegments)
    .replaceAll(ANNOTATION_TEMPLATE_BODY_TOKEN, normalizedBody)
    .trim();
};

const normalizeThumbnailCompanionLanguagePromptTemplate = (template) => {
  const normalized = String(template || '').trim() || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE;
  if (!normalized.includes(COMPANION_TEMPLATE_LANGUAGE_TOKEN)) {
    throw createHttpError(`配套图语言提示词模板必须保留 ${COMPANION_TEMPLATE_LANGUAGE_TOKEN}`, 400);
  }

  return normalized;
};

const renderThumbnailCompanionLanguagePrompt = (template, languageLabel) => {
  return normalizeThumbnailCompanionLanguagePromptTemplate(template)
    .replaceAll(COMPANION_TEMPLATE_LANGUAGE_TOKEN, String(languageLabel || '').trim());
};

const normalizeThumbnailCompanionTextlessPromptTemplate = (template) => {
  return String(template || '').trim() || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE;
};

const normalizeThumbnailCompanionBackgroundPromptTemplate = (template) => {
  return String(template || '').trim() || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE;
};

const normalizeSummaryImagePromptTemplate = (template) => {
  const normalized = String(template || '').trim() || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE;
  if (!normalized.includes(SUMMARY_IMAGE_TEMPLATE_TITLE_TOKEN) || !normalized.includes(SUMMARY_IMAGE_TEMPLATE_BODY_TOKEN)) {
    throw createHttpError(`摘要图提示词模板必须保留 ${SUMMARY_IMAGE_TEMPLATE_TITLE_TOKEN} 和 ${SUMMARY_IMAGE_TEMPLATE_BODY_TOKEN}`, 400);
  }

  return normalized;
};

const renderSummaryImagePrompt = (template, {
  title,
  body,
  materialGroup,
  materialName,
  keywords
}) => {
  const normalizedKeywords = Array.isArray(keywords)
    ? keywords.map((keyword) => normalizeStructuredContentValue(keyword)).filter(Boolean).join(', ')
    : normalizeStructuredContentValue(keywords);

  return normalizeSummaryImagePromptTemplate(template)
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_MATERIAL_GROUP_TOKEN, String(materialGroup || '').trim())
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_MATERIAL_NAME_TOKEN, String(materialName || '').trim())
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_KEYWODS_TOKEN, normalizedKeywords)
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_KEYWORDS_TOKEN, normalizedKeywords)
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_TITLE_TOKEN, String(title || '').trim())
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_BODY_TOKEN, String(body || '').trim());
};

const normalizeThumbnailVideoPromptTemplate = (template) => {
  return String(template || '').trim() || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE;
};

const renderThumbnailVideoPrompt = (template, {
  title,
  body,
  materialGroup,
  materialName,
  keywords
}) => {
  const normalizedKeywords = Array.isArray(keywords)
    ? keywords.map((keyword) => normalizeStructuredContentValue(keyword)).filter(Boolean).join(', ')
    : normalizeStructuredContentValue(keywords);

  return normalizeThumbnailVideoPromptTemplate(template)
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_MATERIAL_GROUP_TOKEN, String(materialGroup || '').trim())
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_MATERIAL_NAME_TOKEN, String(materialName || '').trim())
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_KEYWODS_TOKEN, normalizedKeywords)
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_KEYWORDS_TOKEN, normalizedKeywords)
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_TITLE_TOKEN, String(title || '').trim())
    .replaceAll(SUMMARY_IMAGE_TEMPLATE_BODY_TOKEN, String(body || '').trim());
};

const extractJsonObject = (rawText) => {
  const direct = safeJsonParse(rawText, null);
  if (direct && typeof direct === 'object') {
    return direct;
  }

  const text = String(rawText || '').trim();
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const parsed = safeJsonParse(fencedMatch[1], null);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  }

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const parsed = safeJsonParse(text.slice(jsonStart, jsonEnd + 1), null);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  }

  return null;
};

const extractJsonArray = (rawText) => {
  const direct = safeJsonParse(rawText, null);
  if (Array.isArray(direct)) {
    return direct;
  }
  if (direct && typeof direct === 'object') {
    if (Array.isArray(direct.items)) return direct.items;
    if (Array.isArray(direct.data)) return direct.data;
    if (Array.isArray(direct.list)) return direct.list;
    return [direct];
  }

  const text = String(rawText || '').trim();
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const parsed = extractJsonArray(fencedMatch[1]);
    if (parsed) {
      return parsed;
    }
  }

  const jsonStart = text.indexOf('[');
  const jsonEnd = text.lastIndexOf(']');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const parsed = safeJsonParse(text.slice(jsonStart, jsonEnd + 1), null);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  }

  return null;
};

const normalizeStructuredContentValue = (value) => {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
};

const normalizeStructuredPageNumber = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const truncateText = (value, maxChars) => {
  const normalized = normalizeStructuredContentValue(value);
  if (!maxChars || normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxChars - 1, 0)).trimEnd()}…`;
};

const extractWordsToKnowFromMarkdown = (contentMarkdown) => {
  const normalized = normalizeStructuredContentValue(contentMarkdown);
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const headingPattern = /^(?:#{1,6}\s*)?(?:\*\*)?\s*words to know\s*(?:\*\*)?\s*:?\s*(.*)$/i;
  const headingLikePattern = /^(?:#{1,6}\s+|(?:\*\*)[^*\n]+(?:\*\*)\s*:?\s*$|[A-Z][A-Za-z0-9 ,&'/-]{0,60}:\s*$)/;
  const rawTerms = [];

  const appendWordsToKnowCandidates = (rawValue) => {
    const cleanedLine = String(rawValue || '')
      .trim()
      .replace(/^[-*•\d.)\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedLine) return;

    const boldMatches = [...cleanedLine.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1].trim()).filter(Boolean);
    if (boldMatches.length) {
      rawTerms.push(...boldMatches);
      return;
    }

    const splitCandidates = cleanedLine.split(/[,;/、]/).map((part) => part.trim()).filter(Boolean);
    if (splitCandidates.length > 1 && splitCandidates.every((part) => part.length <= 40)) {
      rawTerms.push(...splitCandidates);
      return;
    }

    const whitespaceCandidates = cleanedLine
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (
      whitespaceCandidates.length > 1
      && whitespaceCandidates.length <= 16
      && whitespaceCandidates.every((part) => /^[\p{L}\p{N}'-]{1,30}$/u.test(part))
    ) {
      rawTerms.push(...whitespaceCandidates);
      return;
    }

    const pairMatch = cleanedLine.match(/^([^:：-]{1,60})\s*[:：-]\s*(.+)$/);
    if (pairMatch?.[1]) {
      rawTerms.push(pairMatch[1].trim());
      return;
    }

    if (cleanedLine.length <= 60) {
      rawTerms.push(cleanedLine);
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const headingMatch = lines[index].trim().match(headingPattern);
    if (!headingMatch) continue;

    const inlineTerms = String(headingMatch[1] || '').trim();
    if (inlineTerms) {
      appendWordsToKnowCandidates(inlineTerms);
    }

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const rawLine = lines[cursor];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        const nextNonEmpty = lines.slice(cursor + 1).find((line) => line.trim());
        if (!nextNonEmpty || headingLikePattern.test(nextNonEmpty.trim())) {
          break;
        }
        continue;
      }

      if (headingPattern.test(trimmed) || headingLikePattern.test(trimmed)) {
        break;
      }
      appendWordsToKnowCandidates(trimmed);
    }
  }

  const uniqueTerms = [];
  const seen = new Set();

  rawTerms.forEach((term) => {
    const normalizedTerm = term
      .replace(/^[“"'`(（\[]+/, '')
      .replace(/[”"'`)\]）.,;:!?]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalizedTerm) return;

    const lookup = normalizedTerm.toLowerCase();
    if (seen.has(lookup)) return;
    seen.add(lookup);
    uniqueTerms.push(normalizedTerm);
  });

  return uniqueTerms;
};

const getOrderedSegmentTexts = (segments = {}) => {
  return Object.entries(segments || {})
    .sort((left, right) => {
      const leftIndex = normalizeStructuredPageNumber(String(left[0]).replace(/[^0-9]/g, ''), 0);
      const rightIndex = normalizeStructuredPageNumber(String(right[0]).replace(/[^0-9]/g, ''), 0);
      return leftIndex - rightIndex;
    })
    .map(([, value]) => {
      if (!value || typeof value !== 'object') return '';
      const textKey = Object.keys(value).find((key) => /_text$/i.test(key));
      return normalizeStructuredContentValue(textKey ? value[textKey] : '');
    })
    .filter(Boolean);
};

const getOrderedSegmentEntries = (segments = {}) => {
  return Object.entries(segments || {})
    .sort((left, right) => {
      const leftIndex = normalizeStructuredPageNumber(String(left[0]).replace(/[^0-9]/g, ''), 0);
      const rightIndex = normalizeStructuredPageNumber(String(right[0]).replace(/[^0-9]/g, ''), 0);
      return leftIndex - rightIndex;
    })
    .map(([key, value], index) => {
      if (!value || typeof value !== 'object') return null;
      const match = String(key || '').match(/seg(\d+)/i);
      const order = normalizeStructuredPageNumber(match?.[1], index + 1);
      const textKey = Object.keys(value).find((key) => /_text$/i.test(key));
      const picKey = Object.keys(value).find((key) => /_pic$/i.test(key));
      const text = normalizeStructuredContentValue(textKey ? value[textKey] : '');
      const pic = normalizeStructuredContentValue(picKey ? value[picKey] : '');
      if (!text) return null;

      return {
        order,
        text,
        pic
      };
    })
    .filter(Boolean);
};

const normalizeWordsToKnowLookupText = (value) => {
  return normalizeStructuredContentValue(value)
    .toLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const pickWordsToKnowForSegments = ({ wordsToKnow = [], segments = {} }) => {
  if (!Array.isArray(wordsToKnow) || !wordsToKnow.length) return [];

  const segmentTexts = getOrderedSegmentTexts(segments);
  if (!segmentTexts.length) return [];

  const haystack = ` ${normalizeWordsToKnowLookupText(segmentTexts.join('\n'))} `;
  if (!haystack.trim()) return [];

  return wordsToKnow
    .map((word) => normalizeStructuredContentValue(word))
    .filter(Boolean)
    .filter((word, index, list) => (
      list.findIndex((candidate) => candidate.toLowerCase() === word.toLowerCase()) === index
    ))
    .filter((word) => {
      const needle = normalizeWordsToKnowLookupText(word);
      if (!needle) return false;
      return haystack.includes(` ${needle} `);
    });
};

const assignWordsToKnowFirstOccurrences = ({ wordsToKnow = [], pages = [] }) => {
  if (!Array.isArray(pages) || !pages.length) return [];

  const seenWords = new Set();

  return pages.map((pageEntry) => {
    const matchedWords = pickWordsToKnowForSegments({
      wordsToKnow,
      segments: pageEntry?.seg || {}
    });

    const firstOccurrenceWords = matchedWords.filter((word) => {
      const lookup = normalizeWordsToKnowLookupText(word);
      if (!lookup || seenWords.has(lookup)) {
        return false;
      }

      seenWords.add(lookup);
      return true;
    });

    return {
      ...pageEntry,
      words: firstOccurrenceWords
    };
  });
};

const collectPdfKeywordsFromPages = (pages = []) => {
  const orderedKeywords = [];
  const seen = new Set();

  for (const pageEntry of pages || []) {
    const pageWords = Array.isArray(pageEntry?.words) ? pageEntry.words : [];
    for (const word of pageWords) {
      const normalized = normalizeStructuredContentValue(word);
      const lookup = normalizeMaterialKeywordLookup(normalized);
      if (!normalized || seen.has(lookup)) continue;
      seen.add(lookup);
      orderedKeywords.push(normalized);
    }
  }

  return orderedKeywords;
};

function normalizeMaterialKeywordLookup(value) {
  return normalizeStructuredContentValue(value).toLowerCase();
}

const normalizeMaterialKeywordSenseItem = (sense) => {
  if (!sense || typeof sense !== 'object') return null;

  const normalizedType = normalizeStructuredContentValue(
    sense.type ?? sense.partOfSpeech ?? sense.pos ?? sense.wordClass ?? ''
  ) || null;
  const normalizedMeaning = normalizeStructuredContentValue(
    sense.meaning ?? sense.definition ?? sense.explanation ?? sense.gloss ?? ''
  ) || null;

  if (!normalizedType && !normalizedMeaning) {
    return null;
  }

  return {
    type: normalizedType,
    meaning: normalizedMeaning
  };
};

const normalizeMaterialKeywordMeaningPayload = (meaning, fallbackType = null) => {
  const normalizeSenseList = (candidate) => {
    const senses = (Array.isArray(candidate) ? candidate : [])
      .map((item) => normalizeMaterialKeywordSenseItem(item))
      .filter(Boolean);

    return senses.length ? senses : null;
  };

  const directSenses = normalizeSenseList(meaning);
  if (directSenses) {
    return directSenses;
  }

  if (meaning && typeof meaning === 'object') {
    const nestedSenses = normalizeSenseList(
      meaning.senses ?? meaning.items ?? meaning.meanings ?? null
    );
    if (nestedSenses) {
      return nestedSenses;
    }

    const singleSense = normalizeMaterialKeywordSenseItem(meaning);
    if (singleSense) {
      return [singleSense];
    }
  }

  const normalizedMeaning = normalizeStructuredContentValue(
    typeof meaning === 'string' ? meaning : ''
  ) || null;
  if (normalizedMeaning) {
    const parsedMeaning = safeJsonParse(normalizedMeaning, null);
    if (parsedMeaning && parsedMeaning !== meaning) {
      const parsedSenses = normalizeMaterialKeywordMeaningPayload(parsedMeaning, fallbackType);
      if (parsedSenses) {
        return parsedSenses;
      }
    }
  }

  const normalizedType = normalizeStructuredContentValue(fallbackType) || null;
  if (!normalizedMeaning && !normalizedType) {
    return null;
  }

  return [{
    type: normalizedType,
    meaning: normalizedMeaning
  }];
};

const summarizeMaterialKeywordTypes = (explicitType, senses = []) => {
  const normalizedExplicitType = normalizeStructuredContentValue(explicitType) || null;
  if (normalizedExplicitType) {
    return normalizedExplicitType;
  }

  const uniqueTypes = [...new Set(
    (Array.isArray(senses) ? senses : [])
      .map((sense) => normalizeStructuredContentValue(sense?.type))
      .filter(Boolean)
  )];

  return uniqueTypes.length ? uniqueTypes.join(' / ') : null;
};

const hasResolvedMaterialKeywordMeaningPayload = (value) => {
  const normalizedValue = normalizeStructuredContentValue(value);
  if (!normalizedValue) return false;

  const parsedValue = safeJsonParse(normalizedValue, null);
  const senseCandidates = Array.isArray(parsedValue)
    ? parsedValue
    : Array.isArray(parsedValue?.senses)
      ? parsedValue.senses
      : parsedValue && typeof parsedValue === 'object'
        ? [parsedValue]
        : null;

  if (senseCandidates) {
    return senseCandidates.some((sense) => Boolean(
      normalizeStructuredContentValue(sense?.type)
      || normalizeStructuredContentValue(sense?.meaning)
    ));
  }

  return Boolean(normalizedValue);
};

const createMaterialKeywordRow = ({
  keyword,
  meaning = null,
  type = null,
  prototype = null,
  relation = null
}) => {
  const normalizedKeyword = normalizeStructuredContentValue(keyword);
  const keywordLookup = normalizeMaterialKeywordLookup(normalizedKeyword);
  if (!normalizedKeyword || !keywordLookup) return null;
  const normalizedMeaningPayload = normalizeMaterialKeywordMeaningPayload(meaning, type);
  const normalizedMeaning = normalizedMeaningPayload?.length
    ? JSON.stringify(normalizedMeaningPayload)
    : null;
  const normalizedType = summarizeMaterialKeywordTypes(type, normalizedMeaningPayload);
  const normalizedPrototype = normalizeStructuredContentValue(prototype) || null;
  const normalizedRelation = normalizeStructuredContentValue(relation) || null;
  const hasStructuredExplainFields = Boolean(
    normalizedMeaning
    || normalizedType
    || normalizedPrototype
    || normalizedRelation
  );

  return {
    keyword: normalizedKeyword,
    keywordLookup,
    meaning: normalizedMeaning,
    type: normalizedType,
    prototype: normalizedPrototype || (hasStructuredExplainFields ? normalizedKeyword : null),
    relation: normalizedRelation
  };
};

const isMaterialKeywordMeaningResolved = (row) => {
  return Boolean(
    hasResolvedMaterialKeywordMeaningPayload(row?.meaning)
    || normalizeStructuredContentValue(row?.type)
  );
};

const normalizeStructuredTitleCandidate = (value) => {
  return normalizeStructuredContentValue(value)
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/^!?\[[^\]]*]\([^)]+\)\s*$/, '')
    .replace(/\*\*/g, '')
    .replace(/__+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const isStructuredTitleNoise = (value) => {
  const normalized = normalizeStructuredTitleCandidate(value);
  if (!normalized) return true;

  return [
    /^leveled book\b/i,
    /^written by\b/i,
    /^www\./i,
    /^focus question\b/i,
    /^words to know\b/i,
    /^photo credits\b/i,
    /^correlation\b/i,
    /^connections\b/i,
    /^writing and art\b/i,
    /^science and art\b/i,
    /^a reading a-z\b/i,
    /^word count\b/i,
    /^all rights reserved\b/i,
    /^front cover\b/i
  ].some((pattern) => pattern.test(normalized));
};

const extractTitleFromSourcePages = (sourcePages = []) => {
  const normalizedLines = [];
  (sourcePages || []).forEach((page) => {
    normalizeStructuredContentValue(page.contentMarkdown)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => normalizedLines.push(line));
  });

  const headingLines = normalizedLines
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => normalizeStructuredTitleCandidate(line))
    .filter((line) => line && !isStructuredTitleNoise(line));
  if (headingLines.length) {
    return headingLines[0];
  }

  const contentLines = normalizedLines
    .map((line) => normalizeStructuredTitleCandidate(line))
    .filter((line) => (
      line
      && !line.startsWith('![')
      && !line.startsWith('|')
      && !isStructuredTitleNoise(line)
      && !/^https?:\/\//i.test(line)
      && !/^[\d\s./-]+$/.test(line)
      && /[\p{L}\p{N}]/u.test(line)
    ));
  if (contentLines.length) {
    return contentLines[0];
  }

  return '';
};

const deriveStructuredContentTitle = ({ parsedTitle, sourcePages, pdf, material }) => {
  const candidates = [
    parsedTitle,
    extractTitleFromSourcePages(sourcePages),
    pdf?.displayName ? String(pdf.displayName).replace(/^[\d\s._-]+/, '').replace(/\bpassword[_ -]?removed\b/ig, '').replace(/[_-]+/g, ' ') : '',
    pdf?.originalFileName ? path.parse(String(pdf.originalFileName)).name.replace(/^[\d\s._-]+/, '').replace(/\bpassword[_ -]?removed\b/ig, '').replace(/[_-]+/g, ' ') : '',
    material?.title
  ];

  const title = candidates
    .map((value) => normalizeStructuredTitleCandidate(value))
    .find((value) => value && !isStructuredTitleNoise(value));

  return title || '未命名内容';
};

const normalizeStructuredMainValue = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value !== 0;
    return null;
  }

  const normalized = normalizeStructuredContentValue(value).toLowerCase();
  if (!normalized) return null;

  if ([
    'true', '1', 'yes', 'y', '是', '正文', '主文', 'main', 'body', 'body_text'
  ].includes(normalized)) {
    return true;
  }

  if ([
    'false', '0', 'no', 'n', '否', '非正文', '封面', '目录', '版权页', '附录', '练习'
  ].includes(normalized)) {
    return false;
  }

  if (normalized.includes('非正文')) return false;
  if (normalized.includes('正文')) return true;
  return null;
};

const normalizeStructuredWordsCountValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number'
    ? value
    : Number.parseInt(String(value).replace(/[^0-9-]/g, ''), 10);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.round(numericValue));
};

const countWordsFromText = (value) => {
  const normalized = normalizeStructuredContentValue(value)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[_*#`>|~\-]+/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 0;

  const latinWords = normalized.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
  const cjkChunks = normalized.match(/[\p{Script=Han}]+/gu) || [];
  const cjkCount = cjkChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  return latinWords.length + cjkCount;
};

const estimateWordsCountFromSourcePages = (sourcePages = []) => {
  return (sourcePages || []).reduce((sum, page) => sum + countWordsFromText(page?.contentMarkdown || ''), 0);
};

const estimateWordsCountFromStructuredPages = (pages = []) => {
  return (pages || []).reduce((sum, pageEntry) => {
    const segmentText = getOrderedSegmentTexts(pageEntry?.seg || {}).join('\n');
    return sum + countWordsFromText(segmentText);
  }, 0);
};

const deriveStructuredContentMain = ({ parsedMain, sourcePages, pages }) => {
  const normalized = normalizeStructuredMainValue(parsedMain);
  if (normalized !== null) {
    return normalized;
  }

  const sourceWordCount = estimateWordsCountFromSourcePages(sourcePages);
  const structuredWordCount = estimateWordsCountFromStructuredPages(pages);
  return sourceWordCount > 0 || structuredWordCount > 0;
};

const deriveStructuredContentWordsCount = ({ parsedWordsCount, sourcePages, pages, main }) => {
  const normalized = normalizeStructuredWordsCountValue(parsedWordsCount);
  if (normalized !== null) {
    return normalized;
  }

  if (main === false) {
    return 0;
  }

  const sourceWordCount = estimateWordsCountFromSourcePages(sourcePages);
  if (sourceWordCount > 0) {
    return sourceWordCount;
  }

  return estimateWordsCountFromStructuredPages(pages);
};

const deriveStructuredContentMainRange = ({
  parsedMainStart,
  parsedMainEnd,
  sourcePages,
  pages,
  main
}) => {
  if (main === false) {
    return { mainStart: null, mainEnd: null };
  }

  const sourcePageNumbers = (sourcePages || [])
    .map((page) => normalizeStructuredPageNumber(page?.page, 0))
    .filter((page) => page > 0)
    .sort((left, right) => left - right);
  const structuredPageNumbers = (pages || [])
    .filter((pageEntry) => {
      const segmentTexts = getOrderedSegmentTexts(pageEntry?.seg || {});
      return segmentTexts.length > 0 || (Array.isArray(pageEntry?.words) && pageEntry.words.length > 0);
    })
    .map((pageEntry) => normalizeStructuredPageNumber(pageEntry?.page, 0))
    .filter((page) => page > 0)
    .sort((left, right) => left - right);

  const fallbackNumbers = structuredPageNumbers.length ? structuredPageNumbers : sourcePageNumbers;
  if (!fallbackNumbers.length) {
    return { mainStart: null, mainEnd: null };
  }

  const minPage = fallbackNumbers[0];
  const maxPage = fallbackNumbers[fallbackNumbers.length - 1];
  let mainStart = normalizeStructuredMainRangePageValue(parsedMainStart) ?? minPage;
  let mainEnd = normalizeStructuredMainRangePageValue(parsedMainEnd) ?? maxPage;

  mainStart = Math.min(Math.max(mainStart, minPage), maxPage);
  mainEnd = Math.min(Math.max(mainEnd, minPage), maxPage);

  if (mainStart > mainEnd) {
    [mainStart, mainEnd] = [mainEnd, mainStart];
  }

  return { mainStart, mainEnd };
};

const serializePageSourceForPrompt = (pages = []) => {
  let remainingChars = STRUCTURED_CONTENT_MAX_SOURCE_CHARS;
  const serializedPages = [];

  for (const page of pages) {
    if (remainingChars <= 0) break;

    const pageNumber = normalizeStructuredPageNumber(page.page, 0);
    if (!pageNumber) continue;

    const fixedOverhead = 48;
    const pageCharBudget = Math.max(Math.min(STRUCTURED_CONTENT_MAX_PAGE_CHARS, remainingChars - fixedOverhead), 0);
    if (pageCharBudget <= 0) break;

    const contentMarkdown = truncateText(page.contentMarkdown, pageCharBudget);
    const pagePayload = {
      page: pageNumber,
      content_markdown: contentMarkdown
    };
    const serialized = JSON.stringify(pagePayload, null, 2);
    if (serialized.length > remainingChars) {
      break;
    }

    serializedPages.push(serialized);
    remainingChars -= serialized.length;
  }

  if (!serializedPages.length) return '';
  return `[\n${serializedPages.join(',\n')}\n]`;
};

const extractStructuredContentRootMetadata = (parsed = {}) => ({
  title: parsed?.title,
  main: parsed?.main ?? parsed?.is_main ?? parsed?.isMain ?? parsed?.正文 ?? parsed?.body_main,
  mainStart: parsed?.main_start ?? parsed?.mainStart ?? parsed?.start_page ?? parsed?.startPage ?? parsed?.正文开始页,
  mainEnd: parsed?.main_end ?? parsed?.mainEnd ?? parsed?.end_page ?? parsed?.endPage ?? parsed?.正文结束页,
  wordsCount: parsed?.words_count ?? parsed?.wordsCount ?? parsed?.word_count ?? parsed?.wordCount
});

const normalizeStructuredMainRangePageValue = (value) => {
  const normalized = normalizeStructuredPageNumber(value, 0);
  return normalized > 0 ? normalized : null;
};

const normalizeSegmentValue = (value, segmentIndex) => {
  if (!value || typeof value !== 'object') return null;

  const pic = normalizeStructuredContentValue(
    value[`seg${segmentIndex}_pic`]
      || value.pic
      || value.image
      || value.image_prompt
      || value.imagePrompt
      || value.description
  );
  const text = normalizeStructuredContentValue(
    value[`seg${segmentIndex}_text`]
      || value.text
      || value.paragraph
      || value.summary
      || value.content
  );

  if (!pic && !text) return null;

  return {
    [`seg${segmentIndex}_pic`]: pic,
    [`seg${segmentIndex}_text`]: text
  };
};

const normalizeSegmentsObject = (value) => {
  if (!value) return {};

  const normalized = {};
  const candidateEntries = Array.isArray(value)
    ? value.map((item, index) => [`seg${index + 1}`, item])
    : Object.entries(value);

  const normalizedEntries = candidateEntries
    .map(([key, segmentValue], index) => {
      const match = String(key || '').match(/seg(\d+)/i);
      const segmentIndex = normalizeStructuredPageNumber(match?.[1], index + 1);
      return {
        segmentIndex,
        value: normalizeSegmentValue(segmentValue, segmentIndex)
      };
    })
    .filter((entry) => entry.value)
    .sort((left, right) => left.segmentIndex - right.segmentIndex)
    .slice(0, STRUCTURED_CONTENT_MAX_SEGMENTS_PER_PAGE);

  normalizedEntries.forEach(({ segmentIndex, value }) => {
    normalized[`seg${segmentIndex}`] = value;
  });

  return normalized;
};

const parseJsonField = (value, fallback) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  return safeJsonParse(value, fallback);
};

const normalizeCoordinateValue = (value) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;

  if (parsed >= 0 && parsed <= 1) return parsed;
  if (parsed > 1 && parsed <= 100) return parsed / 100;
  if (parsed > 100 && parsed <= 1000) return parsed / 1000;
  return null;
};

const normalizeBoxValue = (value) => {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 4) {
    const [x, y, width, height] = value.map((item) => normalizeCoordinateValue(item));
    if ([x, y, width, height].every((item) => item !== null)) {
      return { x, y, width, height };
    }
  }

  if (typeof value !== 'object') return null;

  const x = normalizeCoordinateValue(value.x ?? value.left ?? value.x1 ?? value.minX);
  const y = normalizeCoordinateValue(value.y ?? value.top ?? value.y1 ?? value.minY);
  const width = normalizeCoordinateValue(value.width ?? value.w ?? ((value.x2 ?? value.maxX) !== undefined && x !== null ? (value.x2 ?? value.maxX) - x : null));
  const height = normalizeCoordinateValue(value.height ?? value.h ?? ((value.y2 ?? value.maxY) !== undefined && y !== null ? (value.y2 ?? value.maxY) - y : null));

  if ([x, y, width, height].some((item) => item === null)) {
    return null;
  }

  return {
    x: Math.min(Math.max(x, 0), 1),
    y: Math.min(Math.max(y, 0), 1),
    width: Math.min(Math.max(width, 0), 1),
    height: Math.min(Math.max(height, 0), 1)
  };
};

const buildThumbnailPromptBodyFromPages = (pages = []) => {
  return (pages || [])
    .map((pageEntry) => getOrderedSegmentTexts(pageEntry?.seg || {}).join('\n'))
    .filter(Boolean)
    .join('\n\n')
    .trim();
};

const getNormalizedMainRange = ({ mainStart = null, mainEnd = null } = {}) => {
  let normalizedStart = normalizeStructuredPageNumber(mainStart, 0);
  let normalizedEnd = normalizeStructuredPageNumber(mainEnd, 0);

  if (normalizedStart <= 0 || normalizedEnd <= 0) {
    return { mainStart: null, mainEnd: null };
  }

  if (normalizedStart > normalizedEnd) {
    [normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart];
  }

  return {
    mainStart: normalizedStart,
    mainEnd: normalizedEnd
  };
};

const filterPagesByMainRange = (pages = [], { mainStart = null, mainEnd = null } = {}) => {
  const normalizedRange = getNormalizedMainRange({ mainStart, mainEnd });
  if (!normalizedRange.mainStart || !normalizedRange.mainEnd) {
    return [...(pages || [])];
  }

  const filteredPages = (pages || []).filter((pageEntry) => {
    const pageNumber = normalizeStructuredPageNumber(pageEntry?.page, 0);
    return pageNumber >= normalizedRange.mainStart && pageNumber <= normalizedRange.mainEnd;
  });

  return filteredPages.length ? filteredPages : [...(pages || [])];
};

const buildPdfMainRangeBodyFromPages = (pages = [], { mainStart = null, mainEnd = null } = {}) => {
  return buildThumbnailPromptBodyFromPages(
    filterPagesByMainRange(pages, { mainStart, mainEnd })
  );
};

const buildProductionPageBody = ({ segments = {} } = {}) => {
  return buildThumbnailPromptBodyFromPages([{ seg: segments }]);
};

const getMaterialAudioSegmentEntry = ({ pageEntry, segmentOrder = 0 } = {}) => {
  const normalizedSegmentOrder = normalizeStructuredPageNumber(segmentOrder, 0);
  if (normalizedSegmentOrder <= 0) {
    return null;
  }

  return getOrderedSegmentEntries(pageEntry?.seg || {}).find(
    (segment) => segment.order === normalizedSegmentOrder
  ) || null;
};

const buildMaterialAudioInputText = ({ title, body, segments = {} } = {}) => {
  const normalizedTitle = normalizeStructuredContentValue(title);
  const normalizedBody = normalizeStructuredContentValue(body) || buildProductionPageBody({ segments });
  return [normalizedTitle, normalizedBody].filter(Boolean).join('\n\n').trim();
};

const buildThumbnailAnnotationPrompt = ({ template, title, segments, body }) => {
  return renderThumbnailAnnotationPromptTemplate(template, {
    title,
    segments,
    body
  });
};

const formatFetchErrorMessage = (prefix, error) => {
  const causeMessage = String(error?.cause?.message || '').trim();
  const message = String(error?.message || '').trim();
  return [prefix, causeMessage || message].filter(Boolean).join(': ');
};

const isAbortError = (error) => {
  return error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR'
    || /abort/i.test(String(error?.message || ''));
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = DOUBAO_REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
};

const getContentTypeForFile = (fileName, fallback = 'application/octet-stream') => {
  const ext = path.extname(fileName || '').toLowerCase();
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  };

  return mimeMap[ext] || fallback;
};

const createMaterialOssPrefix = (title) => {
  return `${MATERIAL_OSS_ROOT_PREFIX}/${sanitizeOssSegment(title)}`;
};

const findMaterialIdByOssPrefix = async (connection, ossPrefix) => {
  const [rows] = await connection.execute(
    'SELECT id FROM bt_materials WHERE oss_prefix = ? LIMIT 1',
    [ossPrefix]
  );

  return rows[0] ? Number(rows[0].id) : null;
};

const assertMaterialOssPrefixAvailable = async (connection, title, excludeMaterialId = null) => {
  const ossPrefix = createMaterialOssPrefix(title);
  const matchedMaterialId = await findMaterialIdByOssPrefix(connection, ossPrefix);

  if (matchedMaterialId && matchedMaterialId !== excludeMaterialId) {
    throw createHttpError('教材名称映射出的 OSS 目录已被占用，请调整教材名称', 400);
  }

  return ossPrefix;
};

const resolveLegacyMaterialOssPrefix = async (connection, title, materialId) => {
  const basePrefix = createMaterialOssPrefix(title);
  const matchedMaterialId = await findMaterialIdByOssPrefix(connection, basePrefix);

  if (!matchedMaterialId || matchedMaterialId === materialId) {
    return basePrefix;
  }

  return `${basePrefix}-${materialId}`;
};

const buildMaterialPdfSourceKey = (materialPrefix, storageSequence, originalFileName) => {
  const parsed = path.parse(originalFileName || 'document.pdf');
  const safeStem = sanitizeFileStem(parsed.name);
  const extension = parsed.ext || '.pdf';
  return `${materialPrefix}/pdfs/${storageSequence}-${safeStem}${extension}`;
};

const buildMaterialPdfParsedDir = (materialPrefix, storageSequence, displayName, originalFileName) => {
  const parsed = path.parse(displayName || originalFileName || 'document');
  const safeStem = sanitizeFileStem(parsed.name);
  return `${materialPrefix}/parsed/${storageSequence}-${safeStem}`;
};

const buildMaterialPdfParsedFileKey = (materialPrefix, storageSequence, displayName, originalFileName, fileName) => {
  return `${buildMaterialPdfParsedDir(materialPrefix, storageSequence, displayName, originalFileName)}/${fileName}`;
};

const deriveSiblingObjectKey = (objectKey, siblingFileName) => {
  if (!objectKey || !siblingFileName) return null;
  return String(objectKey).replace(/[^/]+$/, siblingFileName);
};

const deriveSiblingUrl = (url, siblingFileName) => {
  if (!url || !siblingFileName) return null;

  try {
    const parsedUrl = new URL(url);
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/[^/]+$/, `/${siblingFileName}`);
    return parsedUrl.toString();
  } catch (_error) {
    return String(url).replace(/\/[^/?#]+(?=$|[?#])/, `/${siblingFileName}`);
  }
};

const createMaterialUpload = (uploadDir) => {
  const storage = multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        await ensureDirectory(uploadDir);
        callback(null, uploadDir);
      } catch (error) {
        callback(error);
      }
    },
    filename: (_req, file, callback) => {
      const parsed = path.parse(file.originalname || 'document.pdf');
      const safeName = sanitizeFileStem(parsed.name);
      const extension = parsed.ext || '.pdf';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${safeName}-${uniqueSuffix}${extension}`);
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: MAX_UPLOAD_SIZE,
      files: MAX_FILE_COUNT
    }
  });
};

const getGroupWhereClause = (groupId) => {
  if (groupId === null) {
    return {
      clause: 'group_id IS NULL',
      params: []
    };
  }

  return {
    clause: 'group_id = ?',
    params: [groupId]
  };
};

const getNextMaterialSortOrder = async (connection, groupId) => {
  const { clause, params } = getGroupWhereClause(groupId);
  const [rows] = await connection.execute(
    `SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder
     FROM bt_materials
     WHERE ${clause}`,
    params
  );

  return Number(rows[0]?.maxSortOrder || 0) + 10;
};

const getNextGroupSortOrder = async (connection) => {
  const [rows] = await connection.execute(
    'SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM bt_material_groups'
  );

  return Number(rows[0]?.maxSortOrder || 0) + 10;
};

const getNextPdfStorageSequence = async (connection, materialId) => {
  const [rows] = await connection.execute(
    'SELECT COALESCE(MAX(storage_sequence), 0) AS maxStorageSequence FROM bt_material_pdfs WHERE material_id = ?',
    [materialId]
  );

  return Number(rows[0]?.maxStorageSequence || 0) + 1;
};

const getNextPdfSortOrder = async (connection, materialId) => {
  const [rows] = await connection.execute(
    'SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM bt_material_pdfs WHERE material_id = ?',
    [materialId]
  );

  return Number(rows[0]?.maxSortOrder || 0) + 10;
};

const assertGroupExists = async (connection, groupId) => {
  if (groupId === null) return;

  const [rows] = await connection.execute(
    'SELECT id FROM bt_material_groups WHERE id = ?',
    [groupId]
  );

  if (!rows.length) {
    throw createHttpError('教材组不存在', 400);
  }
};

const assertMaterialTitleAvailable = async (connection, title, excludeMaterialId = null) => {
  const params = [title];
  let sql = 'SELECT id FROM bt_materials WHERE title = ?';

  if (excludeMaterialId) {
    sql += ' AND id != ?';
    params.push(excludeMaterialId);
  }

  const [rows] = await connection.execute(sql, params);
  if (rows.length) {
    throw createHttpError('教材名称已存在，请使用不同的教材名称', 400);
  }
};

const ensureMaterialAssetRows = async (connection, materialId) => {
  for (const assetType of MATERIAL_ASSET_TYPES) {
    await connection.execute(
      `INSERT INTO bt_material_assets (material_id, asset_type, status, output_path, output_meta_json, last_message, generated_at)
       VALUES (?, ?, ?, NULL, NULL, '', NULL)
       ON DUPLICATE KEY UPDATE material_id = material_id`,
      [materialId, assetType, MATERIAL_ASSET_STATUS.NOT_STARTED]
    );
  }
};

const updateMaterialAssetRecord = async (connection, {
  materialId,
  assetType,
  status,
  outputPath = null,
  outputMeta = {},
  lastMessage = '',
  generatedAt = null
}) => {
  await connection.execute(
    `INSERT INTO bt_material_assets (material_id, asset_type, status, output_path, output_meta_json, last_message, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       output_path = VALUES(output_path),
       output_meta_json = VALUES(output_meta_json),
       last_message = VALUES(last_message),
       generated_at = VALUES(generated_at)`,
    [
      materialId,
      assetType,
      status,
      outputPath,
      JSON.stringify(outputMeta || {}),
      lastMessage,
      generatedAt
    ]
  );
};

const createPlaceholderGenerator = (assetType) => async ({ material }) => {
  return {
    status: MATERIAL_ASSET_STATUS.QUEUED,
    outputPath: null,
    outputMeta: {
      placeholder: true,
      materialTitle: material.title,
      assetType
    },
    lastMessage: PLACEHOLDER_MESSAGES[assetType]
  };
};

const materialAssetGenerators = {
  slide: createPlaceholderGenerator('slide'),
  audio: createPlaceholderGenerator('audio'),
  video: createPlaceholderGenerator('video'),
  exercise: createPlaceholderGenerator('exercise'),
  summary_image: generateSummaryImageAsset
};

const runMaterialAssetGeneration = async (connection, material, assetType, context = {}) => {
  const generator = materialAssetGenerators[assetType];
  if (!generator) {
    throw createHttpError(`不支持的附件类型: ${assetType}`, 400);
  }

  await updateMaterialAssetRecord(connection, {
    materialId: material.id,
    assetType,
    status: MATERIAL_ASSET_STATUS.PROCESSING,
    lastMessage: `${MATERIAL_ASSET_LABELS[assetType]} 制作中`
  });

  const result = await generator({ connection, material, assetType, ...context });

  await updateMaterialAssetRecord(connection, {
    materialId: material.id,
    assetType,
    status: result.status || MATERIAL_ASSET_STATUS.QUEUED,
    outputPath: result.outputPath || null,
    outputMeta: result.outputMeta || {},
    lastMessage: result.lastMessage || PLACEHOLDER_MESSAGES[assetType],
    generatedAt: result.generatedAt || null
  });
};

const ensureColumnIfMissing = async (connection, databaseName, tableName, columnName, definitionSql) => {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [databaseName, tableName, columnName]
  );

  if (!rows.length) {
    await connection.execute(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`
    );
  }
};

const ensureNullableColumn = async (connection, databaseName, tableName, columnName, definitionSql) => {
  const [rows] = await connection.execute(
    `SELECT IS_NULLABLE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [databaseName, tableName, columnName]
  );

  if (!rows.length) return;

  if (String(rows[0].IS_NULLABLE || '').toUpperCase() !== 'YES') {
    await connection.execute(
      `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${definitionSql}`
    );
  }
};

const ensureIndexMatches = async (connection, databaseName, tableName, indexName, columnNames, { unique = false } = {}) => {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME AS columnName, SEQ_IN_INDEX AS seqInIndex, NON_UNIQUE AS nonUnique
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     ORDER BY SEQ_IN_INDEX ASC`,
    [databaseName, tableName, indexName]
  );

  const existingColumns = rows.map((row) => String(row.columnName || ''));
  const expectedColumns = columnNames.map((columnName) => String(columnName || ''));
  const currentIsUnique = rows.length ? Number(rows[0].nonUnique || 0) === 0 : null;
  const matchesDefinition = rows.length
    && currentIsUnique === Boolean(unique)
    && existingColumns.length === expectedColumns.length
    && existingColumns.every((columnName, index) => columnName === expectedColumns[index]);

  if (matchesDefinition) {
    return;
  }

  if (rows.length) {
    await connection.execute(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
  }

  const indexTypeSql = unique ? 'ADD UNIQUE INDEX' : 'ADD INDEX';
  const columnsSql = expectedColumns.map((columnName) => `\`${columnName}\``).join(', ');
  await connection.execute(
    `ALTER TABLE \`${tableName}\` ${indexTypeSql} \`${indexName}\` (${columnsSql})`
  );
};

const ensureMaterialLibraryTables = async (connection, databaseName) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_groups (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      thumbnail_prompt_template LONGTEXT NULL,
      thumbnail_video_prompt_template LONGTEXT NULL,
      thumbnail_annotation_prompt_template LONGTEXT NULL,
      thumbnail_companion_language_prompt_template LONGTEXT NULL,
      thumbnail_companion_textless_prompt_template LONGTEXT NULL,
      thumbnail_companion_background_prompt_template LONGTEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_bt_material_groups_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_groups',
    'thumbnail_prompt_template',
    'LONGTEXT NULL AFTER description'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_groups',
    'thumbnail_video_prompt_template',
    'LONGTEXT NULL AFTER thumbnail_prompt_template'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_groups',
    'thumbnail_annotation_prompt_template',
    'LONGTEXT NULL AFTER thumbnail_video_prompt_template'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_groups',
    'thumbnail_companion_language_prompt_template',
    'LONGTEXT NULL AFTER thumbnail_annotation_prompt_template'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_groups',
    'thumbnail_companion_textless_prompt_template',
    'LONGTEXT NULL AFTER thumbnail_companion_language_prompt_template'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_groups',
    'thumbnail_companion_background_prompt_template',
    'LONGTEXT NULL AFTER thumbnail_companion_textless_prompt_template'
  );

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_materials (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      group_id BIGINT UNSIGNED NULL,
      sort_order INT NOT NULL DEFAULT 0,
      oss_prefix VARCHAR(500) NULL,
      parse_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
      storage_status VARCHAR(30) NOT NULL DEFAULT 'ready',
      latest_error TEXT NULL,
      original_file_name VARCHAR(255) NULL,
      stored_file_name VARCHAR(255) NULL,
      file_path VARCHAR(500) NULL,
      file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
      mime_type VARCHAR(120) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bt_materials_group_sort (group_id, sort_order),
      KEY idx_bt_materials_title (title)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumnIfMissing(connection, databaseName, 'bt_materials', 'oss_prefix', 'VARCHAR(500) NULL AFTER sort_order');
  await ensureColumnIfMissing(connection, databaseName, 'bt_materials', 'parse_status', "VARCHAR(30) NOT NULL DEFAULT 'not_started' AFTER oss_prefix");
  await ensureColumnIfMissing(connection, databaseName, 'bt_materials', 'storage_status', "VARCHAR(30) NOT NULL DEFAULT 'ready' AFTER parse_status");
  await ensureColumnIfMissing(connection, databaseName, 'bt_materials', 'latest_error', 'TEXT NULL AFTER storage_status');
  await ensureNullableColumn(connection, databaseName, 'bt_materials', 'original_file_name', 'VARCHAR(255) NULL');
  await ensureNullableColumn(connection, databaseName, 'bt_materials', 'stored_file_name', 'VARCHAR(255) NULL');
  await ensureNullableColumn(connection, databaseName, 'bt_materials', 'file_path', 'VARCHAR(500) NULL');

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_assets (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      asset_type VARCHAR(20) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'not_started',
      output_path VARCHAR(500) NULL,
      output_meta_json LONGTEXT NULL,
      last_message VARCHAR(255) NULL,
      generated_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_bt_material_assets_material_type (material_id, asset_type),
      KEY idx_bt_material_assets_material_id (material_id),
      KEY idx_bt_material_assets_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_pdfs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      storage_sequence INT NOT NULL DEFAULT 0,
      display_name VARCHAR(255) NULL,
      original_file_name VARCHAR(255) NOT NULL,
      source_mime_type VARCHAR(120) NULL,
      source_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
      source_storage_key VARCHAR(500) NULL,
      source_url VARCHAR(1000) NULL,
      cover_storage_key VARCHAR(500) NULL,
      cover_url VARCHAR(1000) NULL,
      content_storage_key VARCHAR(500) NULL,
      content_url VARCHAR(1000) NULL,
      parse_storage_key VARCHAR(500) NULL,
      parse_url VARCHAR(1000) NULL,
      structured_content_storage_key VARCHAR(500) NULL,
      keywords_json LONGTEXT NULL,
      main TINYINT(1) NULL,
      title VARCHAR(255) NULL,
      words_count INT NULL,
      main_start INT NULL,
      main_end INT NULL,
      structured_content_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
      structured_content_error TEXT NULL,
      legacy_local_path VARCHAR(500) NULL,
      upload_status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
      parse_status VARCHAR(30) NOT NULL DEFAULT 'queued',
      parser_name VARCHAR(80) NULL,
      parser_version VARCHAR(50) NULL,
      page_count INT NULL,
      error_message TEXT NULL,
      parsed_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bt_material_pdfs_material_sort (material_id, sort_order),
      KEY idx_bt_material_pdfs_parse_status (parse_status),
      KEY idx_bt_material_pdfs_structured_content_status (structured_content_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'structured_content_storage_key',
    'VARCHAR(500) NULL AFTER parse_url'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'keywords_json',
    'LONGTEXT NULL AFTER structured_content_storage_key'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'main',
    'TINYINT(1) NULL AFTER keywords_json'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'title',
    'VARCHAR(255) NULL AFTER `main`'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'words_count',
    'INT NULL AFTER `title`'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'main_start',
    'INT NULL AFTER words_count'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'main_end',
    'INT NULL AFTER main_start'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'structured_content_status',
    "VARCHAR(30) NOT NULL DEFAULT 'not_started' AFTER keywords_json"
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_pdfs',
    'structured_content_error',
    'TEXT NULL AFTER structured_content_status'
  );

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_keywords (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      keyword VARCHAR(255) NOT NULL,
      keyword_lookup VARCHAR(255) NOT NULL,
      \`type\` VARCHAR(120) NULL,
      meaning TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_bt_material_keywords_lookup (keyword_lookup),
      KEY idx_bt_material_keywords_keyword (keyword)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_keywords',
    'keyword',
    'VARCHAR(255) NOT NULL AFTER id'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_keywords',
    'keyword_lookup',
    'VARCHAR(255) NOT NULL AFTER keyword'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_keywords',
    'type',
    'VARCHAR(120) NULL AFTER keyword_lookup'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_keywords',
    'meaning',
    'TEXT NULL AFTER `type`'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_keywords',
    'prototype',
    'VARCHAR(255) NULL AFTER meaning'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_keywords',
    'relation',
    'VARCHAR(255) NULL AFTER prototype'
  );

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_pdf_page_contents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      material_pdf_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(255) NULL,
      page INT NOT NULL,
      seg LONGTEXT NULL,
      words LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_bt_material_pdf_page_contents_pdf_page (material_pdf_id, page),
      KEY idx_bt_material_pdf_page_contents_material (material_id),
      KEY idx_bt_material_pdf_page_contents_pdf (material_pdf_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_thumbnails (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      material_pdf_id BIGINT UNSIGNED NOT NULL,
      page INT NOT NULL,
      language VARCHAR(20) NOT NULL,
      derived_from_thumbnail_id BIGINT UNSIGNED NULL,
      generation_kind VARCHAR(20) NOT NULL DEFAULT 'base',
      prompt_text LONGTEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'queued',
      output_path VARCHAR(500) NULL,
      output_meta_json LONGTEXT NULL,
      last_message VARCHAR(255) NULL,
      annotation_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
      annotation_error TEXT NULL,
      annotated_at TIMESTAMP NULL DEFAULT NULL,
      generated_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bt_material_thumbnails_material_page (material_id, material_pdf_id, page),
      KEY idx_bt_material_thumbnails_status (status),
      KEY idx_bt_material_thumbnails_annotation_status (annotation_status),
      KEY idx_bt_material_thumbnails_derived_from (derived_from_thumbnail_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_thumbnail_videos (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      material_pdf_id BIGINT UNSIGNED NOT NULL,
      thumbnail_id BIGINT UNSIGNED NOT NULL,
      source_thumbnail_id BIGINT UNSIGNED NULL,
      page INT NOT NULL DEFAULT 0,
      scope_type VARCHAR(20) NOT NULL DEFAULT 'page',
      prompt_text LONGTEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'queued',
      output_path VARCHAR(500) NULL,
      output_meta_json LONGTEXT NULL,
      last_message VARCHAR(255) NULL,
      error_message TEXT NULL,
      generated_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bt_material_thumbnail_videos_thumbnail (thumbnail_id),
      KEY idx_bt_material_thumbnail_videos_source_thumbnail (source_thumbnail_id),
      KEY idx_bt_material_thumbnail_videos_material_page (material_id, material_pdf_id, page),
      KEY idx_bt_material_thumbnail_videos_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_audios (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      material_pdf_id BIGINT UNSIGNED NOT NULL,
      page INT NOT NULL DEFAULT 0,
      seg INT NOT NULL DEFAULT 0,
      scope_type VARCHAR(20) NOT NULL DEFAULT 'page',
      voice_type VARCHAR(120) NOT NULL,
      voice_label VARCHAR(120) NULL,
      speed_ratio DECIMAL(4,2) NULL DEFAULT 1.00,
      input_text LONGTEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'queued',
      output_path VARCHAR(500) NULL,
      output_meta_json LONGTEXT NULL,
      last_message VARCHAR(255) NULL,
      error_message TEXT NULL,
      generated_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_bt_material_audios_target_voice (material_id, material_pdf_id, page, seg, voice_type),
      KEY idx_bt_material_audios_material_page (material_id, material_pdf_id, page, seg),
      KEY idx_bt_material_audios_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_audios',
    'seg',
    'INT NOT NULL DEFAULT 0 AFTER page'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_audios',
    'speed_ratio',
    'DECIMAL(4,2) NULL DEFAULT 1.00 AFTER voice_label'
  );
  await ensureIndexMatches(
    connection,
    databaseName,
    'bt_material_audios',
    'uniq_bt_material_audios_target_voice',
    ['material_id', 'material_pdf_id', 'page', 'seg', 'voice_type'],
    { unique: true }
  );
  await ensureIndexMatches(
    connection,
    databaseName,
    'bt_material_audios',
    'idx_bt_material_audios_material_page',
    ['material_id', 'material_pdf_id', 'page', 'seg']
  );

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_thumbnail_annotations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      material_id BIGINT UNSIGNED NOT NULL,
      material_pdf_id BIGINT UNSIGNED NOT NULL,
      page INT NOT NULL,
      thumbnail_id BIGINT UNSIGNED NOT NULL,
      sentence_role VARCHAR(20) NOT NULL,
      sentence_order INT NOT NULL DEFAULT 0,
      sentence_text LONGTEXT NOT NULL,
      text_box_json LONGTEXT NULL,
      image_box_json LONGTEXT NULL,
      model_name VARCHAR(120) NULL,
      prompt_text LONGTEXT NULL,
      raw_response_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bt_material_thumbnail_annotations_thumbnail (thumbnail_id),
      KEY idx_bt_material_thumbnail_annotations_material_page (material_id, material_pdf_id, page)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      job_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'queued',
      material_id BIGINT UNSIGNED NULL,
      material_pdf_id BIGINT UNSIGNED NULL,
      material_thumbnail_id BIGINT UNSIGNED NULL,
      material_thumbnail_video_id BIGINT UNSIGNED NULL,
      material_audio_id BIGINT UNSIGNED NULL,
      payload_json LONGTEXT NULL,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 3,
      worker_id VARCHAR(120) NULL,
      locked_at TIMESTAMP NULL DEFAULT NULL,
      started_at TIMESTAMP NULL DEFAULT NULL,
      finished_at TIMESTAMP NULL DEFAULT NULL,
      next_run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      error_message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bt_material_jobs_status_next (status, next_run_at),
      KEY idx_bt_material_jobs_material (material_id),
      KEY idx_bt_material_jobs_pdf (material_pdf_id),
      KEY idx_bt_material_jobs_thumbnail (material_thumbnail_id),
      KEY idx_bt_material_jobs_thumbnail_video (material_thumbnail_video_id),
      KEY idx_bt_material_jobs_audio (material_audio_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_jobs',
    'material_thumbnail_id',
    'BIGINT UNSIGNED NULL AFTER material_pdf_id'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_jobs',
    'material_thumbnail_video_id',
    'BIGINT UNSIGNED NULL AFTER material_thumbnail_id'
  );
  await ensureColumnIfMissing(
    connection,
    databaseName,
    'bt_material_jobs',
    'material_audio_id',
    'BIGINT UNSIGNED NULL AFTER material_thumbnail_video_id'
  );
};

const enqueueJob = async (connection, {
  jobType,
  materialId = null,
  materialPdfId = null,
  materialThumbnailId = null,
  materialThumbnailVideoId = null,
  materialAudioId = null,
  payload = {},
  maxAttempts = DEFAULT_JOB_MAX_ATTEMPTS
}) => {
  const [result] = await connection.execute(
    `INSERT INTO bt_material_jobs (
      job_type, status, material_id, material_pdf_id, material_thumbnail_id, material_thumbnail_video_id, material_audio_id, payload_json, attempts,
      max_attempts, worker_id, locked_at, started_at, finished_at, next_run_at, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, NOW(), NULL)`,
    [
      jobType,
      JOB_STATUS.QUEUED,
      materialId,
      materialPdfId,
      materialThumbnailId,
      materialThumbnailVideoId,
      materialAudioId,
      JSON.stringify(payload || {}),
      maxAttempts
    ]
  );

  return result.insertId;
};

const getMaterialById = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT m.id, m.title, m.description, m.group_id AS groupId, m.sort_order AS sortOrder,
            m.oss_prefix AS ossPrefix, m.parse_status AS parseStatus, m.storage_status AS storageStatus,
            m.latest_error AS latestError, m.original_file_name AS originalFileName,
            m.stored_file_name AS storedFileName, m.file_path AS filePath, m.file_size AS fileSize,
            m.mime_type AS mimeType, m.created_at AS createdAt, m.updated_at AS updatedAt,
            g.name AS groupName
     FROM bt_materials m
     LEFT JOIN bt_material_groups g ON g.id = m.group_id
     WHERE m.id = ?`,
    [materialId]
  );

  return rows[0] || null;
};

const getMaterialPdfById = async (connection, pdfId) => {
  const [rows] = await connection.execute(
    `SELECT p.id, p.material_id AS materialId, p.sort_order AS sortOrder, p.storage_sequence AS storageSequence,
            p.display_name AS displayName, p.original_file_name AS originalFileName,
            p.source_mime_type AS sourceMimeType, p.source_size AS sourceSize,
            p.source_storage_key AS sourceStorageKey, p.source_url AS sourceUrl,
            p.cover_storage_key AS coverStorageKey, p.cover_url AS coverUrl,
            p.content_storage_key AS contentStorageKey, p.content_url AS contentUrl,
            p.parse_storage_key AS parseStorageKey, p.parse_url AS parseUrl,
            p.structured_content_storage_key AS structuredContentStorageKey,
            p.keywords_json AS keywordsJson,
            p.\`main\` AS mainFlag, p.\`title\` AS pdfTitle, p.words_count AS wordsCount,
            p.main_start AS mainStart, p.main_end AS mainEnd,
            p.structured_content_status AS structuredContentStatus,
            p.structured_content_error AS structuredContentError,
            p.legacy_local_path AS legacyLocalPath, p.upload_status AS uploadStatus,
            p.parse_status AS parseStatus, p.parser_name AS parserName, p.parser_version AS parserVersion,
            p.page_count AS pageCount, p.error_message AS errorMessage, p.parsed_at AS parsedAt,
            p.created_at AS createdAt, p.updated_at AS updatedAt
     FROM bt_material_pdfs p
     WHERE p.id = ?`,
    [pdfId]
  );

  return rows[0] || null;
};

const listMaterialPdfsByMaterialIds = async (connection, materialIds) => {
  if (!materialIds.length) return [];

  const placeholders = materialIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT p.id, p.material_id AS materialId, p.sort_order AS sortOrder, p.storage_sequence AS storageSequence,
            p.display_name AS displayName, p.original_file_name AS originalFileName,
            p.source_mime_type AS sourceMimeType, p.source_size AS sourceSize,
            p.source_storage_key AS sourceStorageKey, p.source_url AS sourceUrl,
            p.cover_storage_key AS coverStorageKey, p.cover_url AS coverUrl,
            p.content_storage_key AS contentStorageKey, p.content_url AS contentUrl,
            p.parse_storage_key AS parseStorageKey, p.parse_url AS parseUrl,
            p.structured_content_storage_key AS structuredContentStorageKey,
            p.keywords_json AS keywordsJson,
            p.\`main\` AS mainFlag, p.\`title\` AS pdfTitle, p.words_count AS wordsCount,
            p.main_start AS mainStart, p.main_end AS mainEnd,
            p.structured_content_status AS structuredContentStatus,
            p.structured_content_error AS structuredContentError,
            p.legacy_local_path AS legacyLocalPath, p.upload_status AS uploadStatus,
            p.parse_status AS parseStatus, p.parser_name AS parserName, p.parser_version AS parserVersion,
            p.page_count AS pageCount, p.error_message AS errorMessage, p.parsed_at AS parsedAt,
            p.created_at AS createdAt, p.updated_at AS updatedAt
     FROM bt_material_pdfs p
     WHERE p.material_id IN (${placeholders})
     ORDER BY p.material_id ASC, p.sort_order ASC, p.id ASC`,
    materialIds
  );

  return rows;
};

const listMaterialAssetRowsByMaterialIds = async (connection, materialIds) => {
  if (!materialIds.length) return [];

  const placeholders = materialIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT material_id AS materialId, asset_type AS assetType, status,
            output_path AS outputPath, output_meta_json AS outputMetaJson,
            last_message AS lastMessage, generated_at AS generatedAt
     FROM bt_material_assets
     WHERE material_id IN (${placeholders})`,
    materialIds
  );

  return rows;
};

const listMaterialPdfPageContents = async (connection, materialPdfId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            title, page, seg, words, created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_pdf_page_contents
     WHERE material_pdf_id = ?
     ORDER BY page ASC, id ASC`,
    [materialPdfId]
  );

  return rows;
};

const listMaterialKeywordRowsByLookups = async (connection, keywordLookups = []) => {
  const uniqueLookups = [...new Set(
    (keywordLookups || [])
      .map((keywordLookup) => normalizeMaterialKeywordLookup(keywordLookup))
      .filter(Boolean)
  )];
  if (!uniqueLookups.length) return [];

  const placeholders = uniqueLookups.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id, keyword, keyword_lookup AS keywordLookup, \`type\` AS type, meaning,
            prototype, relation,
            created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_keywords
     WHERE keyword_lookup IN (${placeholders})`,
    uniqueLookups
  );

  return rows;
};

const insertMaterialKeywordRowsIgnoreExisting = async (connection, rows = []) => {
  const uniqueRows = [];
  const seen = new Set();

  for (const row of rows || []) {
    const normalizedRow = createMaterialKeywordRow(row || {});
    if (!normalizedRow || seen.has(normalizedRow.keywordLookup)) continue;
    seen.add(normalizedRow.keywordLookup);
    uniqueRows.push(normalizedRow);
  }

  if (!uniqueRows.length) return;

  const placeholders = uniqueRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = uniqueRows.flatMap((row) => [
    row.keyword,
    row.keywordLookup,
    row.type,
    row.meaning,
    row.prototype,
    row.relation
  ]);

  await connection.execute(
    `INSERT IGNORE INTO bt_material_keywords (keyword, keyword_lookup, \`type\`, meaning, prototype, relation)
     VALUES ${placeholders}`,
    params
  );
};

const backfillMaterialPdfKeywords = async (connection) => {
  const [pdfRows] = await connection.execute(
    `SELECT id
     FROM bt_material_pdfs
     WHERE (keywords_json IS NULL OR keywords_json = '')
       AND EXISTS (
         SELECT 1
         FROM bt_material_pdf_page_contents pc
         WHERE pc.material_pdf_id = bt_material_pdfs.id
       )`
  );

  for (const pdfRow of pdfRows) {
    const pageRows = await listMaterialPdfPageContents(connection, pdfRow.id);
    const keywords = collectPdfKeywordsFromPages(pageRows.map((row) => ({
      words: parseJsonField(row.words, [])
    })));

    await updateMaterialPdfResult(connection, pdfRow.id, {
      keywords_json: JSON.stringify(keywords)
    });
  }
};

const clearMaterialPdfPageContents = async (connection, materialPdfId) => {
  await connection.execute(
    'DELETE FROM bt_material_pdf_page_contents WHERE material_pdf_id = ?',
    [materialPdfId]
  );
};

const replaceMaterialPdfPageContents = async (connection, { materialId, materialPdfId, title, pages }) => {
  await clearMaterialPdfPageContents(connection, materialPdfId);

  for (const pageEntry of pages) {
    await connection.execute(
      `INSERT INTO bt_material_pdf_page_contents (
        material_id, material_pdf_id, title, page, seg, words
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        materialId,
        materialPdfId,
        title,
        pageEntry.page,
        JSON.stringify(pageEntry.seg || {}),
        JSON.stringify(Array.isArray(pageEntry.words) ? pageEntry.words : [])
      ]
    );
  }
};

const updateMaterialPdfPageWords = async (connection, { materialPdfId, page, words }) => {
  await connection.execute(
    `UPDATE bt_material_pdf_page_contents
     SET words = ?
     WHERE material_pdf_id = ? AND page = ?`,
    [
      JSON.stringify(Array.isArray(words) ? words : []),
      materialPdfId,
      page
    ]
  );
};

const syncMaterialPdfPageWords = async (connection, { materialPdfId, pages }) => {
  for (const pageEntry of pages || []) {
    await updateMaterialPdfPageWords(connection, {
      materialPdfId,
      page: pageEntry.page,
      words: Array.isArray(pageEntry.words) ? pageEntry.words : []
    });
  }
};

const listMaterialProductionPages = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT pc.id, pc.material_id AS materialId, pc.material_pdf_id AS materialPdfId,
            pc.title, pc.page, pc.seg, pc.words,
            p.display_name AS pdfDisplayName, p.original_file_name AS originalFileName,
            p.storage_sequence AS storageSequence, p.cover_url AS coverUrl,
            p.main_start AS mainStart, p.main_end AS mainEnd,
            p.parse_status AS parseStatus, p.structured_content_status AS structuredContentStatus
     FROM bt_material_pdf_page_contents pc
     INNER JOIN bt_material_pdfs p ON p.id = pc.material_pdf_id
     WHERE pc.material_id = ?
     ORDER BY p.sort_order ASC, p.id ASC, pc.page ASC`,
    [materialId]
  );

  const formattedRows = rows.map((row) => {
    const segments = parseJsonField(row.seg, {});
    const words = parseJsonField(row.words, []);
    return {
      id: row.id,
      materialId: Number(row.materialId),
      materialPdfId: Number(row.materialPdfId),
      title: row.title || '',
      page: Number(row.page || 0),
      seg: segments,
      words: Array.isArray(words) ? words : [],
      body: '',
      pdfDisplayName: row.pdfDisplayName || path.parse(row.originalFileName || 'document').name,
      originalFileName: row.originalFileName,
      storageSequence: Number(row.storageSequence || 0),
      coverUrl: row.coverUrl || null,
      mainStart: row.mainStart === null || row.mainStart === undefined ? null : Number(row.mainStart),
      mainEnd: row.mainEnd === null || row.mainEnd === undefined ? null : Number(row.mainEnd),
      parseStatus: row.parseStatus || PDF_PARSE_STATUS.QUEUED,
      structuredContentStatus: row.structuredContentStatus || STRUCTURED_CONTENT_STATUS.NOT_STARTED
    };
  });

  const pagesByPdfId = new Map();
  formattedRows.forEach((pageEntry) => {
    if (!pagesByPdfId.has(pageEntry.materialPdfId)) {
      pagesByPdfId.set(pageEntry.materialPdfId, []);
    }
    pagesByPdfId.get(pageEntry.materialPdfId).push(pageEntry);
  });

  const bodyByPdfId = new Map();
  pagesByPdfId.forEach((pdfPages, materialPdfId) => {
    const samplePage = pdfPages[0] || {};
    bodyByPdfId.set(
      materialPdfId,
      buildPdfMainRangeBodyFromPages(pdfPages, {
        mainStart: samplePage.mainStart,
        mainEnd: samplePage.mainEnd
      })
    );
  });

  return formattedRows.map((pageEntry) => ({
    ...pageEntry,
    body: bodyByPdfId.get(pageEntry.materialPdfId) || ''
  }));
};

const buildMaterialProductionPdfTargets = ({ pdfs = [], pages = [] }) => {
  const pagesByPdfId = new Map();
  pages.forEach((page) => {
    const pdfId = Number(page.materialPdfId || 0);
    if (!pdfId) return;
    if (!pagesByPdfId.has(pdfId)) {
      pagesByPdfId.set(pdfId, []);
    }
    pagesByPdfId.get(pdfId).push(page);
  });

  return (pdfs || [])
    .map((pdf) => {
      const materialPdfId = Number(pdf.id || pdf.materialPdfId || 0);
      const pdfPages = (pagesByPdfId.get(materialPdfId) || []).slice().sort((left, right) => left.page - right.page);
      if (!pdfPages.length) {
        return null;
      }

      const mergedSegments = {};
      let segmentIndex = 1;
      pdfPages.forEach((page) => {
        getOrderedSegmentEntries(page.seg || {}).forEach((segment) => {
          const key = `seg${segmentIndex}`;
          mergedSegments[key] = {
            [`${key}_pic`]: segment.pic || '',
            [`${key}_text`]: segment.text
          };
          segmentIndex += 1;
        });
      });

      const title = normalizeStructuredContentValue(pdf.title)
        || pdfPages.find((page) => normalizeStructuredContentValue(page.title))?.title
        || pdfPages[0]?.title
        || '';
      const words = Array.isArray(pdf.keywords) && pdf.keywords.length
        ? pdf.keywords
        : collectPdfKeywordsFromPages(pdfPages);
      const body = buildPdfMainRangeBodyFromPages(pdfPages, {
        mainStart: pdf.mainStart,
        mainEnd: pdf.mainEnd
      });

      return {
        id: `pdf-${materialPdfId}`,
        materialId: Number(pdf.materialId || pdfPages[0].materialId || 0),
        materialPdfId,
        title,
        page: 0,
        scopeType: 'pdf',
        seg: mergedSegments,
        words,
        body,
        pdfDisplayName: pdf.displayName || path.parse(pdf.originalFileName || 'document').name,
        originalFileName: pdf.originalFileName || null,
        storageSequence: Number(pdf.storageSequence || 0),
        coverUrl: pdf.coverUrl || pdfPages[0].coverUrl || null,
        parseStatus: pdf.parseStatus || PDF_PARSE_STATUS.QUEUED,
        structuredContentStatus: pdf.structuredContentStatus || STRUCTURED_CONTENT_STATUS.NOT_STARTED,
        pageCount: pdfPages.length
      };
    })
    .filter(Boolean);
};

const getMaterialProductionPage = async (connection, materialPdfId, page) => {
  const pdf = await getMaterialPdfById(connection, materialPdfId);
  if (!pdf) return null;

  const formattedPdf = formatPdfRow(pdf);
  const pageRows = await listMaterialPdfPageContents(connection, materialPdfId);
  if (!pageRows.length) return null;

  const hydratedPages = pageRows
    .map((row) => {
      const segments = parseJsonField(row.seg, {});
      const words = parseJsonField(row.words, []);
      return {
        id: row.id,
        materialId: Number(row.materialId),
        materialPdfId: Number(row.materialPdfId),
        title: row.title || '',
        page: Number(row.page || 0),
        seg: segments,
        words: Array.isArray(words) ? words : [],
        body: '',
        pdfDisplayName: formattedPdf.displayName,
        originalFileName: formattedPdf.originalFileName,
        storageSequence: formattedPdf.storageSequence,
        coverUrl: formattedPdf.coverUrl || null,
        mainStart: formattedPdf.mainStart,
        mainEnd: formattedPdf.mainEnd
      };
    })
    .sort((left, right) => left.page - right.page);

  const pdfBody = buildPdfMainRangeBodyFromPages(hydratedPages, {
    mainStart: formattedPdf.mainStart,
    mainEnd: formattedPdf.mainEnd
  });

  return hydratedPages
    .map((pageEntry) => ({
      ...pageEntry,
      body: pdfBody
    }))
    .find((pageEntry) => pageEntry.page === Number(page)) || null;
};

const getMaterialProductionPdfTarget = async (connection, materialPdfId) => {
  const pdf = await getMaterialPdfById(connection, materialPdfId);
  if (!pdf) return null;

  const pageRows = await listMaterialPdfPageContents(connection, materialPdfId);
  if (!pageRows.length) return null;

  const formattedPdf = formatPdfRow(pdf);
  const hydratedPages = pageRows
    .map((row) => {
      const segments = parseJsonField(row.seg, {});
      const words = parseJsonField(row.words, []);
      return {
        id: row.id,
        materialId: Number(row.materialId),
        materialPdfId: Number(row.materialPdfId),
        title: row.title || '',
        page: Number(row.page || 0),
        seg: segments,
        words: Array.isArray(words) ? words : [],
        body: '',
        pdfDisplayName: formattedPdf.displayName,
        originalFileName: formattedPdf.originalFileName,
        storageSequence: formattedPdf.storageSequence,
        coverUrl: formattedPdf.coverUrl || null,
        parseStatus: formattedPdf.parseStatus,
        structuredContentStatus: formattedPdf.structuredContentStatus
      };
    })
    .sort((left, right) => left.page - right.page);

  const pdfBody = buildPdfMainRangeBodyFromPages(hydratedPages, {
    mainStart: formattedPdf.mainStart,
    mainEnd: formattedPdf.mainEnd
  });

  hydratedPages.forEach((pageEntry) => {
    pageEntry.body = pdfBody;
  });

  return buildMaterialProductionPdfTargets({
    pdfs: [formattedPdf],
    pages: hydratedPages
  })[0] || null;
};

const getMaterialProductionTarget = async (connection, materialPdfId, page) => {
  if (Number(page || 0) > 0) {
    return getMaterialProductionPage(connection, materialPdfId, page);
  }

  return getMaterialProductionPdfTarget(connection, materialPdfId);
};

const normalizePageRef = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const [materialPdfIdRaw, pageRaw] = value.split(':');
    const materialPdfId = normalizeNullableId(materialPdfIdRaw);
    const page = normalizeStructuredPageNumber(pageRaw, 0);
    return materialPdfId && page ? { materialPdfId, page } : null;
  }

  if (typeof value === 'object') {
    const materialPdfId = normalizeNullableId(value.materialPdfId ?? value.pdfId);
    const page = normalizeStructuredPageNumber(value.page, 0);
    return materialPdfId && page ? { materialPdfId, page } : null;
  }

  return null;
};

const selectProductionPages = ({ allPages, scope, pageRefs }) => {
  if (scope === THUMBNAIL_SCOPE.ALL) {
    return allPages;
  }

  const desiredKeys = new Set((pageRefs || []).map((pageRef) => `${pageRef.materialPdfId}:${pageRef.page}`));
  return allPages.filter((page) => desiredKeys.has(`${page.materialPdfId}:${page.page}`));
};

const buildMaterialAudioGenerationTargets = ({ pdfs = [], allPages = [], scope, pageRefs = [] }) => {
  const pagesByPdfId = new Map();
  (allPages || []).forEach((pageEntry) => {
    const materialPdfId = Number(pageEntry?.materialPdfId || 0);
    if (!materialPdfId) return;
    if (!pagesByPdfId.has(materialPdfId)) {
      pagesByPdfId.set(materialPdfId, []);
    }
    pagesByPdfId.get(materialPdfId).push(pageEntry);
  });

  const eligiblePages = (pdfs || []).flatMap((pdf) => {
    const materialPdfId = Number(pdf?.id || pdf?.materialPdfId || 0);
    if (!materialPdfId) return [];
    const pdfPages = (pagesByPdfId.get(materialPdfId) || []).slice().sort((left, right) => left.page - right.page);
    return filterPagesByMainRange(pdfPages, {
      mainStart: pdf?.mainStart,
      mainEnd: pdf?.mainEnd
    });
  });

  const selectedPageTargets = selectProductionPages({
    allPages: eligiblePages,
    scope,
    pageRefs
  });

  const selectedPdfIds = new Set(
    (scope === THUMBNAIL_SCOPE.ALL
      ? (pdfs || []).map((pdf) => Number(pdf?.id || pdf?.materialPdfId || 0))
      : (selectedPageTargets || []).map((target) => Number(target?.materialPdfId || 0)))
      .filter((value) => Number.isFinite(value) && value > 0)
  );

  const titleTargets = buildMaterialProductionPdfTargets({
    pdfs,
    pages: allPages
  })
    .filter((target) => selectedPdfIds.has(Number(target.materialPdfId || 0)))
    .filter((target) => normalizeStructuredContentValue(target.title))
    .map((target) => ({
      ...target,
      scopeType: 'title',
      page: 0
    }));

  return {
    titleTargets,
    pageTargets: selectedPageTargets,
    targets: [...titleTargets, ...selectedPageTargets]
  };
};

const buildThumbnailObjectKey = ({ material, thumbnailId, pageRef, extension }) => {
  const targetSegment = Number(pageRef.page || 0) > 0 ? `page-${pageRef.page}` : 'whole-pdf';
  return `${material.ossPrefix}/thumbnails/pdf-${pageRef.storageSequence}/${targetSegment}/thumb-${thumbnailId}.${extension}`;
};

const buildThumbnailVideoObjectKey = ({ material, videoId, pageRef, extension = THUMBNAIL_VIDEO_OBJECT_NAME }) => {
  const targetSegment = Number(pageRef.page || 0) > 0 ? `page-${pageRef.page}` : 'whole-pdf';
  return `${material.ossPrefix}/videos/pdf-${pageRef.storageSequence}/${targetSegment}/video-${videoId}.${extension}`;
};

const buildMaterialAudioObjectKey = ({
  material,
  audioId,
  pageRef,
  segmentOrder = 0,
  voiceType,
  extension = MATERIAL_AUDIO_OBJECT_NAME
}) => {
  let targetSegment = Number(pageRef.page || 0) > 0 ? `page-${pageRef.page}` : 'whole-pdf';
  if (Number(segmentOrder || 0) > 0) {
    targetSegment = `${targetSegment}/seg-${segmentOrder}`;
  }
  const voiceSegment = sanitizeOssSegment(voiceType).replace(/\s+/g, '-').toLowerCase();
  return `${material.ossPrefix}/audios/pdf-${pageRef.storageSequence}/${targetSegment}/${voiceSegment}/audio-${audioId}.${extension}`;
};

const listThumbnailsByMaterialId = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT t.id, t.material_id AS materialId, t.material_pdf_id AS materialPdfId, t.page,
            t.language, t.derived_from_thumbnail_id AS derivedFromThumbnailId,
            t.generation_kind AS generationKind, t.prompt_text AS promptText,
            t.status, t.output_path AS outputPath, t.output_meta_json AS outputMetaJson,
            t.last_message AS lastMessage, t.annotation_status AS annotationStatus,
            t.annotation_error AS annotationError, t.annotated_at AS annotatedAt,
            t.generated_at AS generatedAt, t.created_at AS createdAt, t.updated_at AS updatedAt
     FROM bt_material_thumbnails t
     WHERE t.material_id = ?
     ORDER BY t.material_pdf_id ASC, t.page ASC, t.created_at ASC, t.id ASC`,
    [materialId]
  );

  return rows.map((row) => ({
    outputMeta: parseJsonField(row.outputMetaJson, {}),
    id: Number(row.id),
    materialId: Number(row.materialId),
    materialPdfId: Number(row.materialPdfId),
    page: Number(row.page || 0),
    scopeType: Number(row.page || 0) > 0 ? 'page' : 'pdf',
    language: row.language,
    languageLabel: THUMBNAIL_LANGUAGE_LABELS[row.language] || row.language,
    derivedFromThumbnailId: row.derivedFromThumbnailId === null || row.derivedFromThumbnailId === undefined ? null : Number(row.derivedFromThumbnailId),
    generationKind: row.generationKind || THUMBNAIL_GENERATION_KINDS.BASE,
    promptText: row.promptText || '',
    status: row.status || THUMBNAIL_STATUS.NOT_STARTED,
    outputPath: row.outputPath || null,
    outputUrl: buildAssetOutputUrl(row.outputPath),
    pngOutputUrl: parseJsonField(row.outputMetaJson, {}).pngOutputUrl || buildAssetOutputUrl(parseJsonField(row.outputMetaJson, {}).pngOutputPath),
    compressedJpgOutputUrl: parseJsonField(row.outputMetaJson, {}).compressedJpgOutputUrl || buildAssetOutputUrl(parseJsonField(row.outputMetaJson, {}).compressedJpgOutputPath || row.outputPath),
    lastMessage: row.lastMessage || '',
    annotationStatus: row.annotationStatus || THUMBNAIL_ANNOTATION_STATUS.NOT_STARTED,
    annotationError: row.annotationError || '',
    annotatedAt: row.annotatedAt || null,
    generatedAt: row.generatedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
};

const listLeanThumbnailsByMaterialId = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT t.id, t.material_id AS materialId, t.material_pdf_id AS materialPdfId, t.page,
            t.language, t.derived_from_thumbnail_id AS derivedFromThumbnailId,
            t.generation_kind AS generationKind, t.status,
            t.output_path AS outputPath, t.output_meta_json AS outputMetaJson,
            t.last_message AS lastMessage, t.annotation_status AS annotationStatus,
            t.annotation_error AS annotationError, t.annotated_at AS annotatedAt,
            t.generated_at AS generatedAt, t.created_at AS createdAt, t.updated_at AS updatedAt
     FROM bt_material_thumbnails t
     WHERE t.material_id = ?
     ORDER BY t.material_pdf_id ASC, t.page ASC, t.created_at ASC, t.id ASC`,
    [materialId]
  );

  return rows.map((row) => {
    const outputMeta = parseJsonField(row.outputMetaJson, {});
    return {
      id: Number(row.id),
      materialId: Number(row.materialId),
      materialPdfId: Number(row.materialPdfId),
      page: Number(row.page || 0),
      scopeType: Number(row.page || 0) > 0 ? 'page' : 'pdf',
      language: row.language,
      languageLabel: THUMBNAIL_LANGUAGE_LABELS[row.language] || row.language,
      derivedFromThumbnailId: row.derivedFromThumbnailId === null || row.derivedFromThumbnailId === undefined ? null : Number(row.derivedFromThumbnailId),
      generationKind: row.generationKind || THUMBNAIL_GENERATION_KINDS.BASE,
      status: row.status || THUMBNAIL_STATUS.NOT_STARTED,
      outputPath: row.outputPath || null,
      outputUrl: buildAssetOutputUrl(row.outputPath),
      pngOutputUrl: outputMeta.pngOutputUrl || buildAssetOutputUrl(outputMeta.pngOutputPath),
      compressedJpgOutputUrl: outputMeta.compressedJpgOutputUrl || buildAssetOutputUrl(outputMeta.compressedJpgOutputPath || row.outputPath),
      lastMessage: row.lastMessage || '',
      annotationStatus: row.annotationStatus || THUMBNAIL_ANNOTATION_STATUS.NOT_STARTED,
      annotationError: row.annotationError || '',
      annotatedAt: row.annotatedAt || null,
      generatedAt: row.generatedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  });
};

const getThumbnailById = async (connection, thumbnailId) => {
  const [rows] = await connection.execute(
    `SELECT t.id, t.material_id AS materialId, t.material_pdf_id AS materialPdfId, t.page,
            t.language, t.derived_from_thumbnail_id AS derivedFromThumbnailId,
            t.generation_kind AS generationKind, t.prompt_text AS promptText,
            t.status, t.output_path AS outputPath, t.output_meta_json AS outputMetaJson,
            t.last_message AS lastMessage, t.annotation_status AS annotationStatus,
            t.annotation_error AS annotationError, t.annotated_at AS annotatedAt,
            t.generated_at AS generatedAt, t.created_at AS createdAt, t.updated_at AS updatedAt
     FROM bt_material_thumbnails t
     WHERE t.id = ?
     LIMIT 1`,
    [thumbnailId]
  );

  const row = rows[0];
  if (!row) return null;

  const outputMeta = parseJsonField(row.outputMetaJson, {});

  return {
    id: Number(row.id),
    materialId: Number(row.materialId),
    materialPdfId: Number(row.materialPdfId),
    page: Number(row.page || 0),
    scopeType: Number(row.page || 0) > 0 ? 'page' : 'pdf',
    language: row.language,
    languageLabel: THUMBNAIL_LANGUAGE_LABELS[row.language] || row.language,
    derivedFromThumbnailId: row.derivedFromThumbnailId === null || row.derivedFromThumbnailId === undefined ? null : Number(row.derivedFromThumbnailId),
    generationKind: row.generationKind || THUMBNAIL_GENERATION_KINDS.BASE,
    promptText: row.promptText || '',
    status: row.status || THUMBNAIL_STATUS.NOT_STARTED,
    outputPath: row.outputPath || null,
    outputUrl: buildAssetOutputUrl(row.outputPath),
    outputMeta,
    pngOutputUrl: outputMeta.pngOutputUrl || buildAssetOutputUrl(outputMeta.pngOutputPath),
    compressedJpgOutputUrl: outputMeta.compressedJpgOutputUrl || buildAssetOutputUrl(outputMeta.compressedJpgOutputPath || row.outputPath),
    lastMessage: row.lastMessage || '',
    annotationStatus: row.annotationStatus || THUMBNAIL_ANNOTATION_STATUS.NOT_STARTED,
    annotationError: row.annotationError || '',
    annotatedAt: row.annotatedAt || null,
    generatedAt: row.generatedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const createThumbnailRecord = async (connection, {
  materialId,
  materialPdfId,
  page,
  language,
  derivedFromThumbnailId = null,
  generationKind = THUMBNAIL_GENERATION_KINDS.BASE,
  promptText = '',
  status = THUMBNAIL_STATUS.QUEUED,
  lastMessage = ''
}) => {
  const [result] = await connection.execute(
    `INSERT INTO bt_material_thumbnails (
      material_id, material_pdf_id, page, language, derived_from_thumbnail_id,
      generation_kind, prompt_text, status, output_path, output_meta_json, last_message,
      annotation_status, annotation_error, annotated_at, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL)`,
    [
      materialId,
      materialPdfId,
      page,
      language,
      derivedFromThumbnailId,
      generationKind,
      promptText || null,
      status,
      lastMessage || '',
      THUMBNAIL_ANNOTATION_STATUS.NOT_STARTED
    ]
  );

  return Number(result.insertId);
};

const updateThumbnailRecord = async (connection, thumbnailId, updates) => {
  const columns = [];
  const params = [];

  Object.entries(updates).forEach(([key, value]) => {
    columns.push(`\`${key}\` = ?`);
    params.push(value);
  });

  if (!columns.length) return;

  params.push(thumbnailId);
  await connection.execute(
    `UPDATE bt_material_thumbnails SET ${columns.join(', ')} WHERE id = ?`,
    params
  );
};

const listThumbnailVideosByMaterialId = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            thumbnail_id AS thumbnailId, source_thumbnail_id AS sourceThumbnailId,
            page, scope_type AS scopeType, prompt_text AS promptText,
            status, output_path AS outputPath, output_meta_json AS outputMetaJson,
            last_message AS lastMessage, error_message AS errorMessage,
            generated_at AS generatedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_thumbnail_videos
     WHERE material_id = ?
     ORDER BY thumbnail_id ASC, created_at ASC, id ASC`,
    [materialId]
  );

  return rows.map((row) => {
    const outputMeta = parseJsonField(row.outputMetaJson, {});
    return {
      id: Number(row.id),
      materialId: Number(row.materialId),
      materialPdfId: Number(row.materialPdfId),
      thumbnailId: Number(row.thumbnailId),
      sourceThumbnailId: row.sourceThumbnailId === null || row.sourceThumbnailId === undefined ? null : Number(row.sourceThumbnailId),
      page: Number(row.page || 0),
      scopeType: row.scopeType || (Number(row.page || 0) > 0 ? 'page' : 'pdf'),
      promptText: row.promptText || '',
      status: row.status || THUMBNAIL_VIDEO_STATUS.NOT_STARTED,
      outputPath: row.outputPath || null,
      outputUrl: buildAssetOutputUrl(row.outputPath),
      outputMeta,
      lastMessage: row.lastMessage || '',
      errorMessage: row.errorMessage || '',
      generatedAt: row.generatedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  });
};

const listLeanThumbnailVideosByMaterialId = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            thumbnail_id AS thumbnailId, source_thumbnail_id AS sourceThumbnailId,
            page, scope_type AS scopeType, status, output_path AS outputPath,
            output_meta_json AS outputMetaJson, last_message AS lastMessage,
            error_message AS errorMessage, generated_at AS generatedAt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_thumbnail_videos
     WHERE material_id = ?
     ORDER BY thumbnail_id ASC, created_at ASC, id ASC`,
    [materialId]
  );

  return rows.map((row) => {
    const outputMeta = parseJsonField(row.outputMetaJson, {});
    return {
      id: Number(row.id),
      materialId: Number(row.materialId),
      materialPdfId: Number(row.materialPdfId),
      thumbnailId: Number(row.thumbnailId),
      sourceThumbnailId: row.sourceThumbnailId === null || row.sourceThumbnailId === undefined ? null : Number(row.sourceThumbnailId),
      page: Number(row.page || 0),
      scopeType: row.scopeType || (Number(row.page || 0) > 0 ? 'page' : 'pdf'),
      status: row.status || THUMBNAIL_VIDEO_STATUS.NOT_STARTED,
      outputPath: row.outputPath || null,
      outputUrl: buildAssetOutputUrl(row.outputPath),
      lastMessage: row.lastMessage || '',
      errorMessage: row.errorMessage || '',
      generatedAt: row.generatedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      outputMeta: {
        remoteTaskId: outputMeta.remoteTaskId || null,
        sourceImageUrl: outputMeta.sourceImageUrl || null,
        firstFrameUrl: outputMeta.firstFrameUrl || null,
        lastFrameUrl: outputMeta.lastFrameUrl || null
      }
    };
  });
};

const getThumbnailVideoById = async (connection, videoId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            thumbnail_id AS thumbnailId, source_thumbnail_id AS sourceThumbnailId,
            page, scope_type AS scopeType, prompt_text AS promptText,
            status, output_path AS outputPath, output_meta_json AS outputMetaJson,
            last_message AS lastMessage, error_message AS errorMessage,
            generated_at AS generatedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_thumbnail_videos
     WHERE id = ?
     LIMIT 1`,
    [videoId]
  );

  const row = rows[0];
  if (!row) return null;

  const outputMeta = parseJsonField(row.outputMetaJson, {});
  return {
    id: Number(row.id),
    materialId: Number(row.materialId),
    materialPdfId: Number(row.materialPdfId),
    thumbnailId: Number(row.thumbnailId),
    sourceThumbnailId: row.sourceThumbnailId === null || row.sourceThumbnailId === undefined ? null : Number(row.sourceThumbnailId),
    page: Number(row.page || 0),
    scopeType: row.scopeType || (Number(row.page || 0) > 0 ? 'page' : 'pdf'),
    promptText: row.promptText || '',
    status: row.status || THUMBNAIL_VIDEO_STATUS.NOT_STARTED,
    outputPath: row.outputPath || null,
    outputUrl: buildAssetOutputUrl(row.outputPath),
    outputMeta,
    lastMessage: row.lastMessage || '',
    errorMessage: row.errorMessage || '',
    generatedAt: row.generatedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const createThumbnailVideoRecord = async (connection, {
  materialId,
  materialPdfId,
  thumbnailId,
  sourceThumbnailId = null,
  page = 0,
  scopeType = 'page',
  promptText = '',
  status = THUMBNAIL_VIDEO_STATUS.QUEUED,
  lastMessage = ''
}) => {
  const [result] = await connection.execute(
    `INSERT INTO bt_material_thumbnail_videos (
      material_id, material_pdf_id, thumbnail_id, source_thumbnail_id, page, scope_type,
      prompt_text, status, output_path, output_meta_json, last_message, error_message, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL)`,
    [
      materialId,
      materialPdfId,
      thumbnailId,
      sourceThumbnailId,
      page,
      scopeType,
      promptText || null,
      status,
      lastMessage || ''
    ]
  );

  return Number(result.insertId);
};

const updateThumbnailVideoRecord = async (connection, videoId, updates) => {
  const columns = [];
  const params = [];

  Object.entries(updates).forEach(([key, value]) => {
    columns.push(`\`${key}\` = ?`);
    params.push(value);
  });

  if (!columns.length) return;

  params.push(videoId);
  await connection.execute(
    `UPDATE bt_material_thumbnail_videos SET ${columns.join(', ')} WHERE id = ?`,
    params
  );
};

const listLeanMaterialAudiosByMaterialId = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            page, seg, scope_type AS scopeType, voice_type AS voiceType, voice_label AS voiceLabel, speed_ratio AS speedRatio,
            status, input_text AS inputText, output_path AS outputPath,
            output_meta_json AS outputMetaJson, last_message AS lastMessage,
            error_message AS errorMessage, generated_at AS generatedAt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_audios
     WHERE material_id = ?
     ORDER BY material_pdf_id ASC, page ASC, seg ASC, voice_type ASC, id ASC`,
    [materialId]
  );

  return rows.map((row) => {
    const outputMeta = parseJsonField(row.outputMetaJson, {});
    const seg = Number(row.seg || 0);
    return {
      id: Number(row.id),
      materialId: Number(row.materialId),
      materialPdfId: Number(row.materialPdfId),
      page: Number(row.page || 0),
      seg,
      scopeType: row.scopeType || (Number(row.page || 0) > 0 ? (seg > 0 ? 'segment' : 'page') : 'pdf'),
      voiceType: row.voiceType || '',
      voiceLabel: row.voiceLabel || row.voiceType || '',
      speedRatio: normalizeMaterialAudioSpeedRatio(row.speedRatio ?? outputMeta.speedRatio),
      status: row.status || MATERIAL_AUDIO_STATUS.NOT_STARTED,
      inputText: row.inputText || '',
      outputPath: row.outputPath || null,
      outputUrl: buildAssetOutputUrl(row.outputPath),
      outputMeta,
      lastMessage: row.lastMessage || '',
      errorMessage: row.errorMessage || '',
      generatedAt: row.generatedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  });
};

const getMaterialAudioById = async (connection, audioId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            page, seg, scope_type AS scopeType, voice_type AS voiceType, voice_label AS voiceLabel, speed_ratio AS speedRatio,
            status, input_text AS inputText, output_path AS outputPath,
            output_meta_json AS outputMetaJson, last_message AS lastMessage,
            error_message AS errorMessage, generated_at AS generatedAt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_audios
     WHERE id = ?
     LIMIT 1`,
    [audioId]
  );

  const row = rows[0];
  if (!row) return null;

  const outputMeta = parseJsonField(row.outputMetaJson, {});
  const seg = Number(row.seg || 0);
  return {
    id: Number(row.id),
    materialId: Number(row.materialId),
    materialPdfId: Number(row.materialPdfId),
    page: Number(row.page || 0),
    seg,
    scopeType: row.scopeType || (Number(row.page || 0) > 0 ? (seg > 0 ? 'segment' : 'page') : 'pdf'),
    voiceType: row.voiceType || '',
    voiceLabel: row.voiceLabel || row.voiceType || '',
    speedRatio: normalizeMaterialAudioSpeedRatio(row.speedRatio ?? outputMeta.speedRatio),
    status: row.status || MATERIAL_AUDIO_STATUS.NOT_STARTED,
    inputText: row.inputText || '',
    outputPath: row.outputPath || null,
    outputUrl: buildAssetOutputUrl(row.outputPath),
    outputMeta,
    lastMessage: row.lastMessage || '',
    errorMessage: row.errorMessage || '',
    generatedAt: row.generatedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const findMaterialAudioByTargetAndVoice = async (connection, {
  materialId,
  materialPdfId,
  page,
  seg = 0,
  voiceType
}) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_audios
     WHERE material_id = ? AND material_pdf_id = ? AND page = ? AND seg = ? AND voice_type = ?
     LIMIT 1`,
    [materialId, materialPdfId, page, seg, voiceType]
  );

  if (!rows.length) return null;
  return getMaterialAudioById(connection, rows[0].id);
};

const upsertMaterialAudioRecord = async (connection, {
  materialId,
  materialPdfId,
  page = 0,
  seg = 0,
  scopeType = 'page',
  voiceType,
  voiceLabel = '',
  speedRatio = DEFAULT_MATERIAL_AUDIO_SPEED_RATIO,
  inputText = '',
  status = MATERIAL_AUDIO_STATUS.QUEUED,
  lastMessage = ''
}) => {
  const [result] = await connection.execute(
    `INSERT INTO bt_material_audios (
      material_id, material_pdf_id, page, seg, scope_type, voice_type, voice_label, speed_ratio,
      input_text, status, output_path, output_meta_json, last_message, error_message, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL)
    ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      seg = VALUES(seg),
      scope_type = VALUES(scope_type),
      voice_label = VALUES(voice_label),
      speed_ratio = VALUES(speed_ratio),
      input_text = VALUES(input_text),
      status = VALUES(status),
      output_path = NULL,
      output_meta_json = NULL,
      last_message = VALUES(last_message),
      error_message = NULL,
      generated_at = NULL`,
    [
      materialId,
      materialPdfId,
      page,
      seg,
      scopeType,
      voiceType,
      voiceLabel || voiceType,
      normalizeMaterialAudioSpeedRatio(speedRatio),
      inputText || null,
      status,
      lastMessage || ''
    ]
  );

  return Number(result.insertId);
};

const updateMaterialAudioRecord = async (connection, audioId, updates) => {
  const columns = [];
  const params = [];

  Object.entries(updates).forEach(([key, value]) => {
    columns.push(`\`${key}\` = ?`);
    params.push(value);
  });

  if (!columns.length) return;

  params.push(audioId);
  await connection.execute(
    `UPDATE bt_material_audios SET ${columns.join(', ')} WHERE id = ?`,
    params
  );
};

const listThumbnailAnnotationsByMaterialId = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            page, thumbnail_id AS thumbnailId, sentence_role AS sentenceRole,
            sentence_order AS sentenceOrder, sentence_text AS sentenceText,
            text_box_json AS textBoxJson, image_box_json AS imageBoxJson,
            model_name AS modelName, prompt_text AS promptText,
            raw_response_json AS rawResponseJson, created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_thumbnail_annotations
     WHERE material_id = ?
     ORDER BY thumbnail_id ASC, sentence_order ASC, id ASC`,
    [materialId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    materialId: Number(row.materialId),
    materialPdfId: Number(row.materialPdfId),
    page: Number(row.page || 0),
    thumbnailId: Number(row.thumbnailId),
    sentenceRole: row.sentenceRole,
    sentenceOrder: Number(row.sentenceOrder || 0),
    sentenceText: row.sentenceText || '',
    textBox: parseJsonField(row.textBoxJson, null),
    imageBox: parseJsonField(row.imageBoxJson, null),
    modelName: row.modelName || '',
    promptText: row.promptText || '',
    rawResponse: parseJsonField(row.rawResponseJson, null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
};

const listLeanThumbnailAnnotationsByMaterialId = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT id, material_id AS materialId, material_pdf_id AS materialPdfId,
            page, thumbnail_id AS thumbnailId, sentence_role AS sentenceRole,
            sentence_order AS sentenceOrder, sentence_text AS sentenceText,
            text_box_json AS textBoxJson, image_box_json AS imageBoxJson,
            model_name AS modelName, created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_thumbnail_annotations
     WHERE material_id = ?
     ORDER BY thumbnail_id ASC, sentence_order ASC, id ASC`,
    [materialId]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    materialId: Number(row.materialId),
    materialPdfId: Number(row.materialPdfId),
    page: Number(row.page || 0),
    thumbnailId: Number(row.thumbnailId),
    sentenceRole: row.sentenceRole,
    sentenceOrder: Number(row.sentenceOrder || 0),
    sentenceText: row.sentenceText || '',
    textBox: parseJsonField(row.textBoxJson, null),
    imageBox: parseJsonField(row.imageBoxJson, null),
    modelName: row.modelName || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
};

const replaceThumbnailAnnotations = async (connection, {
  thumbnailId,
  materialId,
  materialPdfId,
  page,
  modelName,
  promptText,
  rawResponse,
  items
}) => {
  await connection.execute(
    'DELETE FROM bt_material_thumbnail_annotations WHERE thumbnail_id = ?',
    [thumbnailId]
  );

  for (const item of items) {
    await connection.execute(
      `INSERT INTO bt_material_thumbnail_annotations (
        material_id, material_pdf_id, page, thumbnail_id,
        sentence_role, sentence_order, sentence_text,
        text_box_json, image_box_json, model_name, prompt_text, raw_response_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        materialId,
        materialPdfId,
        page,
        thumbnailId,
        item.sentenceRole,
        item.sentenceOrder,
        item.sentenceText,
        JSON.stringify(item.textBox || null),
        JSON.stringify(item.imageBox || null),
        modelName,
        promptText,
        JSON.stringify(rawResponse || null)
      ]
    );
  }
};

const buildAnnotationParagraphsFromBody = (body) => {
  return normalizeStructuredContentValue(body)
    .split(/\n\s*\n+/)
    .map((item) => normalizeStructuredContentValue(item))
    .filter(Boolean);
};

const buildExpectedAnnotationEntries = ({
  title,
  segments,
  body,
  useBody = false
}) => {
  const items = [];
  const normalizedTitle = normalizeStructuredContentValue(title);
  if (normalizedTitle) {
    items.push({
      sentenceRole: 'title',
      sentenceOrder: 0,
      sentenceText: normalizedTitle
    });
  }

  if (useBody) {
    buildAnnotationParagraphsFromBody(body).forEach((sentenceText, index) => {
      items.push({
        sentenceRole: 'seg',
        sentenceOrder: index + 1,
        sentenceText
      });
    });
    return items;
  }

  Object.entries(segments || {})
    .sort((left, right) => {
      const leftIndex = normalizeStructuredPageNumber(String(left[0]).replace(/[^0-9]/g, ''), 0);
      const rightIndex = normalizeStructuredPageNumber(String(right[0]).replace(/[^0-9]/g, ''), 0);
      return leftIndex - rightIndex;
    })
    .forEach(([key, value], index) => {
      const textKey = Object.keys(value || {}).find((field) => /_text$/i.test(field));
      const sentenceText = normalizeStructuredContentValue(textKey ? value[textKey] : '');
      if (!sentenceText) return;
      const order = normalizeStructuredPageNumber(String(key).replace(/[^0-9]/g, ''), index + 1);
      items.push({
        sentenceRole: 'seg',
        sentenceOrder: order,
        sentenceText
      });
    });

  return items;
};

const normalizeExpectedAnnotationEntries = (entries) => {
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry, index) => {
      const sentenceRole = entry?.sentenceRole === 'title' ? 'title' : 'seg';
      const sentenceText = normalizeStructuredContentValue(entry?.sentenceText);
      if (!sentenceText) return null;

      const fallbackOrder = sentenceRole === 'title' ? 0 : index + 1;
      const sentenceOrder = sentenceRole === 'title'
        ? 0
        : normalizeStructuredPageNumber(entry?.sentenceOrder, fallbackOrder);

      return {
        sentenceRole,
        sentenceOrder,
        sentenceText
      };
    })
    .filter(Boolean);
};

const shouldUseBodyForAnnotationTemplate = (templateOrPrompt) => {
  const normalized = String(templateOrPrompt || '');
  const hasBody = normalized.includes(ANNOTATION_TEMPLATE_BODY_TOKEN) || normalized.includes('<正文内容>');
  const hasSegments = normalized.includes(ANNOTATION_TEMPLATE_SEGMENTS_TOKEN) || normalized.includes('<正文内容，每个seg一段>');
  return hasBody && !hasSegments;
};

const normalizeAnnotationItems = ({ rawItems, expectedItems }) => {
  const buckets = new Map();
  const usedIndexes = new Set();

  rawItems.forEach((item, index) => {
    const sentenceText = normalizeStructuredContentValue(
      item?.sentence
        || item?.sentence_text
        || item?.text
        || item?.content
    );
    if (!sentenceText) return;

    const key = sentenceText.toLowerCase();
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push({
      index,
      textBox: normalizeBoxValue(item?.text_box || item?.textBox || item?.text_position || item?.textPosition),
      imageBox: normalizeBoxValue(item?.image_box || item?.imageBox || item?.picture_box || item?.pictureBox || item?.image_position || item?.imagePosition)
    });
  });

  return expectedItems.map((expected) => {
    const key = expected.sentenceText.toLowerCase();
    const candidates = buckets.get(key) || [];
    const match = candidates.find((candidate) => !usedIndexes.has(candidate.index));
    if (!match) {
      throw createPermanentError(`位置标定缺少句子结果：${expected.sentenceText}`, 500);
    }
    if (!match.textBox || !match.imageBox) {
      throw createPermanentError(`位置标定缺少有效坐标：${expected.sentenceText}`, 500);
    }

    usedIndexes.add(match.index);
    return {
      sentenceRole: expected.sentenceRole,
      sentenceOrder: expected.sentenceOrder,
      sentenceText: expected.sentenceText,
      textBox: match.textBox,
      imageBox: match.imageBox
    };
  });
};

const collectThumbnailObjectKeys = (thumbnail) => {
  const objectKeys = new Set();
  if (thumbnail?.outputPath) {
    objectKeys.add(thumbnail.outputPath);
  }

  const outputMeta = thumbnail?.outputMeta || {};
  ['pngOutputPath', 'compressedJpgOutputPath'].forEach((key) => {
    if (outputMeta[key]) {
      objectKeys.add(outputMeta[key]);
    }
  });

  return [...objectKeys];
};

const collectThumbnailVideoObjectKeys = (video) => {
  const objectKeys = new Set();
  if (video?.outputPath) {
    objectKeys.add(video.outputPath);
  }

  const outputMeta = video?.outputMeta || {};
  ['posterPath'].forEach((key) => {
    if (outputMeta[key]) {
      objectKeys.add(outputMeta[key]);
    }
  });

  return [...objectKeys];
};

const collectMaterialAudioObjectKeys = (audio) => {
  const objectKeys = new Set();
  if (audio?.outputPath) {
    objectKeys.add(audio.outputPath);
  }
  return [...objectKeys];
};

const buildMaterialProductionPayload = async (connection, materialId) => {
  const material = await getMaterialById(connection, materialId);
  if (!material) {
    throw createHttpError('教材不存在', 404);
  }

  const [pdfRows, pages, thumbnails, videos, audios, annotations, promptTemplates] = await Promise.all([
    listMaterialPdfsByMaterialIds(connection, [materialId]),
    listMaterialProductionPages(connection, materialId),
    listLeanThumbnailsByMaterialId(connection, materialId),
    listLeanThumbnailVideosByMaterialId(connection, materialId),
    listLeanMaterialAudiosByMaterialId(connection, materialId),
    listLeanThumbnailAnnotationsByMaterialId(connection, materialId),
    getMaterialProductionPromptTemplates(connection, { groupId: material.groupId })
  ]);
  const pdfs = pdfRows.map(formatPdfRow);
  const readyPdfCount = pdfs.filter((pdf) => pdf.parseStatus === PDF_PARSE_STATUS.READY).length;
  const productionMaterial = {
    id: Number(material.id),
    title: material.title,
    description: material.description || '',
    groupId: material.groupId === null || material.groupId === undefined ? null : Number(material.groupId),
    groupName: material.groupName || '',
    sortOrder: Number(material.sortOrder || 0),
    ossPrefix: material.ossPrefix || null,
    parseStatus: material.parseStatus || MATERIAL_PARSE_STATUS.NOT_STARTED,
    storageStatus: material.storageStatus || MATERIAL_STORAGE_STATUS.READY,
    latestError: material.latestError || '',
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
    pdfCount: pdfs.length,
    readyPdfCount,
    canGenerate: material.storageStatus === MATERIAL_STORAGE_STATUS.READY && readyPdfCount > 0
  };
  const pdfTargets = buildMaterialProductionPdfTargets({
    pdfs,
    pages
  });

  return {
    material: productionMaterial,
    pages,
    pdfTargets,
    thumbnails,
    videos,
    audios,
    annotations,
    models: {
      doubao: DOUBAO_MODEL,
      atlasVideo: ATLAS_VIDEO_MODEL,
      volcengineTts: VOLCENGINE_TTS_MODEL
    },
    audioVoices: MATERIAL_AUDIO_VOICE_OPTIONS,
    promptTemplates
  };
};

const formatPdfRow = (row) => {
  const pagesIndexStorageKey = deriveSiblingObjectKey(row.parseStorageKey, 'pages.json');
  const pagesIndexUrl = deriveSiblingUrl(row.parseUrl, 'pages.json');
  const structuredContentUrl = row.structuredContentStorageKey
    ? buildAssetOutputUrl(row.structuredContentStorageKey)
    : null;
  const keywords = parseJsonField(row.keywordsJson, []);

  return {
    id: row.id,
    materialId: row.materialId,
    sortOrder: Number(row.sortOrder || 0),
    storageSequence: Number(row.storageSequence || 0),
    main: row.mainFlag === null || row.mainFlag === undefined ? null : Boolean(Number(row.mainFlag)),
    title: row.pdfTitle || '',
    wordsCount: row.wordsCount === null || row.wordsCount === undefined ? null : Number(row.wordsCount),
    mainStart: row.mainStart === null || row.mainStart === undefined ? null : Number(row.mainStart),
    mainEnd: row.mainEnd === null || row.mainEnd === undefined ? null : Number(row.mainEnd),
    displayName: row.displayName || path.parse(row.originalFileName || 'document').name,
    originalFileName: row.originalFileName,
    sourceMimeType: row.sourceMimeType || '',
    sourceSize: Number(row.sourceSize || 0),
    sourceStorageKey: row.sourceStorageKey || null,
    sourceUrl: row.sourceUrl || null,
    coverStorageKey: row.coverStorageKey || null,
    coverUrl: row.coverUrl || null,
    contentStorageKey: row.contentStorageKey || null,
    contentUrl: row.contentUrl || null,
    parseStorageKey: row.parseStorageKey || null,
    parseUrl: row.parseUrl || null,
    pagesIndexStorageKey,
    pagesIndexUrl,
    structuredContentStorageKey: row.structuredContentStorageKey || null,
    structuredContentUrl,
    keywords,
    keywordMeaningSuccessCount: row.keywordMeaningSuccessCount === null || row.keywordMeaningSuccessCount === undefined
      ? 0
      : Number(row.keywordMeaningSuccessCount),
    keywordMeaningTotalCount: row.keywordMeaningTotalCount === null || row.keywordMeaningTotalCount === undefined
      ? keywords.length
      : Number(row.keywordMeaningTotalCount),
    structuredContentStatus: row.structuredContentStatus || STRUCTURED_CONTENT_STATUS.NOT_STARTED,
    structuredContentError: row.structuredContentError || '',
    legacyLocalPath: row.legacyLocalPath || null,
    uploadStatus: row.uploadStatus || PDF_UPLOAD_STATUS.UPLOADED,
    parseStatus: row.parseStatus || PDF_PARSE_STATUS.QUEUED,
    parserName: row.parserName || null,
    parserVersion: row.parserVersion || null,
    pageCount: row.pageCount === null || row.pageCount === undefined ? null : Number(row.pageCount),
    errorMessage: row.errorMessage || '',
    parsedAt: row.parsedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

const buildKeywordMeaningStatsByPdfId = (pdfRows = [], keywordRows = []) => {
  const keywordLookupMap = new Map(
    (keywordRows || []).map((row) => [normalizeMaterialKeywordLookup(row.keywordLookup), row])
  );
  const statsByPdfId = new Map();

  for (const row of pdfRows || []) {
    const keywords = parseJsonField(row.keywordsJson, []);
    let totalCount = 0;
    let successCount = 0;

    for (const keyword of Array.isArray(keywords) ? keywords : []) {
      const lookup = normalizeMaterialKeywordLookup(keyword);
      if (!lookup) continue;
      totalCount += 1;
      if (isMaterialKeywordMeaningResolved(keywordLookupMap.get(lookup))) {
        successCount += 1;
      }
    }

    statsByPdfId.set(Number(row.id), {
      keywordMeaningSuccessCount: successCount,
      keywordMeaningTotalCount: totalCount
    });
  }

  return statsByPdfId;
};

const createDefaultAssetStatusMap = () => {
  const map = {};

  MATERIAL_ASSET_TYPES.forEach((assetType) => {
    map[assetType] = {
      type: assetType,
      label: MATERIAL_ASSET_LABELS[assetType],
      status: MATERIAL_ASSET_STATUS.NOT_STARTED,
      outputPath: null,
      outputUrl: null,
      outputMeta: {},
      lastMessage: '',
      generatedAt: null
    };
  });

  return map;
};

const formatMaterialRow = (row, pdfRows = [], assetRows = []) => {
  const pdfs = pdfRows.map(formatPdfRow);
  const assetStatus = createDefaultAssetStatusMap();

  assetRows.forEach((asset) => {
    assetStatus[asset.assetType] = {
      type: asset.assetType,
      label: MATERIAL_ASSET_LABELS[asset.assetType],
      status: asset.status || MATERIAL_ASSET_STATUS.NOT_STARTED,
      outputPath: asset.outputPath || null,
      outputUrl: buildAssetOutputUrl(asset.outputPath),
      outputMeta: safeJsonParse(asset.outputMetaJson, {}),
      lastMessage: asset.lastMessage || '',
      generatedAt: asset.generatedAt || null
    };
  });

  const readyPdfCount = pdfs.filter((pdf) => pdf.parseStatus === PDF_PARSE_STATUS.READY).length;

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    groupId: row.groupId === null || row.groupId === undefined ? null : Number(row.groupId),
    groupName: row.groupName || '',
    sortOrder: Number(row.sortOrder || 0),
    ossPrefix: row.ossPrefix || null,
    parseStatus: row.parseStatus || MATERIAL_PARSE_STATUS.NOT_STARTED,
    storageStatus: row.storageStatus || MATERIAL_STORAGE_STATUS.READY,
    latestError: row.latestError || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pdfCount: pdfs.length,
    readyPdfCount,
    canGenerate: row.storageStatus === MATERIAL_STORAGE_STATUS.READY && readyPdfCount > 0,
    pdfs,
    assetStatus
  };
};

const hydrateMaterials = async (connection, materialRows) => {
  const materialIds = materialRows.map((row) => row.id);
  const pdfRows = await listMaterialPdfsByMaterialIds(connection, materialIds);
  const assetRows = await listMaterialAssetRowsByMaterialIds(connection, materialIds);
  const keywordLookups = [...new Set(
    pdfRows.flatMap((row) => {
      const keywords = parseJsonField(row.keywordsJson, []);
      return (Array.isArray(keywords) ? keywords : [])
        .map((keyword) => normalizeMaterialKeywordLookup(keyword))
        .filter(Boolean);
    })
  )];
  const keywordRows = await listMaterialKeywordRowsByLookups(connection, keywordLookups);
  const keywordStatsByPdfId = buildKeywordMeaningStatsByPdfId(pdfRows, keywordRows);

  const pdfsByMaterialId = new Map();
  pdfRows.forEach((row) => {
    if (!pdfsByMaterialId.has(row.materialId)) {
      pdfsByMaterialId.set(row.materialId, []);
    }
    pdfsByMaterialId.get(row.materialId).push({
      ...row,
      ...(keywordStatsByPdfId.get(Number(row.id)) || {
        keywordMeaningSuccessCount: 0,
        keywordMeaningTotalCount: 0
      })
    });
  });

  const assetsByMaterialId = new Map();
  assetRows.forEach((row) => {
    if (!assetsByMaterialId.has(row.materialId)) {
      assetsByMaterialId.set(row.materialId, []);
    }
    assetsByMaterialId.get(row.materialId).push(row);
  });

  return materialRows.map((row) => {
    return formatMaterialRow(
      row,
      pdfsByMaterialId.get(row.id) || [],
      assetsByMaterialId.get(row.id) || []
    );
  });
};

const updateMaterialDerivedState = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT parse_status AS parseStatus, error_message AS errorMessage
     FROM bt_material_pdfs
     WHERE material_id = ?`,
    [materialId]
  );

  let nextStatus = MATERIAL_PARSE_STATUS.NOT_STARTED;
  let latestError = null;

  if (rows.length) {
    const statuses = rows.map((row) => row.parseStatus);
    const readyCount = statuses.filter((status) => status === PDF_PARSE_STATUS.READY).length;
    const failedCount = statuses.filter((status) => status === PDF_PARSE_STATUS.FAILED).length;
    const processingCount = statuses.filter((status) => status === PDF_PARSE_STATUS.PROCESSING).length;
    const queuedCount = statuses.filter((status) => status === PDF_PARSE_STATUS.QUEUED).length;

    if (readyCount === rows.length) {
      nextStatus = MATERIAL_PARSE_STATUS.READY;
    } else if (failedCount === rows.length) {
      nextStatus = MATERIAL_PARSE_STATUS.FAILED;
    } else if (processingCount > 0) {
      nextStatus = MATERIAL_PARSE_STATUS.PROCESSING;
    } else if (failedCount > 0 && readyCount > 0) {
      nextStatus = MATERIAL_PARSE_STATUS.PARTIAL_FAILED;
    } else if (failedCount > 0 && queuedCount > 0) {
      nextStatus = MATERIAL_PARSE_STATUS.PARTIAL_FAILED;
    } else if (queuedCount > 0) {
      nextStatus = MATERIAL_PARSE_STATUS.QUEUED;
    }

    const failedRow = rows.find((row) => row.errorMessage);
    latestError = failedRow?.errorMessage || null;
  }

  await connection.execute(
    `UPDATE bt_materials
     SET parse_status = ?, latest_error = CASE WHEN storage_status IN (?, ?) THEN latest_error ELSE ? END
     WHERE id = ?`,
    [
      nextStatus,
      MATERIAL_STORAGE_STATUS.MOVING,
      MATERIAL_STORAGE_STATUS.MOVE_FAILED,
      latestError,
      materialId
    ]
  );
};

const isRetryableOssError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || 0);

  if (status === -1) return true;
  if (['ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ECONNABORTED', 'ESOCKETTIMEDOUT'].includes(code)) {
    return true;
  }

  return [
    'socket disconnected before secure tls connection was established',
    'timeout',
    'econnreset',
    'socket hang up',
    'network socket disconnected'
  ].some((fragment) => message.includes(fragment));
};

const uploadLocalFileToOss = async (client, ossConfig, localPath, objectKey, contentType) => {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.put(objectKey, localPath, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          'x-oss-object-acl': 'public-read'
        }
      });

      return buildOssPublicUrl(ossConfig, objectKey);
    } catch (error) {
      lastError = error;
      if (!isRetryableOssError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(attempt * 1000);
    }
  }

  throw lastError || new Error('OSS 上传失败');
};

const uploadBufferToOss = async (client, ossConfig, buffer, objectKey, contentType) => {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.put(objectKey, Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          'x-oss-object-acl': 'public-read'
        }
      });

      return buildOssPublicUrl(ossConfig, objectKey);
    } catch (error) {
      lastError = error;
      if (!isRetryableOssError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(attempt * 1000);
    }
  }

  throw lastError || new Error('OSS 上传失败');
};

const withOssRetry = async (task) => {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!isRetryableOssError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(attempt * 1000);
    }
  }

  throw lastError || new Error('OSS 读取失败');
};

const downloadOssFileToLocal = async (client, objectKey, localPath) => {
  await withOssRetry(() => client.get(objectKey, localPath));
};

const getOssObjectBuffer = async (client, objectKey) => {
  const result = await withOssRetry(() => client.get(objectKey));
  const content = result?.content;

  if (Buffer.isBuffer(content)) {
    return content;
  }

  if (typeof content === 'string') {
    return Buffer.from(content);
  }

  if (content instanceof Uint8Array) {
    return Buffer.from(content);
  }

  if (content?.pipe) {
    const chunks = [];
    await new Promise((resolve, reject) => {
      content.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      content.on('end', resolve);
      content.on('error', reject);
    });
    return Buffer.concat(chunks);
  }

  return Buffer.alloc(0);
};

const getOssObjectText = async (client, objectKey) => {
  const buffer = await getOssObjectBuffer(client, objectKey);
  return buffer.toString('utf-8');
};

const getOssObjectJson = async (client, objectKey) => {
  const rawText = await getOssObjectText(client, objectKey);
  const parsed = safeJsonParse(rawText, null);
  if (!parsed || typeof parsed !== 'object') {
    throw createPermanentError(`OSS JSON 解析失败: ${objectKey}`, 500);
  }

  return parsed;
};

const loadGlobalConfig = async (connection) => {
  try {
    const [rows] = await connection.execute(
      'SELECT config FROM yuekebao_config WHERE id = 1 LIMIT 1'
    );
    return safeJsonParse(rows[0]?.config, {});
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return {};
    }
    throw error;
  }
};

const getMaterialGroupById = async (connection, groupId) => {
  const normalizedGroupId = normalizeNullableId(groupId);
  if (!normalizedGroupId) return null;

  const [rows] = await connection.execute(
    `SELECT id, name, description, sort_order AS sortOrder,
            thumbnail_prompt_template AS thumbnailPromptTemplate,
            thumbnail_video_prompt_template AS thumbnailVideoPromptTemplate,
            thumbnail_annotation_prompt_template AS thumbnailAnnotationPromptTemplate,
            thumbnail_companion_language_prompt_template AS thumbnailCompanionLanguagePromptTemplate,
            thumbnail_companion_textless_prompt_template AS thumbnailCompanionTextlessPromptTemplate,
            thumbnail_companion_background_prompt_template AS thumbnailCompanionBackgroundPromptTemplate,
            created_at AS createdAt, updated_at AS updatedAt
     FROM bt_material_groups
     WHERE id = ?
     LIMIT 1`,
    [normalizedGroupId]
  );

  return rows[0] || null;
};

const getMaterialKeyContentPromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return resolveMaterialKeyContentPromptTemplate(config.material_key_content_prompt_template);
};

const getMaterialKeywordExplainPromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return resolveMaterialKeywordExplainPromptTemplate(config.material_keyword_explain_prompt_template);
};

const getThumbnailCompanionLanguagePromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return normalizeThumbnailCompanionLanguagePromptTemplate(
    config.thumbnail_companion_language_prompt_template || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE
  );
};

const getThumbnailCompanionTextlessPromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return normalizeThumbnailCompanionTextlessPromptTemplate(
    config.thumbnail_companion_textless_prompt_template || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE
  );
};

const getThumbnailCompanionBackgroundPromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return normalizeThumbnailCompanionBackgroundPromptTemplate(
    config.thumbnail_companion_background_prompt_template || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE
  );
};

const getThumbnailAnnotationPromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return normalizeThumbnailAnnotationPromptTemplate(
    config.thumbnail_annotation_prompt_template || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE
  );
};

const getSummaryImagePromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return normalizeSummaryImagePromptTemplate(config.summary_image_prompt_template || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE);
};

const getThumbnailVideoPromptTemplate = async (connection) => {
  const config = await loadGlobalConfig(connection);
  return normalizeThumbnailVideoPromptTemplate(
    config.thumbnail_video_prompt_template || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE
  );
};

const getThumbnailPromptTemplateForGroup = async (connection, groupId) => {
  const [group, config] = await Promise.all([
    getMaterialGroupById(connection, groupId),
    loadGlobalConfig(connection)
  ]);

  return normalizeSummaryImagePromptTemplate(
    group?.thumbnailPromptTemplate
    || config.summary_image_prompt_template
    || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE
  );
};

const getThumbnailAnnotationPromptTemplateForGroup = async (connection, groupId) => {
  const [group, config] = await Promise.all([
    getMaterialGroupById(connection, groupId),
    loadGlobalConfig(connection)
  ]);

  return normalizeThumbnailAnnotationPromptTemplate(
    group?.thumbnailAnnotationPromptTemplate
    || config.thumbnail_annotation_prompt_template
    || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE
  );
};

const getThumbnailVideoPromptTemplateForGroup = async (connection, groupId) => {
  const [group, config] = await Promise.all([
    getMaterialGroupById(connection, groupId),
    loadGlobalConfig(connection)
  ]);

  return normalizeThumbnailVideoPromptTemplate(
    group?.thumbnailVideoPromptTemplate
    || config.thumbnail_video_prompt_template
    || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE
  );
};

const getThumbnailCompanionLanguagePromptTemplateForGroup = async (connection, groupId) => {
  const [group, config] = await Promise.all([
    getMaterialGroupById(connection, groupId),
    loadGlobalConfig(connection)
  ]);

  return normalizeThumbnailCompanionLanguagePromptTemplate(
    group?.thumbnailCompanionLanguagePromptTemplate
    || config.thumbnail_companion_language_prompt_template
    || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE
  );
};

const getThumbnailCompanionTextlessPromptTemplateForGroup = async (connection, groupId) => {
  const [group, config] = await Promise.all([
    getMaterialGroupById(connection, groupId),
    loadGlobalConfig(connection)
  ]);

  return normalizeThumbnailCompanionTextlessPromptTemplate(
    group?.thumbnailCompanionTextlessPromptTemplate
    || config.thumbnail_companion_textless_prompt_template
    || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE
  );
};

const getThumbnailCompanionBackgroundPromptTemplateForGroup = async (connection, groupId) => {
  const [group, config] = await Promise.all([
    getMaterialGroupById(connection, groupId),
    loadGlobalConfig(connection)
  ]);

  return normalizeThumbnailCompanionBackgroundPromptTemplate(
    group?.thumbnailCompanionBackgroundPromptTemplate
    || config.thumbnail_companion_background_prompt_template
    || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE
  );
};

const getMaterialProductionPromptTemplates = async (connection, { groupId = null } = {}) => {
  const config = await loadGlobalConfig(connection);
  const group = await getMaterialGroupById(connection, groupId);
  return {
    thumbnail: normalizeSummaryImagePromptTemplate(
      group?.thumbnailPromptTemplate
      || config.summary_image_prompt_template
      || DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE
    ),
    companionLanguage: normalizeThumbnailCompanionLanguagePromptTemplate(
      group?.thumbnailCompanionLanguagePromptTemplate
      || config.thumbnail_companion_language_prompt_template
      || DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE
    ),
    companionTextless: normalizeThumbnailCompanionTextlessPromptTemplate(
      group?.thumbnailCompanionTextlessPromptTemplate
      || config.thumbnail_companion_textless_prompt_template
      || DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE
    ),
    companionBackground: normalizeThumbnailCompanionBackgroundPromptTemplate(
      group?.thumbnailCompanionBackgroundPromptTemplate
      || config.thumbnail_companion_background_prompt_template
      || DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE
    ),
    annotation: normalizeThumbnailAnnotationPromptTemplate(
      group?.thumbnailAnnotationPromptTemplate
      || config.thumbnail_annotation_prompt_template
      || DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE
    ),
    video: normalizeThumbnailVideoPromptTemplate(
      group?.thumbnailVideoPromptTemplate
      || config.thumbnail_video_prompt_template
      || DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE
    )
  };
};

const buildStructuredContentSourcePages = ({ pagesPayload, contentMarkdown }) => {
  const pages = Array.isArray(pagesPayload?.pages) ? pagesPayload.pages : [];
  const normalizedPages = pages
    .map((page, index) => {
      const explicitPage = page.page_number ?? page.pageNumber ?? page.page ?? page.page_index ?? page.pageIndex;
      const pageNumber = normalizeStructuredPageNumber(
        explicitPage,
        explicitPage === undefined || explicitPage === null ? index + 1 : 0
      );
      const pageContent = normalizeStructuredContentValue(page.content_markdown || page.contentMarkdown || page.markdown || '');

      return {
        page: pageNumber,
        contentMarkdown: pageContent
      };
    })
    .filter((page) => page.page > 0 && page.contentMarkdown);

  if (normalizedPages.length) {
    return normalizedPages;
  }

  const fallbackMarkdown = normalizeStructuredContentValue(String(contentMarkdown || ''));
  if (!fallbackMarkdown) return [];

  return [{
    page: 1,
    contentMarkdown: fallbackMarkdown
  }];
};

const extractMessageText = (messageContent) => {
  if (typeof messageContent === 'string') {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
};

const parseKeywordExplainItems = (items, requestedKeywords = []) => {
  const requestedKeywordMap = new Map(
    (requestedKeywords || [])
      .map((keyword) => {
        const normalizedKeyword = normalizeStructuredContentValue(keyword);
        const lookup = normalizeMaterialKeywordLookup(normalizedKeyword);
        return lookup && normalizedKeyword ? [lookup, normalizedKeyword] : null;
      })
      .filter(Boolean)
  );
  const fallbackKeyword = requestedKeywordMap.size === 1
    ? requestedKeywordMap.values().next().value
    : null;
  const parsedRows = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    const rawKeyword = item?.keyword ?? item?.word ?? item?.term ?? fallbackKeyword ?? '';
    const lookup = normalizeMaterialKeywordLookup(rawKeyword);
    if (!lookup || !requestedKeywordMap.has(lookup) || seen.has(lookup)) {
      continue;
    }

    seen.add(lookup);
    const rawMeaning = item?.meaning;
    const meaningPayload = (
      Array.isArray(rawMeaning)
      || (rawMeaning && typeof rawMeaning === 'object')
      || normalizeStructuredContentValue(rawMeaning)
    )
      ? rawMeaning
      : (
        item?.senses
        ?? item?.meanings
        ?? item?.definitions
        ?? item?.definition
        ?? item?.explanation
        ?? null
      );
    const row = createMaterialKeywordRow({
      keyword: requestedKeywordMap.get(lookup),
      meaning: meaningPayload,
      type: item?.type ?? item?.partOfSpeech ?? null,
      prototype: item?.prototype ?? item?.lemma ?? item?.base ?? item?.baseForm ?? item?.root ?? null,
      relation: item?.relation ?? item?.keywordRelation ?? item?.inflectionRelation ?? item?.formRelation ?? null
    });
    if (row) {
      parsedRows.push(row);
    }
  }

  return parsedRows;
};

const requestDoubaoKeywordExplainItems = async ({ connection, keywords = [] }) => {
  const normalizedKeywords = [...new Set(
    (keywords || [])
      .map((keyword) => normalizeStructuredContentValue(keyword))
      .filter(Boolean)
  )];
  if (!normalizedKeywords.length) {
    return [];
  }

  const { apiKey, apiUrl, model } = resolveDoubaoConfig();
  const timeoutMs = Number.parseInt(process.env.DOUBAO_REQUEST_TIMEOUT_MS || '', 10) || DOUBAO_REQUEST_TIMEOUT_MS;
  const promptTemplate = await getMaterialKeywordExplainPromptTemplate(connection);
  const finalPrompt = buildMaterialKeywordExplainFinalPrompt(promptTemplate, normalizedKeywords);
  const requestBody = {
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: '你是教材词汇解释助手，只能输出严格 JSON 数组。'
      },
      {
        role: 'user',
        content: finalPrompt
      }
    ]
  };

  let response;
  try {
    response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    }, timeoutMs);
  } catch (error) {
    if (isAbortError(error)) {
      throw createPermanentError(`豆包请求超时（${Math.round(timeoutMs / 1000)} 秒）`, 500);
    }
    throw createPermanentError(formatFetchErrorMessage('豆包请求失败', error), 500);
  }

  const rawText = await response.text();
  const result = safeJsonParse(rawText, null);
  if (!response.ok) {
    throw createPermanentError(result?.error?.message || result?.message || rawText || '豆包词汇解释失败', response.status || 500);
  }

  const responseText = extractMessageText(result?.choices?.[0]?.message?.content);
  const parsedItems = extractJsonArray(responseText || rawText);
  if (!parsedItems) {
    throw createPermanentError('豆包返回内容不是合法 JSON 数组', 500);
  }

  return parseKeywordExplainItems(parsedItems, normalizedKeywords);
};

const requestDoubaoKeywordExplainItemsWithRetry = async ({ connection, keywords = [] }) => {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await requestDoubaoKeywordExplainItems({ connection, keywords });
    } catch (error) {
      lastError = error;
      if (attempt >= 2) {
        break;
      }
      console.warn(`豆包关键词解释失败，准备进行第 ${attempt} 次重试:`, error);
    }
  }

  throw lastError;
};

const ensureMaterialKeywordLexiconForPdf = async ({ connection, pdfId = null, keywords = [] }) => {
  const normalizedKeywords = [...new Set(
    (keywords || [])
      .map((keyword) => normalizeStructuredContentValue(keyword))
      .filter(Boolean)
  )];
  if (!normalizedKeywords.length) {
    return;
  }

  const existingRows = await listMaterialKeywordRowsByLookups(connection, normalizedKeywords);
  const existingLookups = new Set(
    existingRows.map((row) => normalizeMaterialKeywordLookup(row.keywordLookup))
  );
  const missingKeywords = normalizedKeywords.filter(
    (keyword) => !existingLookups.has(normalizeMaterialKeywordLookup(keyword))
  );
  if (!missingKeywords.length) {
    return;
  }

  let explainedRows = [];
  try {
    explainedRows = await requestDoubaoKeywordExplainItemsWithRetry({
      connection,
      keywords: missingKeywords
    });
  } catch (error) {
    console.error(`PDF ${pdfId || '-'} 关键词解释失败，将写入空词库记录:`, error);
  }

  const explainedLookups = new Set(explainedRows.map((row) => row.keywordLookup));
  const fallbackRows = missingKeywords
    .filter((keyword) => !explainedLookups.has(normalizeMaterialKeywordLookup(keyword)))
    .map((keyword) => ({ keyword }));

  await insertMaterialKeywordRowsIgnoreExisting(connection, [
    ...explainedRows,
    ...fallbackRows
  ]);
};

const requestDoubaoStructuredContent = async ({ connection, material, pdf, pagesPayload, contentMarkdown }) => {
  const { apiKey, apiUrl, model } = resolveDoubaoConfig();
  const timeoutMs = Number.parseInt(process.env.DOUBAO_REQUEST_TIMEOUT_MS || '', 10) || DOUBAO_REQUEST_TIMEOUT_MS;
  const sourcePages = buildStructuredContentSourcePages({ pagesPayload, contentMarkdown });
  const sourceText = serializePageSourceForPrompt(sourcePages);
  const promptTemplate = await getMaterialKeyContentPromptTemplate(connection);
  const wordsToKnow = extractWordsToKnowFromMarkdown(contentMarkdown);

  if (!sourcePages.length || !sourceText) {
    throw createPermanentError('缺少可用于提炼关键内容的解析文本', 500);
  }

  const requestPrompt = buildMaterialKeyContentFinalPrompt(promptTemplate, {
    materialTitle: material.title,
    pdfName: pdf.displayName || pdf.originalFileName,
    pageSource: sourceText
  });

  const body = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: '你是教材关键内容提炼助手，只能输出严格 JSON。'
      },
      {
        role: 'user',
        content: requestPrompt
      }
    ]
  };

  let response;
  try {
    response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    }, timeoutMs);
  } catch (error) {
    if (isAbortError(error)) {
      throw createRetryableError(`豆包请求超时（${Math.round(timeoutMs / 1000)} 秒）`, 30);
    }
    throw createRetryableError(formatFetchErrorMessage('豆包请求失败', error), 30);
  }

  const rawText = await response.text();
  const result = safeJsonParse(rawText, null);
  if (!response.ok) {
    throw createPermanentError(result?.error?.message || result?.message || rawText || '豆包提炼关键内容失败', response.status || 500);
  }

  const content = extractMessageText(result?.choices?.[0]?.message?.content);
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw createPermanentError('豆包返回内容不是合法 JSON', 500);
  }

  const rootMetadata = extractStructuredContentRootMetadata(parsed);
  const title = deriveStructuredContentTitle({
    parsedTitle: rootMetadata.title,
    sourcePages,
    pdf,
    material
  });

  const candidatePages = Array.isArray(parsed.pages)
    ? parsed.pages
    : (Array.isArray(parsed.data) ? parsed.data : []);
  const normalizedPageMap = new Map();
  candidatePages.forEach((pageEntry, index) => {
    const pageNumber = normalizeStructuredPageNumber(pageEntry?.page, index + 1);
    if (!pageNumber) return;
    normalizedPageMap.set(pageNumber, normalizeSegmentsObject(pageEntry?.seg || pageEntry?.segments || pageEntry));
  });

  const pages = assignWordsToKnowFirstOccurrences({
    wordsToKnow,
    pages: sourcePages.map((page) => {
      const seg = normalizedPageMap.get(page.page) || {};
      return {
        title,
        page: page.page,
        seg,
        words: []
      };
    })
  });

  const hasAnyStructuredContent = pages.some((pageEntry) => (
    Object.keys(pageEntry.seg || {}).length > 0
    || (Array.isArray(pageEntry.words) && pageEntry.words.length > 0)
  ));
  if (!hasAnyStructuredContent) {
    throw createPermanentError('豆包返回的逐页关键内容为空', 500);
  }

  const main = deriveStructuredContentMain({
    parsedMain: rootMetadata.main,
    sourcePages,
    pages
  });
  const wordsCount = deriveStructuredContentWordsCount({
    parsedWordsCount: rootMetadata.wordsCount,
    sourcePages,
    pages,
    main
  });
  const { mainStart, mainEnd } = deriveStructuredContentMainRange({
    parsedMainStart: rootMetadata.mainStart,
    parsedMainEnd: rootMetadata.mainEnd,
    sourcePages,
    pages,
    main
  });

  return {
    title,
    main,
    mainStart,
    mainEnd,
    wordsCount,
    pages,
    model,
    apiUrl,
    promptTemplate,
    finalPrompt: requestPrompt
  };
};

const buildMaterialKeyContentPromptPayload = async (connection, pdfId) => {
  const pdf = await getMaterialPdfById(connection, pdfId);
  if (!pdf) {
    throw createHttpError('PDF 不存在', 404);
  }

  const material = await getMaterialById(connection, pdf.materialId);
  if (!material) {
    throw createHttpError('教材不存在', 404);
  }

  if (pdf.parseStatus !== PDF_PARSE_STATUS.READY || !pdf.parseStorageKey || !pdf.contentStorageKey) {
    throw createHttpError('PDF 解析结果尚未就绪，请先完成解析后再查看关键内容提示词', 400);
  }

  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);
  const pagesStorageKey = deriveSiblingObjectKey(pdf.parseStorageKey, 'pages.json');
  const [pagesPayload, contentMarkdown, promptTemplate] = await Promise.all([
    pagesStorageKey ? getOssObjectJson(ossClient, pagesStorageKey).catch(() => ({ pages: [] })) : Promise.resolve({ pages: [] }),
    getOssObjectText(ossClient, pdf.contentStorageKey),
    getMaterialKeyContentPromptTemplate(connection)
  ]);

  const sourcePages = buildStructuredContentSourcePages({ pagesPayload, contentMarkdown });
  const pageSource = serializePageSourceForPrompt(sourcePages);
  if (!sourcePages.length || !pageSource) {
    throw createHttpError('缺少可用于提炼关键内容的解析文本', 500);
  }

  return {
    material,
    pdf,
    model: resolveDoubaoConfig().model,
    promptTemplate,
    pageSource,
    finalPrompt: buildMaterialKeyContentFinalPrompt(promptTemplate, {
      materialTitle: material.title,
      pdfName: pdf.displayName || pdf.originalFileName,
      pageSource
    })
  };
};

const requestDoubaoThumbnailAnnotations = async ({ imageBuffer, promptText }) => {
  const { apiKey, apiUrl, model } = resolveDoubaoConfig();
  const timeoutMs = Number.parseInt(process.env.DOUBAO_REQUEST_TIMEOUT_MS || '', 10) || DOUBAO_REQUEST_TIMEOUT_MS;
  const imageBase64 = Buffer.from(imageBuffer).toString('base64');
  const body = {
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`
            }
          },
          {
            type: 'text',
            text: promptText
          }
        ]
      }
    ]
  };

  let response;
  try {
    response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    }, timeoutMs);
  } catch (error) {
    if (isAbortError(error)) {
      throw createRetryableError(`豆包标定请求超时（${Math.round(timeoutMs / 1000)} 秒）`, 30);
    }
    throw createRetryableError(formatFetchErrorMessage('豆包标定请求失败', error), 30);
  }

  const rawText = await response.text();
  const result = safeJsonParse(rawText, null);
  if (!response.ok) {
    throw createPermanentError(result?.error?.message || result?.message || rawText || '豆包位置标定失败', response.status || 500);
  }

  const content = extractMessageText(result?.choices?.[0]?.message?.content);
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw createPermanentError('豆包位置标定返回内容不是合法 JSON', 500);
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    items,
    rawResponse: parsed,
    model
  };
};

const buildSummaryBodyFromStructuredPages = (pages) => {
  return pages
    .map((pageEntry) => {
      const segments = Object.entries(pageEntry.seg || {})
        .sort((left, right) => {
          const leftIndex = normalizeStructuredPageNumber(String(left[0]).replace(/[^0-9]/g, ''), 0);
          const rightIndex = normalizeStructuredPageNumber(String(right[0]).replace(/[^0-9]/g, ''), 0);
          return leftIndex - rightIndex;
        })
        .map(([, segmentValue]) => normalizeStructuredContentValue(segmentValue?.[Object.keys(segmentValue || {}).find((key) => /_text$/i.test(key))]))
        .filter(Boolean);
      const words = Array.isArray(pageEntry.words) ? pageEntry.words.filter(Boolean) : [];
      const lines = [];

      if (segments.length) {
        lines.push(`Page ${pageEntry.page}: ${segments.join(' ')}`);
      }
      if (words.length) {
        lines.push(`Words to Know: ${words.join(', ')}`);
      }

      return lines.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
};

const buildSummaryBodyFromEntries = (entries) => {
  return entries.map((entry) => `${entry.title}\n${entry.body}`).join('\n\n');
};

const buildThumbnailPrompt = ({ promptTemplate, language, pageEntry, material }) => {
  const languageLabel = THUMBNAIL_LANGUAGE_LABELS[language] || language;
  const title = normalizeStructuredContentValue(pageEntry?.title);
  const body = normalizeStructuredContentValue(pageEntry?.body)
    || buildProductionPageBody({
      segments: pageEntry?.seg || {}
    });
  const keywords = Array.isArray(pageEntry?.words) ? pageEntry.words : [];
  const materialGroup = normalizeStructuredContentValue(material?.groupName);
  const materialName = normalizeStructuredContentValue(material?.title);

  return [
    `生成“${languageLabel}”的图片。`,
    renderSummaryImagePrompt(promptTemplate, {
      title,
      body,
      materialGroup,
      materialName,
      keywords
    })
  ].join('\n');
};

const buildThumbnailVideoPrompt = ({ promptTemplate, pageEntry, material }) => {
  const title = normalizeStructuredContentValue(pageEntry?.title);
  const body = normalizeStructuredContentValue(pageEntry?.body)
    || buildProductionPageBody({
      segments: pageEntry?.seg || {}
    });
  const keywords = Array.isArray(pageEntry?.words) ? pageEntry.words : [];
  const materialGroup = normalizeStructuredContentValue(material?.groupName);
  const materialName = normalizeStructuredContentValue(material?.title);

  return renderThumbnailVideoPrompt(promptTemplate, {
    title,
    body,
    materialGroup,
    materialName,
    keywords
  });
};

const buildThumbnailCompanionPrompt = ({
  targetLanguage,
  languageTemplate,
  textlessTemplate,
  backgroundTemplate
}) => {
  if (targetLanguage === 'background') {
    return normalizeThumbnailCompanionBackgroundPromptTemplate(backgroundTemplate);
  }

  if (targetLanguage === 'textless') {
    return normalizeThumbnailCompanionTextlessPromptTemplate(textlessTemplate);
  }

  const languageLabel = THUMBNAIL_LANGUAGE_LABELS[targetLanguage] || targetLanguage;
  return renderThumbnailCompanionLanguagePrompt(languageTemplate, languageLabel);
};

const extractWaveSpeedOutputUrl = (payload) => {
  const candidateArrays = [
    payload?.data?.outputs,
    payload?.outputs,
    payload?.data?.images,
    payload?.images,
    payload?.data?.output?.images,
    payload?.output?.images
  ];

  for (const list of candidateArrays) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string' && item) {
        return item;
      }
      const url = item?.url || item?.image_url || item?.imageUrl || item?.output_url || item?.outputUrl;
      if (url) return url;
    }
  }

  const candidateValues = [
    payload?.data?.output_url,
    payload?.data?.image_url,
    payload?.data?.url,
    payload?.output_url,
    payload?.image_url,
    payload?.url
  ];

  return candidateValues.find(Boolean) || null;
};

const loadStructuredContentJsonForPdf = async (ossClient, pdf) => {
  if (!pdf.structuredContentStorageKey) {
    throw createHttpError('该 PDF 还没有关键内容 JSON', 400);
  }

  const payload = await getOssObjectJson(ossClient, pdf.structuredContentStorageKey);
  const title = normalizeStructuredContentValue(payload.title);

  if (!title) {
    throw createPermanentError(`PDF ${pdf.displayName || pdf.originalFileName} 的关键内容 JSON 缺少标题`, 500);
  }

  if (Array.isArray(payload.pages)) {
    const pages = payload.pages
      .map((pageEntry, index) => ({
        title,
        page: normalizeStructuredPageNumber(pageEntry?.page, index + 1),
        seg: normalizeSegmentsObject(pageEntry?.seg || pageEntry?.segments || pageEntry),
        words: Array.isArray(pageEntry?.words) ? pageEntry.words.map((word) => normalizeStructuredContentValue(word)).filter(Boolean) : []
      }))
      .filter((pageEntry) => pageEntry.page > 0);

    const body = buildSummaryBodyFromStructuredPages(pages);
    if (!body) {
      throw createPermanentError(`PDF ${pdf.displayName || pdf.originalFileName} 的关键内容 JSON 缺少可用段落`, 500);
    }

    return { title, body, pages };
  }

  const legacyBody = normalizeStructuredContentValue(payload.body);
  if (!legacyBody) {
    throw createPermanentError(`PDF ${pdf.displayName || pdf.originalFileName} 的关键内容 JSON 不完整`, 500);
  }

  return {
    title,
    body: legacyBody,
    pages: [{
      title,
      page: 1,
      seg: {
        seg1: {
          seg1_pic: '',
          seg1_text: legacyBody
        }
      },
      words: []
    }]
  };
};

const buildSummaryImagePromptPayload = async (connection, material) => {
  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);
  const pdfRows = await listMaterialPdfsByMaterialIds(connection, [material.id]);
  const pdfs = pdfRows.map(formatPdfRow);
  const readyPdfs = pdfs.filter((pdf) => (
    pdf.parseStatus === PDF_PARSE_STATUS.READY &&
    pdf.structuredContentStatus === STRUCTURED_CONTENT_STATUS.READY &&
    pdf.structuredContentStorageKey
  ));

  if (!readyPdfs.length) {
    throw createHttpError('需至少一个 PDF 完成关键内容提炼后才能制作摘要图', 400);
  }

  const entries = [];
  for (const pdf of readyPdfs) {
    const structured = await loadStructuredContentJsonForPdf(ossClient, pdf);
    entries.push({
      pdfId: pdf.id,
      title: structured.title,
      body: structured.body,
      coverUrl: pdf.coverUrl || null
    });
  }

  const summaryTitle = entries.length === 1 ? entries[0].title : material.title;
  const summaryBody = entries.length === 1 ? entries[0].body : buildSummaryBodyFromEntries(entries);
  const promptTemplate = await getThumbnailPromptTemplateForGroup(connection, material.groupId);
  const finalPrompt = renderSummaryImagePrompt(promptTemplate, {
    title: summaryTitle,
    body: summaryBody,
    materialGroup: material.groupName || '',
    materialName: material.title || '',
    keywords: []
  });

  return {
    promptTemplate,
    finalPrompt,
    title: summaryTitle,
    body: summaryBody,
    sourcePdfIds: entries.map((entry) => entry.pdfId),
    referenceImages: entries.map((entry) => entry.coverUrl).filter(Boolean).slice(0, SUMMARY_IMAGE_MAX_REFERENCE_IMAGES)
  };
};

async function generateSummaryImageAsset({ connection, material, projectRoot }) {
  const waveSpeedConfig = resolveWaveSpeedConfig();
  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);
  const summaryPayload = await buildSummaryImagePromptPayload(connection, material);

  if (!summaryPayload.referenceImages.length) {
    throw createHttpError('缺少可用于摘要图生成的 PDF 封面图', 400);
  }

  const requestPayload = {
    prompt: summaryPayload.finalPrompt,
    images: summaryPayload.referenceImages,
    aspect_ratio: '16:9',
    resolution: '1k',
    output_format: 'png',
    enable_sync_mode: true
  };

  console.log('WaveSpeed 摘要图最终提示词:\n' + summaryPayload.finalPrompt);
  console.log('WaveSpeed 摘要图请求参数:\n' + JSON.stringify(requestPayload, null, 2));

  let response;
  try {
    response = await fetch(waveSpeedConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waveSpeedConfig.apiKey}`
      },
      body: JSON.stringify(requestPayload)
    });
  } catch (error) {
    throw createHttpError(formatFetchErrorMessage('WaveSpeed 请求失败', error), 500);
  }

  const rawText = await response.text();
  const result = safeJsonParse(rawText, null);
  if (!response.ok) {
    throw createHttpError(result?.message || result?.error || rawText || 'WaveSpeed 摘要图生成失败', response.status || 500);
  }

  const remoteImageUrl = extractWaveSpeedOutputUrl(result);
  if (!remoteImageUrl) {
    throw createHttpError('WaveSpeed 未返回可用图片地址', 500);
  }

  let imageResponse;
  try {
    imageResponse = await fetch(remoteImageUrl);
  } catch (error) {
    throw createHttpError(formatFetchErrorMessage('下载 WaveSpeed 图片失败', error), 500);
  }
  if (!imageResponse.ok) {
    throw createHttpError(`下载 WaveSpeed 图片失败: ${imageResponse.status}`, 500);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const pngObjectKey = `${material.ossPrefix}/assets/${SUMMARY_IMAGE_OBJECT_NAME}`;
  const jpgObjectKey = `${material.ossPrefix}/assets/${SUMMARY_IMAGE_JPG_OBJECT_NAME}`;
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'material-summary-image-'));

  let pngUrl = null;
  let jpgUrl = null;

  try {
    const pngPath = path.join(tmpDir, SUMMARY_IMAGE_OBJECT_NAME);
    const jpgPath = path.join(tmpDir, SUMMARY_IMAGE_JPG_OBJECT_NAME);
    await fsp.writeFile(pngPath, imageBuffer);
    await compressSummaryImageToJpeg({
      projectRoot,
      inputPath: pngPath,
      outputPath: jpgPath,
      quality: SUMMARY_IMAGE_JPEG_QUALITY
    });

    try {
      pngUrl = await uploadLocalFileToOss(ossClient, ossConfig, pngPath, pngObjectKey, 'image/png');
      jpgUrl = await uploadLocalFileToOss(ossClient, ossConfig, jpgPath, jpgObjectKey, 'image/jpeg');
    } catch (error) {
      await deleteOssObjects(ossClient, [pngObjectKey, jpgObjectKey]);
      throw error;
    }
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }

  return {
    status: MATERIAL_ASSET_STATUS.READY,
    outputPath: jpgObjectKey,
    outputMeta: {
      promptTemplate: summaryPayload.promptTemplate,
      finalPrompt: summaryPayload.finalPrompt,
      requestPayload,
      wavespeedRequestId: result?.data?.id || result?.id || null,
      sourcePdfIds: summaryPayload.sourcePdfIds,
      pngOutputPath: pngObjectKey,
      pngOutputUrl: pngUrl,
      compressedJpgOutputPath: jpgObjectKey,
      compressedJpgOutputUrl: jpgUrl,
      compressedJpgQuality: SUMMARY_IMAGE_JPEG_QUALITY
    },
    lastMessage: '摘要图已生成，并已压缩为 JPG',
    generatedAt: new Date()
  };
}

const downloadRemoteBuffer = async (remoteUrl, label = '文件') => {
  let response;
  try {
    response = await fetchWithTimeout(remoteUrl, {}, ATLAS_VIDEO_REQUEST_TIMEOUT_MS);
  } catch (error) {
    throw createHttpError(formatFetchErrorMessage(`下载${label}失败`, error), 500);
  }

  if (!response.ok) {
    throw createHttpError(`下载${label}失败: ${response.status}`, 500);
  }

  return Buffer.from(await response.arrayBuffer());
};

const downloadRemoteImageBuffer = async (remoteImageUrl, label = '图片') => {
  return downloadRemoteBuffer(remoteImageUrl, label);
};

const parseServerSentEventBlock = (block) => {
  const lines = String(block || '')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''));
  let eventName = '';
  const dataLines = [];

  lines.forEach((line) => {
    if (!line || line.startsWith(':')) return;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      return;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  });

  return {
    eventName,
    dataText: dataLines.join('\n').trim()
  };
};

const extractFirstSsePayload = (rawText) => {
  const normalized = String(rawText || '').replace(/\r\n/g, '\n');
  const firstBlock = normalized.split('\n\n').find((block) => String(block || '').trim());
  if (!firstBlock) return null;
  const { dataText } = parseServerSentEventBlock(firstBlock);
  return dataText ? safeJsonParse(dataText, null) : null;
};

const createVolcengineTtsApiError = (payload, fallbackMessage = 'Volcengine TTS request failed') => {
  const code = Number(payload?.code || payload?.Code || 0);
  const message = String(payload?.message || payload?.Message || fallbackMessage).trim() || fallbackMessage;
  const finalMessage = code ? `${message} (${code})` : message;

  if (code === 40402003 || (code >= 40000000 && code < 50000000)) {
    return createPermanentError(finalMessage, 400);
  }
  return createRetryableError(finalMessage, 30);
};

const VOLCENGINE_TTS_SUCCESS_CODES = new Set([0, 20000000]);
const VOLCENGINE_TTS_AUDIO_CHUNK_EVENTS = new Set(['TTSAudioChunk', '352']);
const VOLCENGINE_TTS_END_EVENTS = new Set(['TTSEnd', 'SessionFinished', '152']);
const VOLCENGINE_TTS_FAILED_EVENTS = new Set(['SessionFailed', '153']);

const getVolcengineTtsPayloadCode = (payload) => {
  const rawCode = payload?.code ?? payload?.Code ?? null;
  if (rawCode === null || rawCode === undefined || rawCode === '') {
    return null;
  }
  const numericCode = Number(rawCode);
  return Number.isFinite(numericCode) ? numericCode : null;
};

const isVolcengineTtsSuccessCode = (code) => {
  if (code === null || code === undefined) {
    return true;
  }
  return VOLCENGINE_TTS_SUCCESS_CODES.has(Number(code));
};

const normalizeVolcengineTtsEventName = (eventName) => String(eventName || '').trim();

const consumeSseResponse = async (response, onEvent) => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw createPermanentError('Volcengine TTS response body is empty', 500);
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n');

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      if (block.trim()) {
        await onEvent(parseServerSentEventBlock(block));
      }
      separatorIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      const finalBlock = buffer.trim();
      if (finalBlock) {
        await onEvent(parseServerSentEventBlock(finalBlock));
      }
      break;
    }
  }
};

const requestVolcengineTtsAudio = async ({ text, voiceType, uid, speedRatio = DEFAULT_MATERIAL_AUDIO_SPEED_RATIO }) => {
  const config = resolveVolcengineTtsConfig();
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw createPermanentError('TTS input text is empty', 400);
  }
  const normalizedSpeedRatio = normalizeMaterialAudioSpeedRatio(speedRatio);

  const requestId = randomUUID();
  const requestPayload = {
    user: {
      uid: String(uid || `bt-material-${requestId}`).slice(0, 64)
    },
    req_params: {
      text: normalizedText,
      speaker: voiceType,
      speed_ratio: normalizedSpeedRatio,
      audio_params: {
        format: config.audioFormat,
        sample_rate: config.sampleRate
      }
    }
  };
  if (config.explicitLanguage) {
    requestPayload.req_params.additions = JSON.stringify({
      explicit_language: config.explicitLanguage
    });
  }

  let response;
  try {
    response = await fetchWithTimeout(config.apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Api-App-Id': config.appId,
        'X-Api-Access-Key': config.accessToken,
        'X-Api-Resource-Id': config.resourceId,
        'X-Api-Request-Id': requestId,
        'X-Api-Sequence': '-1'
      },
      body: JSON.stringify(requestPayload)
    }, config.timeoutMs);
  } catch (error) {
    if (isAbortError(error)) {
      throw createRetryableError(`Volcengine TTS request timed out (${Math.round(config.timeoutMs / 1000)}s)`, 30);
    }
    throw createRetryableError(formatFetchErrorMessage('Volcengine TTS request failed', error), 30);
  }

  if (!response.ok) {
    const rawText = await response.text();
    const payload = safeJsonParse(rawText, null) || extractFirstSsePayload(rawText);
    throw createVolcengineTtsApiError(
      payload,
      rawText || `Volcengine TTS request failed (${response.status})`
    );
  }

  const audioChunks = [];
  const responseEvents = [];
  let endPayload = null;

  await consumeSseResponse(response, async ({ eventName, dataText }) => {
    const normalizedEventName = normalizeVolcengineTtsEventName(eventName);
    if (!normalizedEventName && !dataText) return;
    const payload = dataText ? safeJsonParse(dataText, null) : null;
    const code = getVolcengineTtsPayloadCode(payload);

    if (payload) {
      responseEvents.push({
        eventName: normalizedEventName || eventName,
        code: payload.code ?? null,
        message: payload.message || ''
      });
      if (responseEvents.length > 8) {
        responseEvents.shift();
      }
    }

    if (VOLCENGINE_TTS_AUDIO_CHUNK_EVENTS.has(normalizedEventName)) {
      if (!isVolcengineTtsSuccessCode(code)) {
        throw createVolcengineTtsApiError(payload);
      }
      const base64Audio = String(payload?.data || '').trim();
      if (base64Audio) {
        audioChunks.push(Buffer.from(base64Audio, 'base64'));
      }
      return;
    }

    if (VOLCENGINE_TTS_END_EVENTS.has(normalizedEventName)) {
      if (!isVolcengineTtsSuccessCode(code)) {
        throw createVolcengineTtsApiError(payload);
      }
      endPayload = payload;
      return;
    }

    if (VOLCENGINE_TTS_FAILED_EVENTS.has(normalizedEventName)) {
      throw createVolcengineTtsApiError(payload);
    }

    if (!isVolcengineTtsSuccessCode(code)) {
      throw createVolcengineTtsApiError(payload);
    }
  });

  if (!audioChunks.length) {
    throw createPermanentError('Volcengine TTS returned no audio data', 500);
  }

  return {
    audioBuffer: Buffer.concat(audioChunks),
    requestId,
    requestPayload,
    speedRatio: normalizedSpeedRatio,
    responseEvents,
    endPayload,
    config
  };
};

const extractAtlasTaskId = (payload) => {
  const candidates = [
    payload?.task_id,
    payload?.taskId,
    payload?.data?.task_id,
    payload?.data?.taskId,
    payload?.data?.id,
    payload?.id
  ];
  return candidates.find((item) => typeof item === 'string' && item.trim())
    || candidates.find((item) => Number.isFinite(Number(item)))?.toString()
    || null;
};

const extractAtlasVideoStatus = (payload) => {
  return String(
    payload?.task_status
    || payload?.status
    || payload?.data?.task_status
    || payload?.data?.status
    || ''
  ).trim().toLowerCase();
};

const extractAtlasVideoOutputUrl = (payload) => {
  const candidates = [
    payload?.video_url,
    payload?.url,
    payload?.data?.video_url,
    payload?.data?.url,
    payload?.output?.video_url,
    payload?.output?.url,
    Array.isArray(payload?.outputs) ? payload.outputs[0] : null,
    Array.isArray(payload?.data?.outputs) ? payload.data.outputs[0] : null
  ];

  const hit = candidates.find((item) => typeof item === 'string' && /^https?:\/\//i.test(item));
  return hit || null;
};

const requestAtlasVideoCreate = async ({ prompt, firstFrameImage, lastFrameImage }) => {
  const atlasConfig = resolveAtlasVideoConfig();
  const requestPayload = {
    model_name: atlasConfig.modelName,
    prompt,
    aspect_ratio: ATLAS_VIDEO_ASPECT_RATIO,
    generate_audio: ATLAS_VIDEO_GENERATE_AUDIO,
    first_frame_image: firstFrameImage,
    last_frame_image: lastFrameImage
  };

  let response;
  try {
    response = await fetchWithTimeout(atlasConfig.createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${atlasConfig.apiKey}`
      },
      body: JSON.stringify(requestPayload)
    }, ATLAS_VIDEO_REQUEST_TIMEOUT_MS);
  } catch (error) {
    throw createRetryableError(formatFetchErrorMessage('Atlas 视频创建请求失败', error), 60);
  }

  const rawText = await response.text();
  const result = safeJsonParse(rawText, null);
  if (!response.ok) {
    throw createRetryableError(result?.message || result?.error || rawText || 'Atlas 视频创建失败', 60);
  }

  const remoteTaskId = extractAtlasTaskId(result);
  if (!remoteTaskId) {
    throw createPermanentError('Atlas 未返回可用的视频任务 ID', 500);
  }

  return {
    result,
    requestPayload,
    remoteTaskId
  };
};

const pollAtlasVideoResult = async ({ remoteTaskId }) => {
  const atlasConfig = resolveAtlasVideoConfig();
  const baseUrl = atlasConfig.queryUrl.includes('?')
    ? `${atlasConfig.queryUrl}&task_id=${encodeURIComponent(remoteTaskId)}`
    : `${atlasConfig.queryUrl}?task_id=${encodeURIComponent(remoteTaskId)}`;
  let lastPayload = null;

  for (let attempt = 0; attempt < ATLAS_VIDEO_STATUS_MAX_POLLS; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(baseUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${atlasConfig.apiKey}`
        }
      }, ATLAS_VIDEO_REQUEST_TIMEOUT_MS);
    } catch (error) {
      throw createRetryableError(formatFetchErrorMessage('Atlas 视频任务查询失败', error), 60);
    }

    const rawText = await response.text();
    const result = safeJsonParse(rawText, null);
    if (!response.ok) {
      throw createRetryableError(result?.message || result?.error || rawText || 'Atlas 视频任务查询失败', 60);
    }

    lastPayload = result;
    const normalizedStatus = extractAtlasVideoStatus(result);
    if (['completed', 'success', 'succeeded', 'done'].includes(normalizedStatus)) {
      const remoteVideoUrl = extractAtlasVideoOutputUrl(result);
      if (!remoteVideoUrl) {
        throw createPermanentError('Atlas 未返回可用视频地址', 500);
      }
      return {
        result,
        remoteVideoUrl
      };
    }

    if (['failed', 'error', 'cancelled', 'canceled'].includes(normalizedStatus)) {
      throw createPermanentError(
        result?.message || result?.error || result?.data?.message || 'Atlas 视频生成失败',
        500
      );
    }

    await sleep(ATLAS_VIDEO_STATUS_POLL_INTERVAL_MS);
  }

  throw createRetryableError(
    `Atlas 视频任务等待超时: ${JSON.stringify(lastPayload || { taskId: remoteTaskId })}`,
    120
  );
};

const storeGeneratedImagePairToOss = async ({
  projectRoot,
  ossClient,
  ossConfig,
  pngBuffer,
  pngObjectKey,
  jpgObjectKey
}) => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'material-generated-image-'));
  let pngUrl = null;
  let jpgUrl = null;

  try {
    const pngPath = path.join(tmpDir, path.basename(pngObjectKey));
    const jpgPath = path.join(tmpDir, path.basename(jpgObjectKey));
    await fsp.writeFile(pngPath, pngBuffer);
    await compressSummaryImageToJpeg({
      projectRoot,
      inputPath: pngPath,
      outputPath: jpgPath,
      quality: SUMMARY_IMAGE_JPEG_QUALITY
    });

    try {
      pngUrl = await uploadLocalFileToOss(ossClient, ossConfig, pngPath, pngObjectKey, 'image/png');
      jpgUrl = await uploadLocalFileToOss(ossClient, ossConfig, jpgPath, jpgObjectKey, 'image/jpeg');
    } catch (error) {
      await deleteOssObjects(ossClient, [pngObjectKey, jpgObjectKey]);
      throw error;
    }
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }

  return {
    pngUrl,
    jpgUrl
  };
};

const requestWaveSpeedImage = async ({ prompt, imageUrls = [] }) => {
  const waveSpeedConfig = resolveWaveSpeedConfig();
  const requestPayload = {
    prompt,
    images: imageUrls,
    aspect_ratio: '16:9',
    resolution: '1k',
    output_format: 'png',
    enable_sync_mode: true
  };

  console.log('WaveSpeed 图片最终提示词:\n' + prompt);
  console.log('WaveSpeed 图片请求参数:\n' + JSON.stringify(requestPayload, null, 2));

  let response;
  try {
    response = await fetch(waveSpeedConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${waveSpeedConfig.apiKey}`
      },
      body: JSON.stringify(requestPayload)
    });
  } catch (error) {
    throw createHttpError(formatFetchErrorMessage('WaveSpeed 请求失败', error), 500);
  }

  const rawText = await response.text();
  const result = safeJsonParse(rawText, null);
  if (!response.ok) {
    throw createHttpError(result?.message || result?.error || rawText || 'WaveSpeed 图片生成失败', response.status || 500);
  }

  const remoteImageUrl = extractWaveSpeedOutputUrl(result);
  if (!remoteImageUrl) {
    throw createHttpError('WaveSpeed 未返回可用图片地址', 500);
  }

  const imageBuffer = await downloadRemoteImageBuffer(remoteImageUrl, 'WaveSpeed 图片');

  return {
    result,
    requestPayload,
    remoteImageUrl,
    imageBuffer
  };
};

const handleGenerateThumbnailJob = async ({ job, connection, projectRoot }) => {
  const thumbnail = await getThumbnailById(connection, job.materialThumbnailId);
  if (!thumbnail) {
    return;
  }

  const material = await getMaterialById(connection, thumbnail.materialId);
  if (!material) {
    return;
  }

  const pageEntry = await getMaterialProductionTarget(connection, thumbnail.materialPdfId, thumbnail.page);
  if (!pageEntry) {
    throw createPermanentError('目标关键内容不存在，无法生成缩略图', 400);
  }

  if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
    throw createRetryableError('教材目录迁移中，稍后再试', 20);
  }

  if (!pageEntry.coverUrl) {
    throw createPermanentError('当前页缺少可用封面图，无法生成缩略图', 400);
  }

  await updateThumbnailRecord(connection, thumbnail.id, {
    status: THUMBNAIL_STATUS.PROCESSING,
    last_message: '缩略图生成中'
  });

  const promptText = String(job.payload?.promptText || thumbnail.promptText || '').trim();
  if (!promptText) {
    throw createPermanentError('缩略图提示词为空', 400);
  }

  const { result, requestPayload, remoteImageUrl, imageBuffer } = await requestWaveSpeedImage({
    prompt: promptText,
    imageUrls: [pageEntry.coverUrl]
  });

  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);
  const pngObjectKey = buildThumbnailObjectKey({
    material,
    thumbnailId: thumbnail.id,
    pageRef: pageEntry,
    extension: 'png'
  });
  const jpgObjectKey = buildThumbnailObjectKey({
    material,
    thumbnailId: thumbnail.id,
    pageRef: pageEntry,
    extension: 'jpg'
  });
  const { pngUrl, jpgUrl } = await storeGeneratedImagePairToOss({
    projectRoot,
    ossClient,
    ossConfig,
    pngBuffer: imageBuffer,
    pngObjectKey,
    jpgObjectKey
  });

  await updateThumbnailRecord(connection, thumbnail.id, {
    prompt_text: promptText,
    status: THUMBNAIL_STATUS.READY,
    output_path: jpgObjectKey,
    output_meta_json: JSON.stringify({
      pngOutputPath: pngObjectKey,
      pngOutputUrl: pngUrl,
      compressedJpgOutputPath: jpgObjectKey,
      compressedJpgOutputUrl: jpgUrl,
      compressedJpgQuality: SUMMARY_IMAGE_JPEG_QUALITY,
      requestPayload,
      wavespeedRequestId: result?.data?.id || result?.id || null,
      remoteImageUrl,
      referenceImageUrls: [pageEntry.coverUrl],
      materialPdfId: pageEntry.materialPdfId,
      page: pageEntry.page
    }),
    last_message: '缩略图已生成',
    generated_at: new Date(),
    annotation_status: THUMBNAIL_ANNOTATION_STATUS.NOT_STARTED,
    annotation_error: null,
    annotated_at: null
  });
};

const handleGenerateThumbnailCompanionJob = async ({ job, connection, projectRoot }) => {
  const thumbnail = await getThumbnailById(connection, job.materialThumbnailId);
  if (!thumbnail) {
    return;
  }

  const material = await getMaterialById(connection, thumbnail.materialId);
  if (!material) {
    return;
  }

  const pageEntry = await getMaterialProductionTarget(connection, thumbnail.materialPdfId, thumbnail.page);
  if (!pageEntry) {
    throw createPermanentError('目标关键内容不存在，无法生成配套图', 400);
  }

  if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
    throw createRetryableError('教材目录迁移中，稍后再试', 20);
  }

  const sourceThumbnailId = normalizeNullableId(job.payload?.sourceThumbnailId || thumbnail.derivedFromThumbnailId);
  const sourceThumbnail = sourceThumbnailId ? await getThumbnailById(connection, sourceThumbnailId) : null;
  if (!sourceThumbnail || sourceThumbnail.status !== THUMBNAIL_STATUS.READY) {
    throw createRetryableError('来源缩略图尚未就绪，稍后再试', 20);
  }

  const sourceImageUrl = sourceThumbnail.compressedJpgOutputUrl || sourceThumbnail.outputUrl || sourceThumbnail.pngOutputUrl;
  if (!sourceImageUrl) {
    throw createPermanentError('来源缩略图缺少可用图片地址', 400);
  }

  await updateThumbnailRecord(connection, thumbnail.id, {
    status: THUMBNAIL_STATUS.PROCESSING,
    last_message: '配套图生成中'
  });

  const promptText = String(job.payload?.promptText || thumbnail.promptText || '').trim();
  if (!promptText) {
    throw createPermanentError('配套图提示词为空', 400);
  }

  const { result, requestPayload, remoteImageUrl, imageBuffer } = await requestWaveSpeedImage({
    prompt: promptText,
    imageUrls: [sourceImageUrl]
  });

  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);
  const pngObjectKey = buildThumbnailObjectKey({
    material,
    thumbnailId: thumbnail.id,
    pageRef: pageEntry,
    extension: 'png'
  });
  const jpgObjectKey = buildThumbnailObjectKey({
    material,
    thumbnailId: thumbnail.id,
    pageRef: pageEntry,
    extension: 'jpg'
  });
  const { pngUrl, jpgUrl } = await storeGeneratedImagePairToOss({
    projectRoot,
    ossClient,
    ossConfig,
    pngBuffer: imageBuffer,
    pngObjectKey,
    jpgObjectKey
  });

  await updateThumbnailRecord(connection, thumbnail.id, {
    prompt_text: promptText,
    status: THUMBNAIL_STATUS.READY,
    output_path: jpgObjectKey,
    output_meta_json: JSON.stringify({
      pngOutputPath: pngObjectKey,
      pngOutputUrl: pngUrl,
      compressedJpgOutputPath: jpgObjectKey,
      compressedJpgOutputUrl: jpgUrl,
      compressedJpgQuality: SUMMARY_IMAGE_JPEG_QUALITY,
      requestPayload,
      wavespeedRequestId: result?.data?.id || result?.id || null,
      remoteImageUrl,
      referenceImageUrls: [sourceImageUrl],
      sourceThumbnailId: sourceThumbnail.id,
      materialPdfId: pageEntry.materialPdfId,
      page: pageEntry.page
    }),
    last_message: '配套图已生成',
    generated_at: new Date(),
    annotation_status: THUMBNAIL_ANNOTATION_STATUS.NOT_STARTED,
    annotation_error: null,
    annotated_at: null
  });
};

const handleGenerateThumbnailVideoJob = async ({ job, connection }) => {
  const video = await getThumbnailVideoById(connection, job.materialThumbnailVideoId);
  if (!video) {
    return;
  }

  const material = await getMaterialById(connection, video.materialId);
  if (!material) {
    return;
  }

  const thumbnail = await getThumbnailById(connection, video.thumbnailId);
  if (!thumbnail) {
    throw createPermanentError('视频所属缩略图不存在', 404);
  }

  const sourceThumbnailId = normalizeNullableId(job.payload?.sourceThumbnailId || video.sourceThumbnailId || video.thumbnailId);
  const sourceThumbnail = sourceThumbnailId ? await getThumbnailById(connection, sourceThumbnailId) : null;
  if (!sourceThumbnail || sourceThumbnail.status !== THUMBNAIL_STATUS.READY) {
    throw createRetryableError('视频来源缩略图尚未就绪，稍后再试', 20);
  }

  const pageEntry = await getMaterialProductionTarget(connection, video.materialPdfId, video.page);
  if (!pageEntry) {
    throw createPermanentError('视频目标关键内容不存在，无法生成视频', 400);
  }

  if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
    throw createRetryableError('教材目录迁移中，稍后再试', 20);
  }

  const sourceImageUrl = sourceThumbnail.compressedJpgOutputUrl || sourceThumbnail.outputUrl || sourceThumbnail.pngOutputUrl;
  if (!sourceImageUrl) {
    throw createPermanentError('视频来源缩略图缺少可用图片地址', 400);
  }

  await updateThumbnailVideoRecord(connection, video.id, {
    status: THUMBNAIL_VIDEO_STATUS.PROCESSING,
    error_message: null,
    last_message: '视频生成中'
  });

  const promptText = String(job.payload?.promptText || video.promptText || '').trim();
  if (!promptText) {
    throw createPermanentError('视频提示词为空', 400);
  }

  const { requestPayload, remoteTaskId } = await requestAtlasVideoCreate({
    prompt: promptText,
    firstFrameImage: sourceImageUrl,
    lastFrameImage: sourceImageUrl
  });
  await updateThumbnailVideoRecord(connection, video.id, {
    output_meta_json: JSON.stringify({
      modelName: ATLAS_VIDEO_MODEL,
      requestPayload,
      remoteTaskId,
      sourceImageUrl,
      firstFrameUrl: sourceImageUrl,
      lastFrameUrl: sourceImageUrl
    }),
    last_message: '视频任务已创建，等待生成完成'
  });

  const { result: remoteStatusPayload, remoteVideoUrl } = await pollAtlasVideoResult({ remoteTaskId });
  const videoBuffer = await downloadRemoteBuffer(remoteVideoUrl, 'Atlas 视频');

  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);
  const videoObjectKey = buildThumbnailVideoObjectKey({
    material,
    videoId: video.id,
    pageRef: pageEntry,
    extension: 'mp4'
  });
  await uploadBufferToOss(ossClient, ossConfig, videoBuffer, videoObjectKey, 'video/mp4');

  await updateThumbnailVideoRecord(connection, video.id, {
    prompt_text: promptText,
    status: THUMBNAIL_VIDEO_STATUS.READY,
    output_path: videoObjectKey,
    output_meta_json: JSON.stringify({
      modelName: ATLAS_VIDEO_MODEL,
      requestPayload,
      remoteTaskId,
      remoteStatusPayload,
      sourceImageUrl,
      firstFrameUrl: sourceImageUrl,
      lastFrameUrl: sourceImageUrl
    }),
    last_message: '视频已生成',
    error_message: null,
    generated_at: new Date()
  });
};

const handleGenerateMaterialAudioJob = async ({ job, connection }) => {
  const audio = await getMaterialAudioById(connection, job.materialAudioId);
  if (!audio) {
    return;
  }

  const material = await getMaterialById(connection, audio.materialId);
  if (!material) {
    return;
  }

  if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
    throw createRetryableError('Material assets are still moving, retry later', 20);
  }

  const pageEntry = await getMaterialProductionTarget(connection, audio.materialPdfId, audio.page);
  if (!pageEntry) {
    throw createPermanentError('Audio target content is missing', 400);
  }

  const voiceType = normalizeMaterialAudioVoiceType(job.payload?.voiceType || audio.voiceType);
  const speedRatio = normalizeMaterialAudioSpeedRatio(job.payload?.speedRatio ?? audio.speedRatio);
  const voiceOption = getMaterialAudioVoiceOption(voiceType);
  if (!voiceOption) {
    throw createPermanentError('Selected TTS voice is unavailable', 400);
  }

  const segmentEntry = getMaterialAudioSegmentEntry({
    pageEntry,
    segmentOrder: audio.seg || job.payload?.seg
  });
  const inputText = String(
    job.payload?.inputText
    || audio.inputText
    || (
      segmentEntry
        ? buildMaterialAudioInputText({ body: segmentEntry.text })
        : buildMaterialAudioInputText({
          title: pageEntry.title,
          body: pageEntry.body,
          segments: pageEntry.seg || {}
        })
    )
  ).trim();
  if (!inputText) {
    throw createPermanentError('No title or body text available for audio synthesis', 400);
  }

  await updateMaterialAudioRecord(connection, audio.id, {
    status: MATERIAL_AUDIO_STATUS.PROCESSING,
    speed_ratio: speedRatio,
    last_message: 'Audio generation in progress',
    error_message: null
  });

  const {
    audioBuffer,
    requestId,
    speedRatio: generatedSpeedRatio,
    responseEvents,
    endPayload,
    config
  } = await requestVolcengineTtsAudio({
    text: inputText,
    voiceType: voiceOption.type,
    uid: `bt-material-audio-${audio.id}`,
    speedRatio
  });

  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);
  const objectKey = buildMaterialAudioObjectKey({
    material,
    audioId: audio.id,
    pageRef: pageEntry,
    segmentOrder: audio.seg,
    voiceType: voiceOption.type,
    extension: config.audioFormat || MATERIAL_AUDIO_OBJECT_NAME
  });
  await uploadBufferToOss(ossClient, ossConfig, audioBuffer, objectKey, 'audio/mpeg');

  await updateMaterialAudioRecord(connection, audio.id, {
    voice_type: voiceOption.type,
    voice_label: voiceOption.label,
    speed_ratio: generatedSpeedRatio,
    input_text: inputText,
    status: MATERIAL_AUDIO_STATUS.READY,
    output_path: objectKey,
    output_meta_json: JSON.stringify({
      modelName: VOLCENGINE_TTS_MODEL,
      requestId,
      responseEvents,
      endPayload,
      speaker: voiceOption.type,
      voiceLabel: voiceOption.label,
      speedRatio: generatedSpeedRatio,
      locale: voiceOption.locale,
      resourceId: config.resourceId,
      audioFormat: config.audioFormat,
      sampleRate: config.sampleRate,
      explicitLanguage: config.explicitLanguage || null,
      charCount: inputText.length
    }),
    last_message: 'Audio generated',
    error_message: null,
    generated_at: new Date()
  });
};

const handleAnnotateThumbnailPositionsJob = async ({ job, connection }) => {
  const thumbnail = await getThumbnailById(connection, job.materialThumbnailId);
  if (!thumbnail) {
    return;
  }

  if (!['zh_hans', 'zh_hant', 'en'].includes(thumbnail.language)) {
    throw createPermanentError('当前缩略图语言不支持位置标定', 400);
  }

  const material = await getMaterialById(connection, thumbnail.materialId);
  if (!material) {
    return;
  }

  const pageEntry = await getMaterialProductionTarget(connection, thumbnail.materialPdfId, thumbnail.page);
  if (!pageEntry) {
    throw createPermanentError('目标关键内容不存在，无法标定位置', 400);
  }

  if (thumbnail.status !== THUMBNAIL_STATUS.READY) {
    throw createRetryableError('缩略图尚未生成完成，稍后再试', 20);
  }

  const imageStorageKey = thumbnail.outputMeta?.compressedJpgOutputPath || thumbnail.outputPath || thumbnail.outputMeta?.pngOutputPath;
  if (!imageStorageKey) {
    throw createPermanentError('缩略图缺少可用于标定的图片', 400);
  }

  await updateThumbnailRecord(connection, thumbnail.id, {
    annotation_status: THUMBNAIL_ANNOTATION_STATUS.PROCESSING,
    annotation_error: null
  });

  const promptText = String(job.payload?.promptText || buildThumbnailAnnotationPrompt({
    template: await getThumbnailAnnotationPromptTemplateForGroup(connection, material.groupId),
    title: pageEntry.title,
    segments: pageEntry.seg,
    body: pageEntry.body
  })).trim();
  const ossClient = createOssClient(resolveOssConfig());
  const imageBuffer = await getOssObjectBuffer(ossClient, imageStorageKey);

  const { items: rawItems, rawResponse, model } = await requestDoubaoThumbnailAnnotations({
    imageBuffer,
    promptText
  });
  const useBody = shouldUseBodyForAnnotationTemplate(promptText);
  const payloadExpectedItems = normalizeExpectedAnnotationEntries(job.payload?.expectedItems);
  const expectedItems = payloadExpectedItems.length
    ? payloadExpectedItems
    : buildExpectedAnnotationEntries({
      title: pageEntry.title,
      segments: pageEntry.seg,
      body: pageEntry.body,
      useBody
    });
  const normalizedItems = normalizeAnnotationItems({
    rawItems,
    expectedItems
  });

  await connection.beginTransaction();
  try {
    await replaceThumbnailAnnotations(connection, {
      thumbnailId: thumbnail.id,
      materialId: thumbnail.materialId,
      materialPdfId: thumbnail.materialPdfId,
      page: thumbnail.page,
      modelName: model,
      promptText,
      rawResponse,
      items: normalizedItems
    });
    await updateThumbnailRecord(connection, thumbnail.id, {
      annotation_status: THUMBNAIL_ANNOTATION_STATUS.READY,
      annotation_error: null,
      annotated_at: new Date()
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

const listAllOssObjects = async (client, prefix) => {
  const objects = [];
  let continuationToken;

  do {
    const result = await client.listV2({
      prefix,
      'max-keys': 1000,
      'continuation-token': continuationToken
    });

    const currentObjects = result.objects || [];
    currentObjects.forEach((object) => {
      if (object?.name) {
        objects.push(object.name);
      }
    });

    continuationToken = result.nextContinuationToken;
  } while (continuationToken);

  return objects;
};

const deleteOssObjects = async (client, objectKeys = []) => {
  for (const objectKey of objectKeys) {
    try {
      await client.delete(objectKey);
    } catch (error) {
      if (error?.code === 'NoSuchKey') continue;
      throw error;
    }
  }
};

const moveOssPrefix = async (client, oldPrefix, newPrefix) => {
  if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) return [];

  const objectKeys = await listAllOssObjects(client, oldPrefix);
  for (const objectKey of objectKeys) {
    const nextKey = `${newPrefix}${objectKey.slice(oldPrefix.length)}`;
    await client.copy(nextKey, objectKey, {
      headers: {
        'x-oss-object-acl': 'public-read'
      }
    });
  }

  await deleteOssObjects(client, objectKeys);
  return objectKeys;
};

const resolveLegacyLocalAbsolutePath = (projectRoot, legacyLocalPath) => {
  if (!legacyLocalPath) return null;

  const normalized = String(legacyLocalPath).replace(/^\/+/, '');
  return path.resolve(projectRoot, normalized);
};

const getMaterialLibraryUploadDir = (projectRoot) => {
  return path.resolve(projectRoot, 'uploads', 'materials', 'tmp');
};

const getMaterialParserScriptPath = (projectRoot) => {
  return path.resolve(projectRoot, 'src', 'python', 'material_parser.py');
};

const getImageCompressScriptPath = (projectRoot) => {
  return path.resolve(projectRoot, 'src', 'python', 'image_compress.py');
};

const getPythonCommandCandidates = () => {
  const explicitPythonBin = String(process.env.BT_PYTHON_BIN || '').trim();
  const candidates = [];

  if (explicitPythonBin) {
    candidates.push({
      command: explicitPythonBin,
      prefixArgs: [],
      label: explicitPythonBin
    });
  }

  if (process.platform === 'win32') {
    candidates.push(
      { command: 'python', prefixArgs: [], label: 'python' },
      { command: 'python3', prefixArgs: [], label: 'python3' },
      { command: 'py', prefixArgs: ['-3'], label: 'py -3' }
    );
  } else {
    candidates.push(
      { command: 'python3', prefixArgs: [], label: 'python3' },
      { command: 'python', prefixArgs: [], label: 'python' }
    );
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.command}::${candidate.prefixArgs.join(' ')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const getWindowsStorePythonAliasHint = async (command) => {
  if (process.platform !== 'win32' || !command || path.isAbsolute(command)) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync('where.exe', [command], {
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    const commandPath = String(stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (!commandPath) return null;

    const stats = await fsp.stat(commandPath);
    if (commandPath.includes(`${path.sep}WindowsApps${path.sep}`) && stats.size === 0) {
      return `${command} 当前只命中了 Windows Store 应用别名 ${commandPath}`;
    }
  } catch (_) {
    // Ignore lookup failures and fall back to the original error message.
  }

  return null;
};

let cachedPythonRuntime = null;

const resolvePythonRuntime = async () => {
  if (cachedPythonRuntime) {
    return cachedPythonRuntime;
  }

  const failures = [];
  for (const candidate of getPythonCommandCandidates()) {
    try {
      const { stdout, stderr } = await execFileAsync(
        candidate.command,
        [...candidate.prefixArgs, '--version'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env
          },
          windowsHide: true,
          maxBuffer: 1024 * 1024
        }
      );

      const versionBanner = String(stdout || stderr || '').trim() || candidate.label;
      cachedPythonRuntime = {
        ...candidate,
        versionBanner
      };
      return cachedPythonRuntime;
    } catch (error) {
      const aliasHint = await getWindowsStorePythonAliasHint(candidate.command);
      failures.push(aliasHint || `${candidate.label}: ${String(error?.message || error).trim()}`);
    }
  }

  const guidance = process.platform === 'win32'
    ? '未检测到可用的 Python 3 解释器。请先安装 Python 3，并优先在环境变量或 .env.local 中配置 BT_PYTHON_BIN=<真实 python.exe 路径>。'
    : '未检测到可用的 Python 3 解释器。请安装 Python 3 或在环境变量中配置 BT_PYTHON_BIN。';
  const detail = failures.filter(Boolean).join(' | ');
  throw new Error(detail ? `${guidance} 详情: ${detail}` : guidance);
};

const runMaterialParser = async ({ projectRoot, inputPdfPath, outputDir }) => {
  const scriptPath = getMaterialParserScriptPath(projectRoot);
  try {
    const pythonRuntime = await resolvePythonRuntime();
    const { stdout } = await execFileAsync(
      pythonRuntime.command,
      [...pythonRuntime.prefixArgs, scriptPath, '--input', inputPdfPath, '--output-dir', outputDir],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          TORCH_DEVICE: 'cpu'
        },
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      }
    );

    return safeJsonParse(stdout, {});
  } catch (error) {
    const stdoutMessage = String(error?.stdout || '').trim();
    const stderrMessage = String(error?.stderr || '').trim();
    const message = stdoutMessage || stderrMessage || error.message || 'PDF 解析子进程执行失败';
    throw new Error(message);
  }
};

const compressSummaryImageToJpeg = async ({ projectRoot, inputPath, outputPath, quality = SUMMARY_IMAGE_JPEG_QUALITY }) => {
  const scriptPath = getImageCompressScriptPath(projectRoot);
  try {
    const pythonRuntime = await resolvePythonRuntime();
    await execFileAsync(
      pythonRuntime.command,
      [...pythonRuntime.prefixArgs, scriptPath, '--input', inputPath, '--output', outputPath, '--quality', String(quality)],
      {
        cwd: projectRoot,
        env: {
          ...process.env
        },
        windowsHide: true,
        maxBuffer: 5 * 1024 * 1024
      }
    );
  } catch (error) {
    const stdoutMessage = String(error?.stdout || '').trim();
    const stderrMessage = String(error?.stderr || '').trim();
    const message = stdoutMessage || stderrMessage || error.message || '摘要图 JPG 压缩失败';
    throw new Error(message);
  }
};

const claimNextQueuedJob = async (connection, workerId) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [rows] = await connection.execute(
      `SELECT id, job_type AS jobType, status, material_id AS materialId, material_pdf_id AS materialPdfId,
              material_thumbnail_id AS materialThumbnailId,
              material_thumbnail_video_id AS materialThumbnailVideoId,
              material_audio_id AS materialAudioId,
              payload_json AS payloadJson, attempts, max_attempts AS maxAttempts
       FROM bt_material_jobs
       WHERE status = ? AND next_run_at <= NOW()
       ORDER BY id ASC
       LIMIT 1`,
      [JOB_STATUS.QUEUED]
    );

    if (!rows.length) {
      return null;
    }

    const job = rows[0];
    const [result] = await connection.execute(
      `UPDATE bt_material_jobs
       SET status = ?, attempts = attempts + 1, worker_id = ?, locked_at = NOW(), started_at = NOW(), finished_at = NULL
       WHERE id = ? AND status = ?`,
      [JOB_STATUS.RUNNING, workerId, job.id, JOB_STATUS.QUEUED]
    );

    if (Number(result.affectedRows || 0) === 0) {
      continue;
    }

    return {
      ...job,
      attempts: Number(job.attempts || 0) + 1,
      maxAttempts: Number(job.maxAttempts || DEFAULT_JOB_MAX_ATTEMPTS),
      payload: safeJsonParse(job.payloadJson, {})
    };
  }

  return null;
};

const completeJob = async (connection, jobId) => {
  await connection.execute(
    `UPDATE bt_material_jobs
     SET status = ?, worker_id = NULL, locked_at = NULL, finished_at = NOW(), error_message = NULL
     WHERE id = ?`,
    [JOB_STATUS.COMPLETED, jobId]
  );
};

const closeConnectionQuietly = async (connection) => {
  if (!connection) return;

  try {
    await connection.end();
  } catch (_) {
    // Ignore close failures when recovering from a broken connection.
  }
};

const withHealthyJobConnection = async ({ connection, getDbConnection, task }) => {
  let activeConnection = connection;
  let borrowedConnection = false;

  if (activeConnection) {
    try {
      await activeConnection.ping();
    } catch (_) {
      await closeConnectionQuietly(activeConnection);
      activeConnection = null;
    }
  }

  if (!activeConnection) {
    activeConnection = await getDbConnection();
    borrowedConnection = true;
  }

  try {
    return await task(activeConnection);
  } finally {
    if (borrowedConnection) {
      await closeConnectionQuietly(activeConnection);
    }
  }
};

const failOrRetryJob = async (connection, job, error) => {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.maxAttempts || DEFAULT_JOB_MAX_ATTEMPTS);
  const shouldRetry = !error?.noRetry && attempts < maxAttempts;
  const retryDelaySeconds = Number(error.retryDelaySeconds || 30 * attempts || 30);

  if (job.jobType === JOB_TYPES.ANNOTATE_THUMBNAIL_POSITIONS && job.materialThumbnailId) {
    await updateThumbnailRecord(connection, job.materialThumbnailId, {
      annotation_status: shouldRetry ? THUMBNAIL_ANNOTATION_STATUS.QUEUED : THUMBNAIL_ANNOTATION_STATUS.FAILED,
      annotation_error: shouldRetry ? null : (error.message || '位置标定失败'),
      annotated_at: null
    });
  }

  if ([JOB_TYPES.GENERATE_THUMBNAIL, JOB_TYPES.GENERATE_THUMBNAIL_COMPANION].includes(job.jobType) && job.materialThumbnailId) {
    await updateThumbnailRecord(connection, job.materialThumbnailId, {
      status: shouldRetry ? THUMBNAIL_STATUS.QUEUED : THUMBNAIL_STATUS.FAILED,
      last_message: shouldRetry ? '生成失败，稍后自动重试' : (error.message || '缩略图生成失败')
    });
  }

  if (job.jobType === JOB_TYPES.GENERATE_THUMBNAIL_VIDEO && job.materialThumbnailVideoId) {
    await updateThumbnailVideoRecord(connection, job.materialThumbnailVideoId, {
      status: shouldRetry ? THUMBNAIL_VIDEO_STATUS.QUEUED : THUMBNAIL_VIDEO_STATUS.FAILED,
      last_message: shouldRetry ? '视频生成失败，稍后自动重试' : (error.message || '视频生成失败'),
      error_message: shouldRetry ? null : (error.message || '视频生成失败')
    });
  }

  if (job.jobType === JOB_TYPES.GENERATE_AUDIO && job.materialAudioId) {
    await updateMaterialAudioRecord(connection, job.materialAudioId, {
      status: shouldRetry ? MATERIAL_AUDIO_STATUS.QUEUED : MATERIAL_AUDIO_STATUS.FAILED,
      last_message: shouldRetry ? 'Audio generation failed, retrying later' : (error.message || 'Audio generation failed'),
      error_message: shouldRetry ? null : (error.message || 'Audio generation failed')
    });
  }

  if (shouldRetry) {
    await connection.execute(
      `UPDATE bt_material_jobs
       SET status = ?, worker_id = NULL, locked_at = NULL, finished_at = NULL,
           error_message = ?, next_run_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
       WHERE id = ?`,
      [JOB_STATUS.QUEUED, error.message || '任务失败', retryDelaySeconds, job.id]
    );
    return;
  }

  await connection.execute(
    `UPDATE bt_material_jobs
     SET status = ?, worker_id = NULL, locked_at = NULL, finished_at = NOW(), error_message = ?
     WHERE id = ?`,
    [JOB_STATUS.FAILED, error.message || '任务失败', job.id]
  );
};

const resetStaleRunningJobs = async (getDbConnection) => {
  let connection;

  try {
    connection = await getDbConnection();
    await connection.execute(
      `UPDATE bt_material_jobs
       SET status = ?, worker_id = NULL, locked_at = NULL, started_at = NULL, finished_at = NULL,
           next_run_at = NOW(), error_message = ?
       WHERE status = ?`,
      [JOB_STATUS.QUEUED, JOB_STALE_RESET_MESSAGE, JOB_STATUS.RUNNING]
    );
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

const updateMaterialPdfResult = async (connection, pdfId, updates) => {
  const columns = [];
  const params = [];

  Object.entries(updates).forEach(([key, value]) => {
    columns.push(`${key} = ?`);
    params.push(value);
  });

  if (!columns.length) return;

  params.push(pdfId);
  await connection.execute(
    `UPDATE bt_material_pdfs SET ${columns.join(', ')} WHERE id = ?`,
    params
  );
};

const handleParsePdfJob = async ({ job, connection, getDbConnection, projectRoot }) => {
  const pdf = await getMaterialPdfById(connection, job.materialPdfId);
  if (!pdf) {
    return;
  }

  const material = await getMaterialById(connection, pdf.materialId);
  if (!material) {
    return;
  }

  if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
    throw createRetryableError('教材目录迁移中，稍后再试', 20);
  }

  await updateMaterialPdfResult(connection, pdf.id, {
    parse_status: PDF_PARSE_STATUS.PROCESSING,
    error_message: null,
    structured_content_storage_key: null,
    keywords_json: null,
    main: null,
    title: null,
    words_count: null,
    main_start: null,
    main_end: null,
    structured_content_status: STRUCTURED_CONTENT_STATUS.NOT_STARTED,
    structured_content_error: null
  });
  await clearMaterialPdfPageContents(connection, pdf.id);
  await updateMaterialDerivedState(connection, material.id);

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'material-parse-'));
  const inputPdfPath = path.join(tmpDir, 'input.pdf');
  const parserOutputDir = path.join(tmpDir, 'output');
  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);

  try {
    await ensureDirectory(parserOutputDir);

    if (pdf.sourceStorageKey) {
      await downloadOssFileToLocal(ossClient, pdf.sourceStorageKey, inputPdfPath);
    } else if (pdf.legacyLocalPath) {
      const legacyAbsolutePath = resolveLegacyLocalAbsolutePath(projectRoot, pdf.legacyLocalPath);
      if (!legacyAbsolutePath) {
        throw createHttpError('历史 PDF 路径无效', 500);
      }

      await fsp.copyFile(legacyAbsolutePath, inputPdfPath);

      const sourceStorageKey = buildMaterialPdfSourceKey(material.ossPrefix, pdf.storageSequence, pdf.originalFileName);
      const sourceUrl = await uploadLocalFileToOss(
        ossClient,
        ossConfig,
        inputPdfPath,
        sourceStorageKey,
        getContentTypeForFile(pdf.originalFileName, pdf.sourceMimeType || 'application/pdf')
      );

      await withHealthyJobConnection({
        connection,
        getDbConnection,
        task: async (activeConnection) => {
          await updateMaterialPdfResult(activeConnection, pdf.id, {
            source_storage_key: sourceStorageKey,
            source_url: sourceUrl,
            legacy_local_path: null,
            upload_status: PDF_UPLOAD_STATUS.UPLOADED
          });
        }
      });
    } else {
      throw createHttpError('找不到 PDF 原始文件', 500);
    }

    const parseResult = await runMaterialParser({
      projectRoot,
      inputPdfPath,
      outputDir: parserOutputDir
    });

    if (!parseResult.success) {
      throw new Error(parseResult.error || 'Marker 解析失败');
    }

    const coverPath = parseResult.cover_path || parseResult.coverPath;
    const contentPath = parseResult.content_path || parseResult.contentPath;
    const pagesIndexPath = parseResult.pages_index_path || parseResult.pagesIndexPath || null;
    const parseJsonPath = parseResult.parse_json_path || parseResult.parseJsonPath;
    const parserName = parseResult.parser_name || parseResult.parserName || PARSER_NAME;
    const parserVersion = parseResult.parser_version || parseResult.parserVersion || null;
    const pageCount = parseResult.page_count || parseResult.pageCount || null;

    if (!coverPath || !contentPath || !parseJsonPath) {
      throw new Error('解析输出不完整，缺少封面、正文或 parse.json');
    }

    const coverStorageKey = buildMaterialPdfParsedFileKey(
      material.ossPrefix,
      pdf.storageSequence,
      pdf.displayName,
      pdf.originalFileName,
      'cover.png'
    );
    const contentStorageKey = buildMaterialPdfParsedFileKey(
      material.ossPrefix,
      pdf.storageSequence,
      pdf.displayName,
      pdf.originalFileName,
      'content.md'
    );
    const parseStorageKey = buildMaterialPdfParsedFileKey(
      material.ossPrefix,
      pdf.storageSequence,
      pdf.displayName,
      pdf.originalFileName,
      'parse.json'
    );
    const pagesIndexStorageKey = buildMaterialPdfParsedFileKey(
      material.ossPrefix,
      pdf.storageSequence,
      pdf.displayName,
      pdf.originalFileName,
      'pages.json'
    );

    const coverUrl = await uploadLocalFileToOss(ossClient, ossConfig, coverPath, coverStorageKey, 'image/png');
    const contentUrl = await uploadLocalFileToOss(ossClient, ossConfig, contentPath, contentStorageKey, 'text/markdown; charset=utf-8');
    if (pagesIndexPath) {
      await uploadLocalFileToOss(ossClient, ossConfig, pagesIndexPath, pagesIndexStorageKey, 'application/json; charset=utf-8');
    }
    const parseUrl = await uploadLocalFileToOss(ossClient, ossConfig, parseJsonPath, parseStorageKey, 'application/json; charset=utf-8');

    await withHealthyJobConnection({
      connection,
      getDbConnection,
      task: async (activeConnection) => {
        await updateMaterialPdfResult(activeConnection, pdf.id, {
          cover_storage_key: coverStorageKey,
          cover_url: coverUrl,
          content_storage_key: contentStorageKey,
          content_url: contentUrl,
          parse_storage_key: parseStorageKey,
          parse_url: parseUrl,
          parser_name: parserName,
          parser_version: parserVersion,
          page_count: pageCount,
          main: null,
          title: null,
          words_count: null,
          main_start: null,
          main_end: null,
          parse_status: PDF_PARSE_STATUS.READY,
          keywords_json: null,
          structured_content_status: STRUCTURED_CONTENT_STATUS.QUEUED,
          structured_content_error: null,
          error_message: null,
          parsed_at: new Date()
        });

        await updateMaterialDerivedState(activeConnection, material.id);
      }
    });
  } catch (error) {
    await withHealthyJobConnection({
      connection,
      getDbConnection,
      task: async (activeConnection) => {
        await updateMaterialPdfResult(activeConnection, pdf.id, {
          parse_status: PDF_PARSE_STATUS.FAILED,
          error_message: error.message || '解析失败'
        });
        await updateMaterialDerivedState(activeConnection, material.id);
      }
    });
    throw error;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }

  try {
    await withHealthyJobConnection({
      connection,
      getDbConnection,
      task: async (activeConnection) => {
        await removeNonRunningJobsForPdfByType(activeConnection, pdf.id, JOB_TYPES.EXTRACT_STRUCTURED_CONTENT);
        if (!(await hasPendingStructuredContentJob(activeConnection, pdf.id))) {
          await enqueueJob(activeConnection, {
            jobType: JOB_TYPES.EXTRACT_STRUCTURED_CONTENT,
            materialId: material.id,
            materialPdfId: pdf.id,
            payload: { source: job.jobType }
          });
        }
      }
    });

  } catch (error) {
    await withHealthyJobConnection({
      connection,
      getDbConnection,
      task: async (activeConnection) => {
        await updateMaterialPdfResult(activeConnection, pdf.id, {
          structured_content_status: STRUCTURED_CONTENT_STATUS.FAILED,
          structured_content_error: error.message || '关键内容提炼任务创建失败'
        });
      }
    });
    console.error('关键内容提炼任务创建失败:', error);
  }
};

const handleExtractStructuredContentJob = async ({ job, connection, getDbConnection }) => {
  const pdf = await getMaterialPdfById(connection, job.materialPdfId);
  if (!pdf) {
    return;
  }

  const material = await getMaterialById(connection, pdf.materialId);
  if (!material) {
    return;
  }

  if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
    throw createRetryableError('教材目录迁移中，稍后再试', 20);
  }

  if (pdf.parseStatus !== PDF_PARSE_STATUS.READY || !pdf.parseStorageKey || !pdf.contentStorageKey) {
    throw createRetryableError('PDF 解析结果尚未就绪，稍后再试', 20);
  }

  await updateMaterialPdfResult(connection, pdf.id, {
    structured_content_status: STRUCTURED_CONTENT_STATUS.PROCESSING,
    structured_content_error: null
  });

  try {
    const ossConfig = resolveOssConfig();
    const ossClient = createOssClient(ossConfig);
    const pagesStorageKey = deriveSiblingObjectKey(pdf.parseStorageKey, 'pages.json');
    const [pagesPayload, contentMarkdown] = await Promise.all([
      pagesStorageKey ? getOssObjectJson(ossClient, pagesStorageKey).catch(() => ({ pages: [] })) : Promise.resolve({ pages: [] }),
      getOssObjectText(ossClient, pdf.contentStorageKey)
    ]);

    const structured = await requestDoubaoStructuredContent({
      connection,
      material,
      pdf,
      pagesPayload,
      contentMarkdown
    });
    const pdfKeywords = collectPdfKeywordsFromPages(structured.pages);
    const sqlPages = structured.pages.map((pageEntry) => ({
      ...pageEntry,
      words: []
    }));

    const structuredContentStorageKey = buildMaterialPdfParsedFileKey(
      material.ossPrefix,
      pdf.storageSequence,
      pdf.displayName,
      pdf.originalFileName,
      STRUCTURED_CONTENT_OBJECT_NAME
    );

    await uploadBufferToOss(
      ossClient,
      ossConfig,
      Buffer.from(JSON.stringify({
        title: structured.title,
        main: structured.main,
        main_start: structured.mainStart,
        main_end: structured.mainEnd,
        words_count: structured.wordsCount,
        materialId: material.id,
        materialPdfId: pdf.id,
        model: structured.model,
        keywords: pdfKeywords,
        pages: structured.pages
      }, null, 2), 'utf-8'),
      structuredContentStorageKey,
      'application/json; charset=utf-8'
    );

    await withHealthyJobConnection({
      connection,
      getDbConnection,
      task: async (activeConnection) => {
        await activeConnection.beginTransaction();
        try {
          await replaceMaterialPdfPageContents(activeConnection, {
            materialId: material.id,
            materialPdfId: pdf.id,
            title: structured.title,
            pages: sqlPages
          });
          await syncMaterialPdfPageWords(activeConnection, {
            materialPdfId: pdf.id,
            pages: structured.pages
          });
          await updateMaterialPdfResult(activeConnection, pdf.id, {
            structured_content_storage_key: structuredContentStorageKey,
            keywords_json: JSON.stringify(pdfKeywords),
            main: structured.main === null || structured.main === undefined ? null : (structured.main ? 1 : 0),
            title: structured.title,
            words_count: structured.wordsCount,
            main_start: structured.mainStart,
            main_end: structured.mainEnd,
            structured_content_status: STRUCTURED_CONTENT_STATUS.READY,
            structured_content_error: null
          });
          await activeConnection.commit();
        } catch (transactionError) {
          try {
            await activeConnection.rollback();
          } catch (_rollbackError) {
            // ignore rollback failures
          }
          throw transactionError;
        }
      }
    });

    try {
      await withHealthyJobConnection({
        connection,
        getDbConnection,
        task: async (activeConnection) => {
          await ensureMaterialKeywordLexiconForPdf({
            connection: activeConnection,
            pdfId: pdf.id,
            keywords: pdfKeywords
          });
        }
      });
    } catch (keywordError) {
      console.error(`PDF ${pdf.id} 关键词词库同步失败:`, keywordError);
    }
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_rollbackError) {
        // ignore rollback failures
      }
    }
    await withHealthyJobConnection({
      connection,
      getDbConnection,
      task: async (activeConnection) => {
        await updateMaterialPdfResult(activeConnection, pdf.id, {
          structured_content_status: STRUCTURED_CONTENT_STATUS.FAILED,
          structured_content_error: error.message || '关键内容提炼失败'
        });
      }
    });
    throw error;
  }
};

const handleMoveMaterialPrefixJob = async ({ job, connection }) => {
  const material = await getMaterialById(connection, job.materialId);
  if (!material) {
    return;
  }

  const { oldPrefix, newPrefix } = job.payload || {};
  if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) {
    await connection.execute(
      `UPDATE bt_materials
       SET storage_status = ?, latest_error = NULL
       WHERE id = ?`,
      [MATERIAL_STORAGE_STATUS.READY, material.id]
    );
    return;
  }

  const ossConfig = resolveOssConfig();
  const ossClient = createOssClient(ossConfig);

  try {
    await moveOssPrefix(ossClient, oldPrefix, newPrefix);

    const [pdfRows] = await connection.execute(
      `SELECT id, source_storage_key AS sourceStorageKey, cover_storage_key AS coverStorageKey,
              content_storage_key AS contentStorageKey, parse_storage_key AS parseStorageKey,
              structured_content_storage_key AS structuredContentStorageKey
       FROM bt_material_pdfs
       WHERE material_id = ?`,
      [material.id]
    );

    for (const pdf of pdfRows) {
      const nextSourceKey = pdf.sourceStorageKey?.startsWith(oldPrefix)
        ? `${newPrefix}${pdf.sourceStorageKey.slice(oldPrefix.length)}`
        : pdf.sourceStorageKey;
      const nextCoverKey = pdf.coverStorageKey?.startsWith(oldPrefix)
        ? `${newPrefix}${pdf.coverStorageKey.slice(oldPrefix.length)}`
        : pdf.coverStorageKey;
      const nextContentKey = pdf.contentStorageKey?.startsWith(oldPrefix)
        ? `${newPrefix}${pdf.contentStorageKey.slice(oldPrefix.length)}`
        : pdf.contentStorageKey;
      const nextParseKey = pdf.parseStorageKey?.startsWith(oldPrefix)
        ? `${newPrefix}${pdf.parseStorageKey.slice(oldPrefix.length)}`
        : pdf.parseStorageKey;
      const nextStructuredContentKey = pdf.structuredContentStorageKey?.startsWith(oldPrefix)
        ? `${newPrefix}${pdf.structuredContentStorageKey.slice(oldPrefix.length)}`
        : pdf.structuredContentStorageKey;

      await connection.execute(
        `UPDATE bt_material_pdfs
         SET source_storage_key = ?, source_url = ?,
             cover_storage_key = ?, cover_url = ?,
             content_storage_key = ?, content_url = ?,
             parse_storage_key = ?, parse_url = ?,
             structured_content_storage_key = ?
         WHERE id = ?`,
        [
          nextSourceKey,
          nextSourceKey ? buildOssPublicUrl(ossConfig, nextSourceKey) : null,
          nextCoverKey,
          nextCoverKey ? buildOssPublicUrl(ossConfig, nextCoverKey) : null,
          nextContentKey,
          nextContentKey ? buildOssPublicUrl(ossConfig, nextContentKey) : null,
          nextParseKey,
          nextParseKey ? buildOssPublicUrl(ossConfig, nextParseKey) : null,
          nextStructuredContentKey,
          pdf.id
        ]
      );
    }

    const [assetRows] = await connection.execute(
      `SELECT id, output_path AS outputPath, output_meta_json AS outputMetaJson
       FROM bt_material_assets
       WHERE material_id = ? AND output_path IS NOT NULL`,
      [material.id]
    );

    for (const asset of assetRows) {
      const nextOutputPath = asset.outputPath?.startsWith(oldPrefix)
        ? `${newPrefix}${asset.outputPath.slice(oldPrefix.length)}`
        : asset.outputPath;
      const nextOutputMeta = safeJsonParse(asset.outputMetaJson, {});

      ['pngOutputPath', 'compressedJpgOutputPath'].forEach((key) => {
        if (typeof nextOutputMeta[key] === 'string' && nextOutputMeta[key].startsWith(oldPrefix)) {
          nextOutputMeta[key] = `${newPrefix}${nextOutputMeta[key].slice(oldPrefix.length)}`;
        }
      });
      ['pngOutputUrl', 'compressedJpgOutputUrl'].forEach((key) => {
        const pathKey = key === 'pngOutputUrl' ? 'pngOutputPath' : 'compressedJpgOutputPath';
        if (nextOutputMeta[pathKey]) {
          nextOutputMeta[key] = buildOssPublicUrl(ossConfig, nextOutputMeta[pathKey]);
        }
      });

      if (nextOutputPath === asset.outputPath && JSON.stringify(nextOutputMeta) === JSON.stringify(safeJsonParse(asset.outputMetaJson, {}))) {
        continue;
      }

      await connection.execute(
        `UPDATE bt_material_assets
         SET output_path = ?, output_meta_json = ?
         WHERE id = ?`,
        [nextOutputPath, JSON.stringify(nextOutputMeta), asset.id]
      );
    }

    const [thumbnailRows] = await connection.execute(
      `SELECT id, output_path AS outputPath, output_meta_json AS outputMetaJson
       FROM bt_material_thumbnails
       WHERE material_id = ? AND output_path IS NOT NULL`,
      [material.id]
    );

    for (const thumbnail of thumbnailRows) {
      const nextOutputPath = thumbnail.outputPath?.startsWith(oldPrefix)
        ? `${newPrefix}${thumbnail.outputPath.slice(oldPrefix.length)}`
        : thumbnail.outputPath;
      const nextOutputMeta = safeJsonParse(thumbnail.outputMetaJson, {});

      ['pngOutputPath', 'compressedJpgOutputPath'].forEach((key) => {
        if (typeof nextOutputMeta[key] === 'string' && nextOutputMeta[key].startsWith(oldPrefix)) {
          nextOutputMeta[key] = `${newPrefix}${nextOutputMeta[key].slice(oldPrefix.length)}`;
        }
      });
      ['pngOutputUrl', 'compressedJpgOutputUrl'].forEach((key) => {
        const pathKey = key === 'pngOutputUrl' ? 'pngOutputPath' : 'compressedJpgOutputPath';
        if (nextOutputMeta[pathKey]) {
          nextOutputMeta[key] = buildOssPublicUrl(ossConfig, nextOutputMeta[pathKey]);
        }
      });

      if (nextOutputPath === thumbnail.outputPath && JSON.stringify(nextOutputMeta) === JSON.stringify(safeJsonParse(thumbnail.outputMetaJson, {}))) {
        continue;
      }

      await connection.execute(
        `UPDATE bt_material_thumbnails
         SET output_path = ?, output_meta_json = ?
         WHERE id = ?`,
        [nextOutputPath, JSON.stringify(nextOutputMeta), thumbnail.id]
      );
    }

    const [videoRows] = await connection.execute(
      `SELECT id, output_path AS outputPath, output_meta_json AS outputMetaJson
       FROM bt_material_thumbnail_videos
       WHERE material_id = ? AND output_path IS NOT NULL`,
      [material.id]
    );

    for (const video of videoRows) {
      const nextOutputPath = video.outputPath?.startsWith(oldPrefix)
        ? `${newPrefix}${video.outputPath.slice(oldPrefix.length)}`
        : video.outputPath;
      const nextOutputMeta = safeJsonParse(video.outputMetaJson, {});

      if (typeof nextOutputMeta.posterPath === 'string' && nextOutputMeta.posterPath.startsWith(oldPrefix)) {
        nextOutputMeta.posterPath = `${newPrefix}${nextOutputMeta.posterPath.slice(oldPrefix.length)}`;
        nextOutputMeta.posterUrl = buildOssPublicUrl(ossConfig, nextOutputMeta.posterPath);
      }

      if (nextOutputPath === video.outputPath && JSON.stringify(nextOutputMeta) === JSON.stringify(safeJsonParse(video.outputMetaJson, {}))) {
        continue;
      }

      await connection.execute(
        `UPDATE bt_material_thumbnail_videos
         SET output_path = ?, output_meta_json = ?
         WHERE id = ?`,
        [nextOutputPath, JSON.stringify(nextOutputMeta), video.id]
      );
    }

    const [audioRows] = await connection.execute(
      `SELECT id, output_path AS outputPath
       FROM bt_material_audios
       WHERE material_id = ? AND output_path IS NOT NULL`,
      [material.id]
    );

    for (const audio of audioRows) {
      const nextOutputPath = audio.outputPath?.startsWith(oldPrefix)
        ? `${newPrefix}${audio.outputPath.slice(oldPrefix.length)}`
        : audio.outputPath;

      if (nextOutputPath === audio.outputPath) {
        continue;
      }

      await connection.execute(
        `UPDATE bt_material_audios
         SET output_path = ?
         WHERE id = ?`,
        [nextOutputPath, audio.id]
      );
    }

    await connection.execute(
      `UPDATE bt_materials
       SET oss_prefix = ?, storage_status = ?, latest_error = NULL
       WHERE id = ?`,
      [newPrefix, MATERIAL_STORAGE_STATUS.READY, material.id]
    );
  } catch (error) {
    await connection.execute(
      `UPDATE bt_materials
       SET storage_status = ?, latest_error = ?
       WHERE id = ?`,
      [MATERIAL_STORAGE_STATUS.MOVE_FAILED, error.message || '教材目录迁移失败', material.id]
    );
    throw error;
  }
};

const processClaimedJob = async ({ job, getDbConnection, projectRoot }) => {
  let connection;

  try {
    connection = await getDbConnection();

    if (job.jobType === JOB_TYPES.PARSE_PDF || job.jobType === JOB_TYPES.REPARSE_PDF) {
      await handleParsePdfJob({ job, connection, getDbConnection, projectRoot });
    } else if (job.jobType === JOB_TYPES.EXTRACT_STRUCTURED_CONTENT) {
      await handleExtractStructuredContentJob({ job, connection, getDbConnection });
    } else if (job.jobType === JOB_TYPES.GENERATE_THUMBNAIL) {
      await handleGenerateThumbnailJob({ job, connection, projectRoot });
    } else if (job.jobType === JOB_TYPES.GENERATE_THUMBNAIL_COMPANION) {
      await handleGenerateThumbnailCompanionJob({ job, connection, projectRoot });
    } else if (job.jobType === JOB_TYPES.GENERATE_THUMBNAIL_VIDEO) {
      await handleGenerateThumbnailVideoJob({ job, connection });
    } else if (job.jobType === JOB_TYPES.GENERATE_AUDIO) {
      await handleGenerateMaterialAudioJob({ job, connection });
    } else if (job.jobType === JOB_TYPES.ANNOTATE_THUMBNAIL_POSITIONS) {
      await handleAnnotateThumbnailPositionsJob({ job, connection });
    } else if (job.jobType === JOB_TYPES.MOVE_MATERIAL_PREFIX) {
      await handleMoveMaterialPrefixJob({ job, connection });
    } else {
      throw createHttpError(`未知任务类型: ${job.jobType}`, 500);
    }

    await withHealthyJobConnection({
      connection,
      getDbConnection,
      task: async (activeConnection) => {
        await completeJob(activeConnection, job.id);
      }
    });
  } catch (error) {
    console.error('教材任务执行失败:', job, error);

    try {
      await withHealthyJobConnection({
        connection,
        getDbConnection,
        task: async (activeConnection) => {
          await failOrRetryJob(activeConnection, job, error);
        }
      });
    } catch (updateError) {
      console.error('教材任务状态回写失败:', updateError);
    }
  } finally {
    await closeConnectionQuietly(connection);
  }
};

const pollMaterialJobs = async ({ getDbConnection, projectRoot }) => {
  if (materialWorkerBusy) return;
  materialWorkerBusy = true;

  try {
    while (true) {
      let claimConnection;
      let job = null;

      try {
        claimConnection = await getDbConnection();
        job = await claimNextQueuedJob(claimConnection, materialWorkerId);
      } finally {
        if (claimConnection) {
          await claimConnection.end();
        }
      }

      if (!job) break;
      await processClaimedJob({ job, getDbConnection, projectRoot });
    }
  } finally {
    materialWorkerBusy = false;
  }
};

const safelyPollMaterialJobs = async ({ getDbConnection, projectRoot }) => {
  if (Date.now() < materialWorkerSuspendUntil) {
    return;
  }

  try {
    await pollMaterialJobs({ getDbConnection, projectRoot });
    materialWorkerFailureCount = 0;
    materialWorkerSuspendUntil = 0;
  } catch (error) {
    materialWorkerFailureCount += 1;
    const backoffMs = Math.min(
      JOB_POLL_INTERVAL_MS * (2 ** Math.min(materialWorkerFailureCount, 4)),
      JOB_POLL_BACKOFF_MAX_MS
    );
    materialWorkerSuspendUntil = Date.now() + backoffMs;
    console.error(`教材任务轮询失败，将在 ${Math.round(backoffMs / 1000)} 秒后重试:`, error);
  }
};

const startMaterialWorker = async ({ getDbConnection, projectRoot }) => {
  if (materialWorkerStarted) return;

  materialWorkerStarted = true;
  materialWorkerId = `material-worker-${process.pid}-${Date.now().toString(36)}`;
  try {
    await resetStaleRunningJobs(getDbConnection);
  } catch (error) {
    console.error('教材任务 worker 初始化失败，将继续以重试模式运行:', error);
  }
  void safelyPollMaterialJobs({ getDbConnection, projectRoot });
  materialWorkerTimer = setInterval(() => {
    void safelyPollMaterialJobs({ getDbConnection, projectRoot });
  }, JOB_POLL_INTERVAL_MS);
};

const hasPendingParseJob = async (connection, pdfId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_pdf_id = ? AND job_type IN (?, ?) AND status IN (?, ?)
     LIMIT 1`,
    [
      pdfId,
      JOB_TYPES.PARSE_PDF,
      JOB_TYPES.REPARSE_PDF,
      JOB_STATUS.QUEUED,
      JOB_STATUS.RUNNING
    ]
  );

  return rows.length > 0;
};

const hasPendingStructuredContentJob = async (connection, pdfId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_pdf_id = ? AND job_type = ? AND status IN (?, ?)
     LIMIT 1`,
    [
      pdfId,
      JOB_TYPES.EXTRACT_STRUCTURED_CONTENT,
      JOB_STATUS.QUEUED,
      JOB_STATUS.RUNNING
    ]
  );

  return rows.length > 0;
};

const hasPendingJobsForThumbnail = async (connection, thumbnailId, jobTypes = []) => {
  if (!thumbnailId || !jobTypes.length) return false;

  const placeholders = jobTypes.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_thumbnail_id = ?
       AND job_type IN (${placeholders})
       AND status IN (?, ?)
     LIMIT 1`,
    [thumbnailId, ...jobTypes, JOB_STATUS.QUEUED, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const hasPendingJobsForThumbnailVideo = async (connection, videoId, jobTypes = []) => {
  if (!videoId || !jobTypes.length) return false;

  const placeholders = jobTypes.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_thumbnail_video_id = ?
       AND job_type IN (${placeholders})
       AND status IN (?, ?)
     LIMIT 1`,
    [videoId, ...jobTypes, JOB_STATUS.QUEUED, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const hasPendingJobsForMaterialAudio = async (connection, audioId, jobTypes = []) => {
  if (!audioId || !jobTypes.length) return false;

  const placeholders = jobTypes.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_audio_id = ?
       AND job_type IN (${placeholders})
       AND status IN (?, ?)
     LIMIT 1`,
    [audioId, ...jobTypes, JOB_STATUS.QUEUED, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const hasRunningJobsForMaterial = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_id = ? AND status = ?
     LIMIT 1`,
    [materialId, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const hasRunningJobsForMaterialAudio = async (connection, audioId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_audio_id = ? AND status = ?
     LIMIT 1`,
    [audioId, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const hasRunningJobsForThumbnail = async (connection, thumbnailId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_thumbnail_id = ? AND status = ?
     LIMIT 1`,
    [thumbnailId, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const hasRunningJobsForThumbnailVideo = async (connection, videoId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_thumbnail_video_id = ? AND status = ?
     LIMIT 1`,
    [videoId, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const hasRunningJobsForPdf = async (connection, pdfId) => {
  const [rows] = await connection.execute(
    `SELECT id
     FROM bt_material_jobs
     WHERE material_pdf_id = ? AND status = ?
     LIMIT 1`,
    [pdfId, JOB_STATUS.RUNNING]
  );

  return rows.length > 0;
};

const removeQueuedJobsForPdf = async (connection, pdfId) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_pdf_id = ? AND status IN (?, ?, ?)`,
    [pdfId, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeNonRunningJobsForPdfByType = async (connection, pdfId, jobType) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_pdf_id = ? AND job_type = ? AND status IN (?, ?, ?)`,
    [pdfId, jobType, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeNonRunningJobsForThumbnailByType = async (connection, thumbnailId, jobType) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_thumbnail_id = ? AND job_type = ? AND status IN (?, ?, ?)`,
    [thumbnailId, jobType, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeNonRunningJobsForThumbnailVideoByType = async (connection, videoId, jobType) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_thumbnail_video_id = ? AND job_type = ? AND status IN (?, ?, ?)`,
    [videoId, jobType, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeNonRunningJobsForMaterialAudioByType = async (connection, audioId, jobType) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_audio_id = ? AND job_type = ? AND status IN (?, ?, ?)`,
    [audioId, jobType, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeQueuedJobsForMaterialAudio = async (connection, audioId) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_audio_id = ? AND status IN (?, ?, ?)`,
    [audioId, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeQueuedJobsForThumbnail = async (connection, thumbnailId) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_thumbnail_id = ? AND status IN (?, ?, ?)`,
    [thumbnailId, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeQueuedJobsForThumbnailVideo = async (connection, videoId) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_thumbnail_video_id = ? AND status IN (?, ?, ?)`,
    [videoId, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const removeAllJobsForMaterial = async (connection, materialId) => {
  await connection.execute(
    `DELETE FROM bt_material_jobs
     WHERE material_id = ? AND status IN (?, ?, ?)`,
    [materialId, JOB_STATUS.QUEUED, JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
  );
};

const migrateLegacyMaterialRows = async ({ connection, projectRoot }) => {
  const [rows] = await connection.execute(
    `SELECT m.id, m.title, m.description, m.group_id AS groupId, m.sort_order AS sortOrder,
            m.oss_prefix AS ossPrefix, m.original_file_name AS originalFileName,
            m.file_path AS filePath, m.file_size AS fileSize, m.mime_type AS mimeType
     FROM bt_materials m
     LEFT JOIN bt_material_pdfs p ON p.material_id = m.id
     WHERE p.id IS NULL AND m.original_file_name IS NOT NULL AND m.original_file_name != ''`
  );

  for (const row of rows) {
    const displayName = path.parse(row.originalFileName || 'document').name;
    const ossPrefix = row.ossPrefix || await resolveLegacyMaterialOssPrefix(connection, row.title, row.id);
    const legacyLocalPath = row.filePath || null;
    const localAbsolutePath = legacyLocalPath ? resolveLegacyLocalAbsolutePath(projectRoot, legacyLocalPath) : null;
    const localExists = localAbsolutePath ? await fsp.access(localAbsolutePath).then(() => true).catch(() => false) : false;
    const initialParseStatus = localExists ? PDF_PARSE_STATUS.QUEUED : PDF_PARSE_STATUS.FAILED;
    const initialError = localExists ? '等待历史 PDF 迁移到 OSS 并解析' : '历史 PDF 文件不存在，需重新上传';

    const [pdfResult] = await connection.execute(
      `INSERT INTO bt_material_pdfs (
        material_id, sort_order, storage_sequence, display_name, original_file_name,
        source_mime_type, source_size, source_storage_key, source_url, cover_storage_key,
        cover_url, content_storage_key, content_url, parse_storage_key, parse_url,
        legacy_local_path, upload_status, parse_status, parser_name, parser_version,
        page_count, error_message, parsed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, ?, NULL)`,
      [
        row.id,
        10,
        1,
        displayName,
        row.originalFileName,
        row.mimeType || 'application/pdf',
        row.fileSize || 0,
        localExists ? buildLocalPublicUrl(legacyLocalPath) : null,
        legacyLocalPath,
        PDF_UPLOAD_STATUS.LEGACY_LOCAL,
        initialParseStatus,
        initialError
      ]
    );

    await ensureMaterialAssetRows(connection, row.id);
    await connection.execute(
      `UPDATE bt_materials
       SET oss_prefix = ?, parse_status = ?, latest_error = ?
       WHERE id = ?`,
      [ossPrefix, localExists ? MATERIAL_PARSE_STATUS.QUEUED : MATERIAL_PARSE_STATUS.FAILED, initialError, row.id]
    );

    if (localExists) {
      await enqueueJob(connection, {
        jobType: JOB_TYPES.PARSE_PDF,
        materialId: row.id,
        materialPdfId: pdfResult.insertId,
        payload: { source: 'legacy_migration' }
      });
    }
  }
};

const enqueueMissingStructuredContentJobs = async (connection) => {
  const [rows] = await connection.execute(
    `SELECT p.id, p.material_id AS materialId
     FROM bt_material_pdfs p
     WHERE p.parse_status = ?
       AND (
       p.structured_content_storage_key IS NULL
         OR p.\`main\` IS NULL
         OR p.\`title\` IS NULL
         OR p.words_count IS NULL
         OR p.main_start IS NULL
         OR p.main_end IS NULL
         OR p.structured_content_status IS NULL
         OR p.structured_content_status IN (?, ?)
         OR NOT EXISTS (
           SELECT 1
           FROM bt_material_pdf_page_contents pc
           WHERE pc.material_pdf_id = p.id
         )
       )
       AND p.parse_storage_key IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM bt_material_jobs j
         WHERE j.material_pdf_id = p.id
           AND j.job_type = ?
           AND j.status IN (?, ?)
       )`,
    [
      PDF_PARSE_STATUS.READY,
      STRUCTURED_CONTENT_STATUS.NOT_STARTED,
      STRUCTURED_CONTENT_STATUS.FAILED,
      JOB_TYPES.EXTRACT_STRUCTURED_CONTENT,
      JOB_STATUS.QUEUED,
      JOB_STATUS.RUNNING
    ]
  );

  for (const row of rows) {
    await updateMaterialPdfResult(connection, row.id, {
      main: null,
      title: null,
      words_count: null,
      main_start: null,
      main_end: null,
      structured_content_status: STRUCTURED_CONTENT_STATUS.QUEUED,
      structured_content_error: null
    });
    await enqueueJob(connection, {
      jobType: JOB_TYPES.EXTRACT_STRUCTURED_CONTENT,
      materialId: row.materialId,
      materialPdfId: row.id,
      payload: { source: 'startup_backfill' }
    });
  }
};

const loadMaterials = async (connection, { keyword = '', groupFilter = null } = {}) => {
  const filters = [];
  const params = [];

  if (keyword) {
    filters.push(`(
      m.title LIKE ? OR
      m.description LIKE ? OR
      EXISTS (
        SELECT 1
        FROM bt_material_pdfs p
        WHERE p.material_id = m.id
          AND (p.original_file_name LIKE ? OR p.display_name LIKE ?)
      )
    )`);
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (groupFilter === 'ungrouped') {
    filters.push('m.group_id IS NULL');
  } else {
    const groupId = normalizeNullableId(groupFilter);
    if (groupId !== null) {
      filters.push('m.group_id = ?');
      params.push(groupId);
    }
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const [rows] = await connection.execute(
    `SELECT m.id, m.title, m.description, m.group_id AS groupId, m.sort_order AS sortOrder,
            m.oss_prefix AS ossPrefix, m.parse_status AS parseStatus, m.storage_status AS storageStatus,
            m.latest_error AS latestError, m.created_at AS createdAt, m.updated_at AS updatedAt,
            g.name AS groupName
     FROM bt_materials m
     LEFT JOIN bt_material_groups g ON g.id = m.group_id
     ${whereClause}
     ORDER BY
       CASE WHEN m.group_id IS NULL THEN 0 ELSE 1 END ASC,
       COALESCE(g.sort_order, 999999) ASC,
       m.sort_order ASC,
       m.id ASC`,
    params
  );

  return hydrateMaterials(connection, rows);
};

export const registerMaterialLibraryRoutes = async ({
  app,
  getDbConnection,
  projectRoot,
  databaseName = process.env.MYSQL_DATABASE || 'baboon'
}) => {
  const uploadDir = getMaterialLibraryUploadDir(projectRoot);
  console.log('📚 教材模块: 准备上传目录', uploadDir);
  await ensureDirectory(uploadDir);
  console.log('📚 教材模块: 上传目录已就绪');

  {
    let connection;
    try {
      console.log('📚 教材模块: 开始初始化数据库结构');
      connection = await getDbConnection();
      await ensureMaterialLibraryTables(connection, databaseName);
      console.log('📚 教材模块: 数据表检查完成');
      await migrateLegacyMaterialRows({ connection, projectRoot });
      console.log('📚 教材模块: 历史教材迁移检查完成');
      await backfillMaterialPdfKeywords(connection);
      console.log('📚 教材模块: PDF 关键词汇总补齐完成');
      await enqueueMissingStructuredContentJobs(connection);
      console.log('📚 教材模块: 缺失关键内容任务补齐完成');
    } catch (error) {
      console.error('教材模块初始化失败，将继续启动并在后续请求中重试数据库访问:', error);
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  console.log('📚 教材模块: 启动后台 worker');
  await startMaterialWorker({ getDbConnection, projectRoot });
  console.log('📚 教材模块: 后台 worker 已启动');

  const materialUpload = createMaterialUpload(uploadDir);
  const handleMaterialFiles = (req, res, next) => {
    materialUpload.fields([
      { name: 'files', maxCount: MAX_FILE_COUNT },
      { name: 'files[]', maxCount: MAX_FILE_COUNT }
    ])(req, res, (error) => {
      if (!error) return next();

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, error: '单个 PDF 文件不能超过 200MB' });
        }
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(400).json({ success: false, error: error.message || '文件上传失败' });
    });
  };

  app.get('/api/material-library/groups', async (_req, res) => {
    let connection;

    try {
      connection = await getDbConnection();
      const [rows] = await connection.execute(
        `SELECT g.id, g.name, g.description, g.sort_order AS sortOrder,
                g.thumbnail_prompt_template AS thumbnailPromptTemplate,
                g.thumbnail_video_prompt_template AS thumbnailVideoPromptTemplate,
                g.thumbnail_annotation_prompt_template AS thumbnailAnnotationPromptTemplate,
                g.thumbnail_companion_language_prompt_template AS thumbnailCompanionLanguagePromptTemplate,
                g.thumbnail_companion_textless_prompt_template AS thumbnailCompanionTextlessPromptTemplate,
                g.thumbnail_companion_background_prompt_template AS thumbnailCompanionBackgroundPromptTemplate,
                g.created_at AS createdAt, g.updated_at AS updatedAt,
                COUNT(DISTINCT m.id) AS materialCount
         FROM bt_material_groups g
         LEFT JOIN bt_materials m ON m.group_id = g.id
         GROUP BY g.id
         ORDER BY g.sort_order ASC, g.id ASC`
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('获取教材组失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/groups', async (req, res) => {
    let connection;

    try {
      const name = sanitizeDisplayText(req.body?.name || '');
      const description = sanitizeDisplayText(req.body?.description || '');

      if (!name) {
        throw createHttpError('教材组名称不能为空', 400);
      }

      connection = await getDbConnection();
      const sortOrder = await getNextGroupSortOrder(connection);

      const [result] = await connection.execute(
        `INSERT INTO bt_material_groups (name, description, sort_order)
         VALUES (?, ?, ?)`,
        [name, description || null, sortOrder]
      );

      res.json({ success: true, id: result.insertId });
    } catch (error) {
      console.error('新增教材组失败:', error);
      const statusCode = error.code === 'ER_DUP_ENTRY' ? 400 : (error.statusCode || 500);
      const message = error.code === 'ER_DUP_ENTRY' ? '教材组名称已存在' : error.message;
      res.status(statusCode).json({ success: false, error: message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.put('/api/material-library/groups/:id', async (req, res) => {
    let connection;

    try {
      const groupId = Number.parseInt(req.params.id, 10);
      const name = sanitizeDisplayText(req.body?.name || '');
      const description = sanitizeDisplayText(req.body?.description || '');

      if (!groupId) {
        throw createHttpError('教材组 ID 无效', 400);
      }

      if (!name) {
        throw createHttpError('教材组名称不能为空', 400);
      }

      connection = await getDbConnection();
      await connection.execute(
        `UPDATE bt_material_groups
         SET name = ?, description = ?
         WHERE id = ?`,
        [name, description || null, groupId]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('更新教材组失败:', error);
      const statusCode = error.code === 'ER_DUP_ENTRY' ? 400 : (error.statusCode || 500);
      const message = error.code === 'ER_DUP_ENTRY' ? '教材组名称已存在' : error.message;
      res.status(statusCode).json({ success: false, error: message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.put('/api/material-library/groups/:id/prompt-templates', async (req, res) => {
    let connection;

    try {
      const groupId = Number.parseInt(req.params.id, 10);
      if (!groupId) {
        throw createHttpError('教材组 ID 无效', 400);
      }

      const thumbnailPromptTemplate = normalizeSummaryImagePromptTemplate(req.body?.thumbnailPromptTemplate);
      const videoPromptTemplate = normalizeThumbnailVideoPromptTemplate(req.body?.videoPromptTemplate);
      const annotationPromptTemplate = normalizeThumbnailAnnotationPromptTemplate(req.body?.annotationPromptTemplate);
      const thumbnailCompanionLanguagePromptTemplate = normalizeThumbnailCompanionLanguagePromptTemplate(
        req.body?.thumbnailCompanionLanguagePromptTemplate
      );
      const thumbnailCompanionTextlessPromptTemplate = normalizeThumbnailCompanionTextlessPromptTemplate(
        req.body?.thumbnailCompanionTextlessPromptTemplate
      );
      const thumbnailCompanionBackgroundPromptTemplate = normalizeThumbnailCompanionBackgroundPromptTemplate(
        req.body?.thumbnailCompanionBackgroundPromptTemplate
      );

      connection = await getDbConnection();
      const group = await getMaterialGroupById(connection, groupId);
      if (!group) {
        throw createHttpError('教材组不存在', 404);
      }

      await connection.execute(
        `UPDATE bt_material_groups
         SET thumbnail_prompt_template = ?,
             thumbnail_video_prompt_template = ?,
             thumbnail_annotation_prompt_template = ?,
             thumbnail_companion_language_prompt_template = ?,
             thumbnail_companion_textless_prompt_template = ?,
             thumbnail_companion_background_prompt_template = ?
         WHERE id = ?`,
        [
          thumbnailPromptTemplate,
          videoPromptTemplate,
          annotationPromptTemplate,
          thumbnailCompanionLanguagePromptTemplate,
          thumbnailCompanionTextlessPromptTemplate,
          thumbnailCompanionBackgroundPromptTemplate,
          groupId
        ]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('保存教材组提示词模板失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.delete('/api/material-library/groups/:id', async (req, res) => {
    let connection;

    try {
      const groupId = Number.parseInt(req.params.id, 10);
      if (!groupId) {
        throw createHttpError('教材组 ID 无效', 400);
      }

      connection = await getDbConnection();
      const [rows] = await connection.execute(
        'SELECT COUNT(*) AS total FROM bt_materials WHERE group_id = ?',
        [groupId]
      );

      if (Number(rows[0]?.total || 0) > 0) {
        throw createHttpError('该教材组下仍有教材，无法删除', 400);
      }

      await connection.execute('DELETE FROM bt_material_groups WHERE id = ?', [groupId]);
      res.json({ success: true });
    } catch (error) {
      console.error('删除教材组失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.get('/api/material-library/materials', async (req, res) => {
    let connection;

    try {
      connection = await getDbConnection();
      const keyword = sanitizeDisplayText(req.query?.keyword || '');
      const groupFilter = req.query?.groupId || null;

      const [groups] = await connection.execute(
        `SELECT g.id, g.name, g.description, g.sort_order AS sortOrder,
                g.thumbnail_prompt_template AS thumbnailPromptTemplate,
                g.thumbnail_video_prompt_template AS thumbnailVideoPromptTemplate,
                g.thumbnail_annotation_prompt_template AS thumbnailAnnotationPromptTemplate,
                g.thumbnail_companion_language_prompt_template AS thumbnailCompanionLanguagePromptTemplate,
                g.thumbnail_companion_textless_prompt_template AS thumbnailCompanionTextlessPromptTemplate,
                g.thumbnail_companion_background_prompt_template AS thumbnailCompanionBackgroundPromptTemplate,
                g.created_at AS createdAt, g.updated_at AS updatedAt,
                COUNT(DISTINCT m.id) AS materialCount
         FROM bt_material_groups g
         LEFT JOIN bt_materials m ON m.group_id = g.id
         GROUP BY g.id
         ORDER BY g.sort_order ASC, g.id ASC`
      );

      const materials = await loadMaterials(connection, { keyword, groupFilter });

      res.json({
        success: true,
        data: {
          groups,
          materials,
          assetTypes: MATERIAL_ASSET_TYPES,
          assetLabels: MATERIAL_ASSET_LABELS,
          materialParseStatuses: MATERIAL_PARSE_STATUS,
          materialStorageStatuses: MATERIAL_STORAGE_STATUS,
          pdfParseStatuses: PDF_PARSE_STATUS,
          structuredContentStatuses: STRUCTURED_CONTENT_STATUS
        }
      });
    } catch (error) {
      console.error('获取教材列表失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials', handleMaterialFiles, async (req, res) => {
    let connection;
    const uploadedObjectKeys = [];

    try {
      const files = normalizeUploadedFiles(req);
      const title = sanitizeMaterialTitle(req.body?.title || path.parse(files[0]?.originalname || '未命名教材').name);
      const description = sanitizeDisplayText(req.body?.description || '');
      const groupId = normalizeNullableId(req.body?.groupId);

      if (!files.length) {
        throw createHttpError('请至少上传一个 PDF 文件', 400);
      }

      if (files.length > MAX_FILE_COUNT) {
        throw createHttpError(`单次最多上传 ${MAX_FILE_COUNT} 个 PDF 文件`, 400);
      }

      if (files.some((file) => path.extname(file.originalname || '').toLowerCase() !== '.pdf')) {
        throw createHttpError('仅支持上传 PDF 文件', 400);
      }

      connection = await getDbConnection();
      await assertGroupExists(connection, groupId);
      await assertMaterialTitleAvailable(connection, title);
      const materialPrefix = await assertMaterialOssPrefixAvailable(connection, title);

      const ossConfig = resolveOssConfig();
      const ossClient = createOssClient(ossConfig);
      const sortOrder = await getNextMaterialSortOrder(connection, groupId);
      let nextStorageSequence = 1;
      let nextPdfSortOrder = 10;
      const preparedPdfs = [];

      for (const file of files) {
        const storageSequence = nextStorageSequence++;
        const displayName = path.parse(file.originalname || 'document').name;
        const sourceStorageKey = buildMaterialPdfSourceKey(materialPrefix, storageSequence, file.originalname);
        const sourceUrl = await uploadLocalFileToOss(
          ossClient,
          ossConfig,
          file.path,
          sourceStorageKey,
          file.mimetype || 'application/pdf'
        );

        uploadedObjectKeys.push(sourceStorageKey);
        preparedPdfs.push({
          sortOrder: nextPdfSortOrder,
          storageSequence,
          displayName,
          originalFileName: file.originalname,
          sourceMimeType: file.mimetype || 'application/pdf',
          sourceSize: file.size || 0,
          sourceStorageKey,
          sourceUrl
        });

        nextPdfSortOrder += 10;
      }

      await connection.beginTransaction();
      const [materialResult] = await connection.execute(
        `INSERT INTO bt_materials (title, description, group_id, sort_order, oss_prefix, parse_status, storage_status, latest_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          title,
          description || null,
          groupId,
          sortOrder,
          materialPrefix,
          MATERIAL_PARSE_STATUS.QUEUED,
          MATERIAL_STORAGE_STATUS.READY
        ]
      );

      const materialId = materialResult.insertId;

      for (const preparedPdf of preparedPdfs) {
        const [pdfResult] = await connection.execute(
          `INSERT INTO bt_material_pdfs (
            material_id, sort_order, storage_sequence, display_name, original_file_name,
            source_mime_type, source_size, source_storage_key, source_url, legacy_local_path,
            upload_status, parse_status, parser_name, parser_version, page_count, error_message, parsed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
          [
            materialId,
            preparedPdf.sortOrder,
            preparedPdf.storageSequence,
            preparedPdf.displayName,
            preparedPdf.originalFileName,
            preparedPdf.sourceMimeType,
            preparedPdf.sourceSize,
            preparedPdf.sourceStorageKey,
            preparedPdf.sourceUrl,
            PDF_UPLOAD_STATUS.UPLOADED,
            PDF_PARSE_STATUS.QUEUED
          ]
        );

        await enqueueJob(connection, {
          jobType: JOB_TYPES.PARSE_PDF,
          materialId,
          materialPdfId: pdfResult.insertId,
          payload: { source: 'create_material' }
        });
      }

      await ensureMaterialAssetRows(connection, materialId);
      await updateMaterialDerivedState(connection, materialId);
      await connection.commit();

      const material = await getMaterialById(connection, materialId);
      const hydratedMaterials = await hydrateMaterials(connection, [material]);

      res.json({
        success: true,
        data: hydratedMaterials[0]
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      try {
        if (uploadedObjectKeys.length) {
          const ossConfig = resolveOssConfig();
          const ossClient = createOssClient(ossConfig);
          await deleteOssObjects(ossClient, uploadedObjectKeys);
        }
      } catch (cleanupError) {
        console.error('回滚已上传 OSS 文件失败:', cleanupError);
      }

      console.error('创建教材失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      await cleanupUploadedFiles(normalizeUploadedFiles(req));
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials/:id/pdfs', handleMaterialFiles, async (req, res) => {
    let connection;
    const uploadedObjectKeys = [];

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const files = normalizeUploadedFiles(req);

      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      if (!files.length) {
        throw createHttpError('请至少上传一个 PDF 文件', 400);
      }

      if (files.length > MAX_FILE_COUNT) {
        throw createHttpError(`单次最多上传 ${MAX_FILE_COUNT} 个 PDF 文件`, 400);
      }

      if (files.some((file) => path.extname(file.originalname || '').toLowerCase() !== '.pdf')) {
        throw createHttpError('仅支持上传 PDF 文件', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能追加 PDF', 400);
      }

      const ossConfig = resolveOssConfig();
      const ossClient = createOssClient(ossConfig);
      let nextStorageSequence = await getNextPdfStorageSequence(connection, materialId);
      let nextPdfSortOrder = await getNextPdfSortOrder(connection, materialId);
      const preparedPdfs = [];

      for (const file of files) {
        const storageSequence = nextStorageSequence++;
        const displayName = path.parse(file.originalname || 'document').name;
        const sourceStorageKey = buildMaterialPdfSourceKey(material.ossPrefix, storageSequence, file.originalname);
        const sourceUrl = await uploadLocalFileToOss(
          ossClient,
          ossConfig,
          file.path,
          sourceStorageKey,
          file.mimetype || 'application/pdf'
        );

        uploadedObjectKeys.push(sourceStorageKey);
        preparedPdfs.push({
          sortOrder: nextPdfSortOrder,
          storageSequence,
          displayName,
          originalFileName: file.originalname,
          sourceMimeType: file.mimetype || 'application/pdf',
          sourceSize: file.size || 0,
          sourceStorageKey,
          sourceUrl
        });

        nextPdfSortOrder += 10;
      }

      await connection.beginTransaction();

      for (const preparedPdf of preparedPdfs) {
        const [pdfResult] = await connection.execute(
          `INSERT INTO bt_material_pdfs (
            material_id, sort_order, storage_sequence, display_name, original_file_name,
            source_mime_type, source_size, source_storage_key, source_url, legacy_local_path,
            upload_status, parse_status, parser_name, parser_version, page_count, error_message, parsed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
          [
            materialId,
            preparedPdf.sortOrder,
            preparedPdf.storageSequence,
            preparedPdf.displayName,
            preparedPdf.originalFileName,
            preparedPdf.sourceMimeType,
            preparedPdf.sourceSize,
            preparedPdf.sourceStorageKey,
            preparedPdf.sourceUrl,
            PDF_UPLOAD_STATUS.UPLOADED,
            PDF_PARSE_STATUS.QUEUED
          ]
        );

        await enqueueJob(connection, {
          jobType: JOB_TYPES.PARSE_PDF,
          materialId,
          materialPdfId: pdfResult.insertId,
          payload: { source: 'append_pdf' }
        });
      }

      await updateMaterialDerivedState(connection, materialId);
      await connection.commit();

      const refreshedMaterial = await getMaterialById(connection, materialId);
      const hydratedMaterials = await hydrateMaterials(connection, [refreshedMaterial]);

      res.json({ success: true, data: hydratedMaterials[0] });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      try {
        if (uploadedObjectKeys.length) {
          const ossConfig = resolveOssConfig();
          const ossClient = createOssClient(ossConfig);
          await deleteOssObjects(ossClient, uploadedObjectKeys);
        }
      } catch (cleanupError) {
        console.error('回滚已上传 OSS 文件失败:', cleanupError);
      }

      console.error('追加教材 PDF 失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      await cleanupUploadedFiles(normalizeUploadedFiles(req));
      if (connection) await connection.end();
    }
  });

  app.put('/api/material-library/materials/:id', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const title = sanitizeMaterialTitle(req.body?.title || '');
      const description = sanitizeDisplayText(req.body?.description || '');
      const nextGroupId = normalizeNullableId(req.body?.groupId);

      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      if (!title) {
        throw createHttpError('教材名称不能为空', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      if (material.storageStatus === MATERIAL_STORAGE_STATUS.MOVING) {
        throw createHttpError('教材目录迁移中，暂时不能编辑', 400);
      }

      await assertGroupExists(connection, nextGroupId);
      await assertMaterialTitleAvailable(connection, title, materialId);
      const nextPrefix = await assertMaterialOssPrefixAvailable(connection, title, materialId);

      let sortOrder = material.sortOrder;
      if (material.groupId !== nextGroupId) {
        sortOrder = await getNextMaterialSortOrder(connection, nextGroupId);
      }

      const shouldMovePrefix = material.ossPrefix && material.ossPrefix !== nextPrefix;
      const hasPdfs = Number((await connection.execute(
        'SELECT COUNT(*) AS total FROM bt_material_pdfs WHERE material_id = ?',
        [materialId]
      ))[0][0]?.total || 0) > 0;

      await connection.beginTransaction();
      await connection.execute(
        `UPDATE bt_materials
         SET title = ?, description = ?, group_id = ?, sort_order = ?, oss_prefix = ?, storage_status = ?, latest_error = ?
         WHERE id = ?`,
        [
          title,
          description || null,
          nextGroupId,
          sortOrder,
          nextPrefix,
          shouldMovePrefix && hasPdfs ? MATERIAL_STORAGE_STATUS.MOVING : MATERIAL_STORAGE_STATUS.READY,
          null,
          materialId
        ]
      );

      if (shouldMovePrefix && hasPdfs) {
        await enqueueJob(connection, {
          jobType: JOB_TYPES.MOVE_MATERIAL_PREFIX,
          materialId,
          payload: {
            oldPrefix: material.ossPrefix,
            newPrefix: nextPrefix
          },
          maxAttempts: 5
        });
      }

      await connection.commit();

      const refreshedMaterial = await getMaterialById(connection, materialId);
      const hydratedMaterials = await hydrateMaterials(connection, [refreshedMaterial]);

      res.json({ success: true, data: hydratedMaterials[0] });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      console.error('更新教材失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials/:id/move', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const direction = String(req.body?.direction || '').trim();

      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      if (!['up', 'down'].includes(direction)) {
        throw createHttpError('排序方向无效', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      const { clause, params } = getGroupWhereClause(material.groupId);
      const compareOperator = direction === 'up' ? '<' : '>';
      const orderDirection = direction === 'up' ? 'DESC' : 'ASC';

      const [rows] = await connection.execute(
        `SELECT id, sort_order AS sortOrder
         FROM bt_materials
         WHERE ${clause} AND sort_order ${compareOperator} ?
         ORDER BY sort_order ${orderDirection}
         LIMIT 1`,
        [...params, material.sortOrder]
      );

      const targetMaterial = rows[0];
      if (!targetMaterial) {
        return res.json({ success: true, data: { moved: false } });
      }

      await connection.beginTransaction();
      await connection.execute('UPDATE bt_materials SET sort_order = ? WHERE id = ?', [targetMaterial.sortOrder, material.id]);
      await connection.execute('UPDATE bt_materials SET sort_order = ? WHERE id = ?', [material.sortOrder, targetMaterial.id]);
      await connection.commit();

      res.json({ success: true, data: { moved: true } });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      console.error('教材排序失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials/:id/pdfs/reorder', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const orderedPdfIds = Array.isArray(req.body?.orderedPdfIds) ? req.body.orderedPdfIds.map((value) => Number.parseInt(value, 10)).filter(Boolean) : [];

      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      if (!orderedPdfIds.length) {
        throw createHttpError('PDF 排序列表不能为空', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能调整 PDF 顺序', 400);
      }

      const [pdfRows] = await connection.execute(
        'SELECT id FROM bt_material_pdfs WHERE material_id = ? ORDER BY sort_order ASC, id ASC',
        [materialId]
      );
      const existingIds = pdfRows.map((row) => Number(row.id));

      if (existingIds.length !== orderedPdfIds.length) {
        throw createHttpError('PDF 排序列表不完整', 400);
      }

      const existingSet = new Set(existingIds);
      const incomingSet = new Set(orderedPdfIds);
      if (existingSet.size !== incomingSet.size || existingIds.some((id) => !incomingSet.has(id))) {
        throw createHttpError('PDF 排序列表不合法', 400);
      }

      await connection.beginTransaction();
      for (let index = 0; index < orderedPdfIds.length; index += 1) {
        await connection.execute(
          'UPDATE bt_material_pdfs SET sort_order = ? WHERE id = ?',
          [(index + 1) * 10, orderedPdfIds[index]]
        );
      }
      await connection.commit();

      const refreshedMaterial = await getMaterialById(connection, materialId);
      const hydratedMaterials = await hydrateMaterials(connection, [refreshedMaterial]);
      res.json({ success: true, data: hydratedMaterials[0] });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      console.error('PDF 排序失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/pdfs/:pdfId/reparse', async (req, res) => {
    let connection;

    try {
      const pdfId = Number.parseInt(req.params.pdfId, 10);
      if (!pdfId) {
        throw createHttpError('PDF ID 无效', 400);
      }

      connection = await getDbConnection();
      const pdf = await getMaterialPdfById(connection, pdfId);
      if (!pdf) {
        throw createHttpError('PDF 不存在', 404);
      }

      const material = await getMaterialById(connection, pdf.materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能重新解析', 400);
      }

      if (await hasRunningJobsForPdf(connection, pdfId)) {
        throw createHttpError('该 PDF 仍有后台任务执行中，暂时不能重新解析', 400);
      }

      if (await hasPendingParseJob(connection, pdfId)) {
        return res.json({ success: true, message: '该 PDF 已存在待处理解析任务' });
      }

      await connection.beginTransaction();
      await removeNonRunningJobsForPdfByType(connection, pdf.id, JOB_TYPES.EXTRACT_STRUCTURED_CONTENT);
      await clearMaterialPdfPageContents(connection, pdf.id);
      await updateMaterialPdfResult(connection, pdf.id, {
        parse_status: PDF_PARSE_STATUS.QUEUED,
        error_message: null,
        structured_content_storage_key: null,
        keywords_json: null,
        main: null,
        title: null,
        words_count: null,
        main_start: null,
        main_end: null,
        structured_content_status: STRUCTURED_CONTENT_STATUS.NOT_STARTED,
        structured_content_error: null
      });
      await enqueueJob(connection, {
        jobType: JOB_TYPES.REPARSE_PDF,
        materialId: material.id,
        materialPdfId: pdf.id,
        payload: { source: 'manual_reparse' }
      });
      await updateMaterialDerivedState(connection, material.id);
      await connection.commit();

      res.json({ success: true, message: '已提交重新解析任务' });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      console.error('重新解析 PDF 失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/pdfs/:pdfId/regenerate-key-content', async (req, res) => {
    let connection;

    try {
      const pdfId = Number.parseInt(req.params.pdfId, 10);
      if (!pdfId) {
        throw createHttpError('PDF ID 无效', 400);
      }

      connection = await getDbConnection();
      const pdf = await getMaterialPdfById(connection, pdfId);
      if (!pdf) {
        throw createHttpError('PDF 不存在', 404);
      }

      const material = await getMaterialById(connection, pdf.materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能生成关键内容', 400);
      }

      if (pdf.parseStatus !== PDF_PARSE_STATUS.READY || !pdf.parseStorageKey || !pdf.contentStorageKey) {
        throw createHttpError('PDF 解析结果尚未就绪，请先完成解析后再生成关键内容', 400);
      }

      if (await hasRunningJobsForPdf(connection, pdfId)) {
        throw createHttpError('该 PDF 仍有后台任务执行中，暂时不能重新生成关键内容', 400);
      }

      if (await hasPendingStructuredContentJob(connection, pdfId)) {
        return res.json({ success: true, message: '该 PDF 已存在待处理关键内容任务' });
      }

      await connection.beginTransaction();
      await removeNonRunningJobsForPdfByType(connection, pdf.id, JOB_TYPES.EXTRACT_STRUCTURED_CONTENT);
      await clearMaterialPdfPageContents(connection, pdf.id);
      await updateMaterialPdfResult(connection, pdf.id, {
        structured_content_storage_key: null,
        keywords_json: null,
        main: null,
        title: null,
        words_count: null,
        main_start: null,
        main_end: null,
        structured_content_status: STRUCTURED_CONTENT_STATUS.QUEUED,
        structured_content_error: null
      });
      await enqueueJob(connection, {
        jobType: JOB_TYPES.EXTRACT_STRUCTURED_CONTENT,
        materialId: material.id,
        materialPdfId: pdf.id,
        payload: { source: 'manual_regenerate_key_content' }
      });
      await updateMaterialDerivedState(connection, material.id);
      await connection.commit();

      res.json({ success: true, message: '已提交关键内容生成任务' });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      console.error('重新生成关键内容失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.get('/api/material-library/pdfs/:pdfId/key-content-preview', async (req, res) => {
    let connection;

    try {
      const pdfId = Number.parseInt(req.params.pdfId, 10);
      if (!pdfId) {
        throw createHttpError('PDF ID 无效', 400);
      }

      connection = await getDbConnection();
      const payload = await buildMaterialKeyContentPromptPayload(connection, pdfId);
      res.json({
        success: true,
        data: {
          materialId: payload.material.id,
          materialTitle: payload.material.title,
          pdfId: payload.pdf.id,
          pdfName: payload.pdf.displayName || payload.pdf.originalFileName,
          model: payload.model,
          promptTemplate: payload.promptTemplate,
          pageSource: payload.pageSource,
          finalPrompt: payload.finalPrompt
        }
      });
    } catch (error) {
      console.error('获取关键内容提示词预览失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.get('/api/material-library/materials/:id/summary-image-preview', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      const preview = await buildSummaryImagePromptPayload(connection, material);
      res.json({
        success: true,
        data: {
          title: preview.title,
          body: preview.body,
          promptTemplate: preview.promptTemplate,
          finalPrompt: preview.finalPrompt,
          sourcePdfIds: preview.sourcePdfIds
        }
      });
    } catch (error) {
      console.error('获取摘要图提示词预览失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.get('/api/material-library/materials/:id/production', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      connection = await getDbConnection();
      const data = await buildMaterialProductionPayload(connection, materialId);
      res.json({ success: true, data });
    } catch (error) {
      console.error('获取教材制作工作台数据失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials/:id/thumbnails', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const scope = normalizeThumbnailScope(req.body?.scope);
      const normalizedLanguages = [...new Set(
        (Array.isArray(req.body?.languages) ? req.body.languages : [])
          .map((language) => normalizeThumbnailBaseLanguage(language))
          .filter(Boolean)
      )];

      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }
      if (!scope) {
        throw createHttpError('请选择生成范围', 400);
      }
      if (!normalizedLanguages.length) {
        throw createHttpError('请至少选择一种缩略图语言', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }
      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能制作缩略图', 400);
      }

      const allPages = await listMaterialProductionPages(connection, materialId);
      if (!allPages.length) {
        throw createHttpError('当前教材暂无可用于制作的页，请先完成关键内容提炼', 400);
      }
      const rawPdfRows = await listMaterialPdfsByMaterialIds(connection, [materialId]);
      const allPdfTargets = buildMaterialProductionPdfTargets({
        pdfs: rawPdfRows.map((row) => formatPdfRow(row)),
        pages: allPages
      });

      const pageRefs = (Array.isArray(req.body?.pageRefs) ? req.body.pageRefs : [])
        .map((pageRef) => normalizePageRef(pageRef))
        .filter(Boolean);
      const selectedTargets = scope === THUMBNAIL_SCOPE.ALL
        ? allPdfTargets
        : selectProductionPages({
        allPages,
        scope,
        pageRefs
      });
      if (!selectedTargets.length) {
        throw createHttpError(scope === THUMBNAIL_SCOPE.SELECTED ? '请选择至少一页' : '当前教材暂无可生成缩略图的页', 400);
      }

      const promptTemplate = req.body?.promptTemplate !== undefined
        ? normalizeSummaryImagePromptTemplate(req.body.promptTemplate)
        : await getThumbnailPromptTemplateForGroup(connection, material.groupId);

      const createdThumbnailIds = [];
      await connection.beginTransaction();
      try {
        for (const pageEntry of selectedTargets) {
          for (const language of normalizedLanguages) {
            const promptText = buildThumbnailPrompt({
              promptTemplate,
              language,
              pageEntry,
              material
            });
            const thumbnailId = await createThumbnailRecord(connection, {
              materialId,
              materialPdfId: pageEntry.materialPdfId,
              page: pageEntry.page,
              language,
              generationKind: THUMBNAIL_GENERATION_KINDS.BASE,
              promptText,
              status: THUMBNAIL_STATUS.QUEUED,
              lastMessage: '缩略图排队中'
            });
            await enqueueJob(connection, {
              jobType: JOB_TYPES.GENERATE_THUMBNAIL,
              materialId,
              materialPdfId: pageEntry.materialPdfId,
              materialThumbnailId: thumbnailId,
              payload: {
                promptText,
                language,
                page: pageEntry.page
              }
            });
            createdThumbnailIds.push(thumbnailId);
          }
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      const data = await buildMaterialProductionPayload(connection, materialId);
      res.json({
        success: true,
        message: `已提交 ${createdThumbnailIds.length} 个缩略图生成任务`,
        data
      });
    } catch (error) {
      console.error('提交缩略图生成任务失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials/:id/audios', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const scope = normalizeThumbnailScope(req.body?.scope);
      const voiceType = normalizeMaterialAudioVoiceType(req.body?.voiceType);
      const speedRatio = normalizeMaterialAudioSpeedRatio(req.body?.speedRatio);
      const retryFailedOnly = Boolean(req.body?.retryFailedOnly);

      if (!materialId) {
        throw createHttpError('Invalid material ID', 400);
      }
      if (!scope) {
        throw createHttpError('Please choose an audio generation scope', 400);
      }
      if (!voiceType) {
        throw createHttpError('Please choose a TTS voice', 400);
      }

      resolveVolcengineTtsConfig();
      const voiceOption = getMaterialAudioVoiceOption(voiceType);

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('Material not found', 404);
      }
      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('Material assets are still moving', 400);
      }

      const [rawPdfRows, allPages] = await Promise.all([
        listMaterialPdfsByMaterialIds(connection, [materialId]),
        listMaterialProductionPages(connection, materialId)
      ]);
      if (!allPages.length) {
        throw createHttpError('No production pages are available for this material yet', 400);
      }
      const pdfs = rawPdfRows.map(formatPdfRow);

      const pageRefs = (Array.isArray(req.body?.pageRefs) ? req.body.pageRefs : [])
        .map((pageRef) => normalizePageRef(pageRef))
        .filter(Boolean);
      const { targets: selectedTargets } = buildMaterialAudioGenerationTargets({
        pdfs,
        allPages,
        scope,
        pageRefs
      });
      if (!selectedTargets.length) {
        throw createHttpError(scope === THUMBNAIL_SCOPE.SELECTED ? 'Please select at least one page' : 'No valid audio targets were found', 400);
      }

      const queuedAudioIds = [];
      let busyCount = 0;
      let emptyCount = 0;
      let skippedCount = 0;

      await connection.beginTransaction();
      try {
        for (const target of selectedTargets) {
          const isTitleTarget = target.scopeType === 'title';
          const taskEntries = isTitleTarget
            ? [{ order: 0, text: normalizeStructuredContentValue(target.title) }]
            : getOrderedSegmentEntries(target.seg || {});
          if (!taskEntries.length) {
            emptyCount += 1;
            continue;
          }

          for (const taskEntry of taskEntries) {
            const inputText = isTitleTarget
              ? buildMaterialAudioInputText({ title: taskEntry.text })
              : buildMaterialAudioInputText({ body: taskEntry.text });
            if (!inputText) {
              emptyCount += 1;
              continue;
            }

            const existingAudio = await findMaterialAudioByTargetAndVoice(connection, {
              materialId,
              materialPdfId: target.materialPdfId,
              page: target.page,
              seg: taskEntry.order,
              voiceType
            });
            if (retryFailedOnly && (!existingAudio || existingAudio.status !== MATERIAL_AUDIO_STATUS.FAILED)) {
              skippedCount += 1;
              continue;
            }
            if (existingAudio && await hasPendingJobsForMaterialAudio(connection, existingAudio.id, [JOB_TYPES.GENERATE_AUDIO])) {
              busyCount += 1;
              continue;
            }

            const audioId = await upsertMaterialAudioRecord(connection, {
              materialId,
              materialPdfId: target.materialPdfId,
              page: target.page,
              seg: taskEntry.order,
              scopeType: isTitleTarget ? 'title' : 'segment',
              voiceType,
              voiceLabel: voiceOption?.label || voiceType,
              speedRatio,
              inputText,
              status: MATERIAL_AUDIO_STATUS.QUEUED,
              lastMessage: 'Audio queued'
            });
            await removeNonRunningJobsForMaterialAudioByType(connection, audioId, JOB_TYPES.GENERATE_AUDIO);
            await enqueueJob(connection, {
              jobType: JOB_TYPES.GENERATE_AUDIO,
              materialId,
              materialPdfId: target.materialPdfId,
              materialAudioId: audioId,
              payload: {
                voiceType,
                speedRatio,
                inputText,
                page: target.page,
                seg: taskEntry.order,
                scopeType: isTitleTarget ? 'title' : 'segment'
              }
            });
            queuedAudioIds.push(audioId);
          }
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      const messageParts = [];
      if (queuedAudioIds.length) {
        messageParts.push(`Queued ${queuedAudioIds.length} ${retryFailedOnly ? 'failed ' : ''}audio task(s)`);
      }
      if (busyCount) {
        messageParts.push(`${busyCount} already running`);
      }
      if (emptyCount) {
        messageParts.push(`${emptyCount} without text`);
      }
      if (retryFailedOnly && skippedCount) {
        messageParts.push(`${skippedCount} not failed`);
      }
      if (retryFailedOnly && !messageParts.length) {
        messageParts.push('No failed audio tasks matched current scope and voice');
      }

      const data = await buildMaterialProductionPayload(connection, materialId);
      res.json({
        success: true,
        message: messageParts.join(', ') || 'No new audio tasks were queued',
        data,
        queuedAudioIds
      });
    } catch (error) {
      console.error('Submit material audio generation failed:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/thumbnails/:thumbnailId/videos', async (req, res) => {
    let connection;

    try {
      const thumbnailId = Number.parseInt(req.params.thumbnailId, 10);
      if (!thumbnailId) {
        throw createHttpError('缩略图 ID 无效', 400);
      }

      resolveAtlasVideoConfig();

      connection = await getDbConnection();
      const thumbnail = await getThumbnailById(connection, thumbnailId);
      if (!thumbnail) {
        throw createHttpError('缩略图不存在', 404);
      }
      if (thumbnail.status !== THUMBNAIL_STATUS.READY) {
        throw createHttpError('当前缩略图尚未生成完成', 400);
      }

      const material = await getMaterialById(connection, thumbnail.materialId);
      if (!material) {
        throw createHttpError('所属教材不存在', 404);
      }
      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能生成视频', 400);
      }

      const sourceThumbnailId = normalizeNullableId(req.body?.sourceThumbnailId) || thumbnail.id;
      const sourceThumbnail = await getThumbnailById(connection, sourceThumbnailId);
      if (!sourceThumbnail) {
        throw createHttpError('视频来源缩略图不存在', 404);
      }
      if (sourceThumbnail.materialId !== thumbnail.materialId) {
        throw createHttpError('视频来源缩略图不属于当前教材', 400);
      }
      if (sourceThumbnail.materialPdfId !== thumbnail.materialPdfId || Number(sourceThumbnail.page || 0) !== Number(thumbnail.page || 0)) {
        throw createHttpError('视频来源缩略图必须与当前缩略图属于同一页或同一整本范围', 400);
      }
      if (sourceThumbnail.status !== THUMBNAIL_STATUS.READY) {
        throw createHttpError('视频来源缩略图尚未生成完成', 400);
      }

      const pageEntry = await getMaterialProductionTarget(connection, thumbnail.materialPdfId, thumbnail.page);
      if (!pageEntry) {
        throw createHttpError('当前缩略图对应的关键内容不存在', 400);
      }

      const promptTemplate = req.body?.promptTemplate !== undefined
        ? normalizeThumbnailVideoPromptTemplate(req.body.promptTemplate)
        : await getThumbnailVideoPromptTemplateForGroup(connection, material.groupId);
      const videoTaskCount = normalizeThumbnailVideoTaskCount(req.body?.videoCount);
      const promptText = buildThumbnailVideoPrompt({
        promptTemplate,
        pageEntry,
        material
      });

      const createdVideoIds = [];
      await connection.beginTransaction();
      try {
        for (let index = 0; index < videoTaskCount; index += 1) {
          const videoId = await createThumbnailVideoRecord(connection, {
            materialId: thumbnail.materialId,
            materialPdfId: thumbnail.materialPdfId,
            thumbnailId: thumbnail.id,
            sourceThumbnailId: sourceThumbnail.id,
            page: thumbnail.page,
            scopeType: Number(thumbnail.page || 0) > 0 ? 'page' : 'pdf',
            promptText,
            status: THUMBNAIL_VIDEO_STATUS.QUEUED,
            lastMessage: '视频排队中'
          });
          await enqueueJob(connection, {
            jobType: JOB_TYPES.GENERATE_THUMBNAIL_VIDEO,
            materialId: thumbnail.materialId,
            materialPdfId: thumbnail.materialPdfId,
            materialThumbnailId: thumbnail.id,
            materialThumbnailVideoId: videoId,
            payload: {
              sourceThumbnailId: sourceThumbnail.id,
              promptText
            }
          });
          createdVideoIds.push(videoId);
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      const data = await buildMaterialProductionPayload(connection, thumbnail.materialId);
      res.json({
        success: true,
        message: `已提交 ${createdVideoIds.length} 个视频生成任务`,
        data,
        createdVideoIds
      });
    } catch (error) {
      console.error('提交视频生成任务失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/thumbnails/:thumbnailId/companion', async (req, res) => {
    let connection;

    try {
      const thumbnailId = Number.parseInt(req.params.thumbnailId, 10);
      const targetLanguage = normalizeThumbnailLanguage(req.body?.targetLanguage);
      if (!thumbnailId) {
        throw createHttpError('缩略图 ID 无效', 400);
      }
      if (!targetLanguage) {
        throw createHttpError('请选择配套图类型', 400);
      }

      connection = await getDbConnection();
      const sourceThumbnail = await getThumbnailById(connection, thumbnailId);
      if (!sourceThumbnail) {
        throw createHttpError('缩略图不存在', 404);
      }
      if (sourceThumbnail.status !== THUMBNAIL_STATUS.READY) {
        throw createHttpError('当前缩略图尚未生成完成', 400);
      }
      if (sourceThumbnail.language === targetLanguage) {
        throw createHttpError('配套图语言不能与当前缩略图相同', 400);
      }

      const material = await getMaterialById(connection, sourceThumbnail.materialId);
      if (!material) {
        throw createHttpError('所属教材不存在', 404);
      }
      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能生成配套图', 400);
      }

      const directPromptOverride = typeof req.body?.promptTemplate === 'string'
        ? String(req.body.promptTemplate).trim()
        : '';
      const promptText = targetLanguage === 'background'
        ? (directPromptOverride || buildThumbnailCompanionPrompt({
          targetLanguage,
          backgroundTemplate: await getThumbnailCompanionBackgroundPromptTemplateForGroup(connection, material.groupId)
        }))
        : targetLanguage === 'textless'
        ? (directPromptOverride || buildThumbnailCompanionPrompt({
          targetLanguage,
          textlessTemplate: await getThumbnailCompanionTextlessPromptTemplateForGroup(connection, material.groupId)
        }))
        : (
          directPromptOverride.includes(COMPANION_TEMPLATE_LANGUAGE_TOKEN)
            ? buildThumbnailCompanionPrompt({
              targetLanguage,
              languageTemplate: normalizeThumbnailCompanionLanguagePromptTemplate(directPromptOverride)
            })
            : (directPromptOverride || buildThumbnailCompanionPrompt({
              targetLanguage,
              languageTemplate: await getThumbnailCompanionLanguagePromptTemplateForGroup(connection, material.groupId)
            }))
        );

      let createdThumbnailId;
      await connection.beginTransaction();
      try {
        createdThumbnailId = await createThumbnailRecord(connection, {
          materialId: sourceThumbnail.materialId,
          materialPdfId: sourceThumbnail.materialPdfId,
          page: sourceThumbnail.page,
          language: targetLanguage,
          derivedFromThumbnailId: sourceThumbnail.id,
          generationKind: THUMBNAIL_GENERATION_KINDS.COMPANION,
          promptText,
          status: THUMBNAIL_STATUS.QUEUED,
          lastMessage: '配套图排队中'
        });
        await enqueueJob(connection, {
          jobType: JOB_TYPES.GENERATE_THUMBNAIL_COMPANION,
          materialId: sourceThumbnail.materialId,
          materialPdfId: sourceThumbnail.materialPdfId,
          materialThumbnailId: createdThumbnailId,
          payload: {
            sourceThumbnailId: sourceThumbnail.id,
            targetLanguage,
            promptText
          }
        });
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      const data = await buildMaterialProductionPayload(connection, sourceThumbnail.materialId);
      res.json({
        success: true,
        message: '已提交配套图生成任务',
        data,
        createdThumbnailId
      });
    } catch (error) {
      console.error('提交配套图生成任务失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/thumbnails/:thumbnailId/annotations', async (req, res) => {
    let connection;

    try {
      const thumbnailId = Number.parseInt(req.params.thumbnailId, 10);
      if (!thumbnailId) {
        throw createHttpError('缩略图 ID 无效', 400);
      }

      connection = await getDbConnection();
      const thumbnail = await getThumbnailById(connection, thumbnailId);
      if (!thumbnail) {
        throw createHttpError('缩略图不存在', 404);
      }
      if (!['zh_hans', 'zh_hant', 'en'].includes(thumbnail.language)) {
        throw createHttpError('无文字缩略图不支持位置标定', 400);
      }
      if (thumbnail.status !== THUMBNAIL_STATUS.READY) {
        throw createHttpError('请先等待缩略图生成完成后再标定', 400);
      }
      if (await hasPendingJobsForThumbnail(connection, thumbnail.id, [JOB_TYPES.ANNOTATE_THUMBNAIL_POSITIONS])) {
        throw createHttpError('该缩略图已有位置标定任务在执行中', 400);
      }

      const material = await getMaterialById(connection, thumbnail.materialId);
      if (!material) {
        throw createHttpError('所属教材不存在', 404);
      }
      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能进行位置标定', 400);
      }

      const pageEntry = await getMaterialProductionTarget(connection, thumbnail.materialPdfId, thumbnail.page);
      if (!pageEntry) {
        throw createHttpError('当前缩略图对应的关键内容不存在', 400);
      }

      const promptTemplate = req.body?.promptTemplate !== undefined
        ? normalizeThumbnailAnnotationPromptTemplate(req.body.promptTemplate)
        : await getThumbnailAnnotationPromptTemplateForGroup(connection, material.groupId);
      const promptText = buildThumbnailAnnotationPrompt({
        template: promptTemplate,
        title: pageEntry.title,
        segments: pageEntry.seg,
        body: pageEntry.body
      });
      const expectedItems = buildExpectedAnnotationEntries({
        title: pageEntry.title,
        segments: pageEntry.seg,
        body: pageEntry.body,
        useBody: shouldUseBodyForAnnotationTemplate(promptTemplate)
      });

      await connection.beginTransaction();
      try {
        await removeNonRunningJobsForThumbnailByType(connection, thumbnail.id, JOB_TYPES.ANNOTATE_THUMBNAIL_POSITIONS);
        await updateThumbnailRecord(connection, thumbnail.id, {
          annotation_status: THUMBNAIL_ANNOTATION_STATUS.QUEUED,
          annotation_error: null
        });
        await enqueueJob(connection, {
          jobType: JOB_TYPES.ANNOTATE_THUMBNAIL_POSITIONS,
          materialId: thumbnail.materialId,
          materialPdfId: thumbnail.materialPdfId,
          materialThumbnailId: thumbnail.id,
          payload: {
            promptText,
            expectedItems
          }
        });
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      const data = await buildMaterialProductionPayload(connection, thumbnail.materialId);
      res.json({
        success: true,
        message: '已提交位置标定任务',
        data
      });
    } catch (error) {
      console.error('提交位置标定任务失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.delete('/api/material-library/thumbnails/:thumbnailId', async (req, res) => {
    let connection;

    try {
      const thumbnailId = Number.parseInt(req.params.thumbnailId, 10);
      if (!thumbnailId) {
        throw createHttpError('缩略图 ID 无效', 400);
      }

      connection = await getDbConnection();
      const thumbnail = await getThumbnailById(connection, thumbnailId);
      if (!thumbnail) {
        throw createHttpError('缩略图不存在', 404);
      }
      if (await hasRunningJobsForThumbnail(connection, thumbnail.id)) {
        throw createHttpError('该缩略图仍有后台任务执行中，暂时不能删除', 400);
      }

      const [videoRows] = await connection.execute(
        `SELECT id, output_path AS outputPath, output_meta_json AS outputMetaJson
         FROM bt_material_thumbnail_videos
         WHERE thumbnail_id = ?`,
        [thumbnail.id]
      );
      for (const videoRow of videoRows) {
        if (await hasRunningJobsForThumbnailVideo(connection, Number(videoRow.id))) {
          throw createHttpError('该缩略图仍有关联视频任务执行中，暂时不能删除', 400);
        }
      }

      const objectKeys = collectThumbnailObjectKeys(thumbnail);
      videoRows.forEach((videoRow) => {
        collectThumbnailVideoObjectKeys({
          outputPath: videoRow.outputPath,
          outputMeta: safeJsonParse(videoRow.outputMetaJson, {})
        }).forEach((key) => objectKeys.push(key));
      });
      await connection.beginTransaction();
      try {
        await removeQueuedJobsForThumbnail(connection, thumbnail.id);
        for (const videoRow of videoRows) {
          await removeQueuedJobsForThumbnailVideo(connection, Number(videoRow.id));
        }
        await connection.execute(
          'UPDATE bt_material_thumbnails SET derived_from_thumbnail_id = NULL WHERE derived_from_thumbnail_id = ?',
          [thumbnail.id]
        );
        await connection.execute(
          'DELETE FROM bt_material_thumbnail_videos WHERE thumbnail_id = ?',
          [thumbnail.id]
        );
        await connection.execute(
          'DELETE FROM bt_material_thumbnail_annotations WHERE thumbnail_id = ?',
          [thumbnail.id]
        );
        await connection.execute(
          'DELETE FROM bt_material_thumbnails WHERE id = ?',
          [thumbnail.id]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      if (objectKeys.length) {
        const ossClient = createOssClient(resolveOssConfig());
        await deleteOssObjects(ossClient, objectKeys);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('删除缩略图失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.delete('/api/material-library/videos/:videoId', async (req, res) => {
    let connection;

    try {
      const videoId = Number.parseInt(req.params.videoId, 10);
      if (!videoId) {
        throw createHttpError('视频 ID 无效', 400);
      }

      connection = await getDbConnection();
      const video = await getThumbnailVideoById(connection, videoId);
      if (!video) {
        throw createHttpError('视频不存在', 404);
      }
      if (await hasRunningJobsForThumbnailVideo(connection, video.id)) {
        throw createHttpError('该视频仍有后台任务执行中，暂时不能删除', 400);
      }

      const objectKeys = collectThumbnailVideoObjectKeys(video);
      await connection.beginTransaction();
      try {
        await removeQueuedJobsForThumbnailVideo(connection, video.id);
        await connection.execute(
          'DELETE FROM bt_material_thumbnail_videos WHERE id = ?',
          [video.id]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      if (objectKeys.length) {
        const ossClient = createOssClient(resolveOssConfig());
        await deleteOssObjects(ossClient, objectKeys);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('删除视频失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.delete('/api/material-library/audios/:audioId', async (req, res) => {
    let connection;

    try {
      const audioId = Number.parseInt(req.params.audioId, 10);
      if (!audioId) {
        throw createHttpError('音频 ID 无效', 400);
      }

      connection = await getDbConnection();
      const audio = await getMaterialAudioById(connection, audioId);
      if (!audio) {
        throw createHttpError('音频不存在', 404);
      }
      if (await hasRunningJobsForMaterialAudio(connection, audio.id)) {
        throw createHttpError('该音频仍有后台任务执行中，暂时不能删除', 400);
      }

      const objectKeys = collectMaterialAudioObjectKeys(audio);
      await connection.beginTransaction();
      try {
        await removeQueuedJobsForMaterialAudio(connection, audio.id);
        await connection.execute(
          'DELETE FROM bt_material_audios WHERE id = ?',
          [audio.id]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      if (objectKeys.length) {
        const ossClient = createOssClient(resolveOssConfig());
        await deleteOssObjects(ossClient, objectKeys);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('删除音频失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.delete('/api/material-library/pdfs/:pdfId', async (req, res) => {
    let connection;

    try {
      const pdfId = Number.parseInt(req.params.pdfId, 10);
      if (!pdfId) {
        throw createHttpError('PDF ID 无效', 400);
      }

      connection = await getDbConnection();
      const pdf = await getMaterialPdfById(connection, pdfId);
      if (!pdf) {
        throw createHttpError('PDF 不存在', 404);
      }

      if (await hasRunningJobsForPdf(connection, pdfId)) {
        throw createHttpError('该 PDF 正在处理任务中，暂时不能删除', 400);
      }

      const material = await getMaterialById(connection, pdf.materialId);
      const [thumbnailRows] = await connection.execute(
        `SELECT id, output_path AS outputPath, output_meta_json AS outputMetaJson
         FROM bt_material_thumbnails
         WHERE material_pdf_id = ?`,
        [pdfId]
      );
      const [videoRows] = await connection.execute(
        `SELECT id, output_path AS outputPath, output_meta_json AS outputMetaJson
         FROM bt_material_thumbnail_videos
         WHERE material_pdf_id = ?`,
        [pdfId]
      );
      const objectKeys = [
        pdf.sourceStorageKey,
        pdf.coverStorageKey,
        pdf.contentStorageKey,
        pdf.parseStorageKey,
        deriveSiblingObjectKey(pdf.parseStorageKey, 'pages.json'),
        pdf.structuredContentStorageKey
      ].filter(Boolean);
      thumbnailRows.forEach((thumbnailRow) => {
        collectThumbnailObjectKeys({
          outputPath: thumbnailRow.outputPath,
          outputMeta: safeJsonParse(thumbnailRow.outputMetaJson, {})
        }).forEach((key) => objectKeys.push(key));
      });
      videoRows.forEach((videoRow) => {
        collectThumbnailVideoObjectKeys({
          outputPath: videoRow.outputPath,
          outputMeta: safeJsonParse(videoRow.outputMetaJson, {})
        }).forEach((key) => objectKeys.push(key));
      });

      await connection.beginTransaction();
      try {
        await removeQueuedJobsForPdf(connection, pdfId);
        if (thumbnailRows.length) {
          const thumbnailIds = thumbnailRows.map((row) => Number(row.id));
          const placeholders = thumbnailIds.map(() => '?').join(', ');
          await connection.execute(
            `UPDATE bt_material_thumbnails
             SET derived_from_thumbnail_id = NULL
             WHERE derived_from_thumbnail_id IN (${placeholders})`,
            thumbnailIds
          );
          await connection.execute(
            `DELETE FROM bt_material_thumbnail_annotations
             WHERE thumbnail_id IN (${placeholders})`,
            thumbnailIds
          );
          await connection.execute(
            `DELETE FROM bt_material_thumbnails
             WHERE id IN (${placeholders})`,
            thumbnailIds
          );
        }
        if (videoRows.length) {
          const videoIds = videoRows.map((row) => Number(row.id));
          const videoPlaceholders = videoIds.map(() => '?').join(', ');
          await connection.execute(
            `DELETE FROM bt_material_thumbnail_videos
             WHERE id IN (${videoPlaceholders})`,
            videoIds
          );
        }
        await clearMaterialPdfPageContents(connection, pdfId);
        await connection.execute('DELETE FROM bt_material_pdfs WHERE id = ?', [pdfId]);
        await updateMaterialDerivedState(connection, pdf.materialId);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      if (objectKeys.length) {
        const ossClient = createOssClient(resolveOssConfig());
        await deleteOssObjects(ossClient, [...new Set(objectKeys)]);
      }

      if (material) {
        const refreshedMaterial = await getMaterialById(connection, material.id);
        if (refreshedMaterial) {
          await updateMaterialDerivedState(connection, material.id);
        }
      }

      res.json({ success: true });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      console.error('删除 PDF 失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials/:id/generate', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const requestedTypes = Array.isArray(req.body?.assetTypes) ? req.body.assetTypes : [];
      const assetTypes = requestedTypes.filter((assetType) => MATERIAL_ASSET_TYPES.includes(assetType));

      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      if (!assetTypes.length) {
        throw createHttpError('请至少选择一种附件类型', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      if (material.storageStatus !== MATERIAL_STORAGE_STATUS.READY) {
        throw createHttpError('教材目录迁移中，暂时不能制作附件', 400);
      }

      const [readyRows] = await connection.execute(
        `SELECT COUNT(*) AS total
         FROM bt_material_pdfs
         WHERE material_id = ? AND parse_status = ?`,
        [materialId, PDF_PARSE_STATUS.READY]
      );

      if (Number(readyRows[0]?.total || 0) <= 0) {
        throw createHttpError('需至少一个 PDF 解析完成后才能制作附件', 400);
      }

      if (assetTypes.includes('summary_image')) {
        const [structuredRows] = await connection.execute(
          `SELECT COUNT(*) AS total
           FROM bt_material_pdfs
           WHERE material_id = ? AND parse_status = ? AND structured_content_status = ?`,
          [materialId, PDF_PARSE_STATUS.READY, STRUCTURED_CONTENT_STATUS.READY]
        );

        if (Number(structuredRows[0]?.total || 0) <= 0) {
          throw createHttpError('需至少一个 PDF 完成关键内容提炼后才能制作摘要图', 400);
        }
      }

      await ensureMaterialAssetRows(connection, materialId);
      const generationErrors = [];
      let successCount = 0;

      for (const assetType of assetTypes) {
        try {
          await runMaterialAssetGeneration(connection, material, assetType, { projectRoot });
          successCount += 1;
        } catch (error) {
          await updateMaterialAssetRecord(connection, {
            materialId,
            assetType,
            status: MATERIAL_ASSET_STATUS.FAILED,
            lastMessage: error.message || `${MATERIAL_ASSET_LABELS[assetType]} 制作失败`
          });
          generationErrors.push(`${MATERIAL_ASSET_LABELS[assetType]}：${error.message || '制作失败'}`);
        }
      }

      if (generationErrors.length && successCount === 0) {
        throw createHttpError(generationErrors.join('；'), 500);
      }

      const refreshedMaterial = await getMaterialById(connection, materialId);
      const hydratedMaterials = await hydrateMaterials(connection, [refreshedMaterial]);

      res.json({
        success: true,
        data: hydratedMaterials[0],
        message: generationErrors.length
          ? `部分制作失败：${generationErrors.join('；')}`
          : '已提交附件制作请求'
      });
    } catch (error) {
      console.error('教材附件制作失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.delete('/api/material-library/materials/:id', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      if (!materialId) {
        throw createHttpError('教材 ID 无效', 400);
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);
      if (!material) {
        throw createHttpError('教材不存在', 404);
      }

      if (await hasRunningJobsForMaterial(connection, materialId)) {
        throw createHttpError('教材仍有后台任务在执行，暂时不能删除', 400);
      }

      const pdfRows = await listMaterialPdfsByMaterialIds(connection, [materialId]);
      const objectKeys = pdfRows.flatMap((pdf) => [
        pdf.sourceStorageKey,
        pdf.coverStorageKey,
        pdf.contentStorageKey,
        pdf.parseStorageKey,
        deriveSiblingObjectKey(pdf.parseStorageKey, 'pages.json'),
        pdf.structuredContentStorageKey
      ]).filter(Boolean);

      const [assetRows] = await connection.execute(
        `SELECT output_path AS outputPath, output_meta_json AS outputMetaJson
         FROM bt_material_assets
         WHERE material_id = ? AND output_path IS NOT NULL`,
        [materialId]
      );
      assetRows.forEach((asset) => {
        if (asset.outputPath) {
          objectKeys.push(asset.outputPath);
        }
        const outputMeta = safeJsonParse(asset.outputMetaJson, {});
        ['pngOutputPath', 'compressedJpgOutputPath'].forEach((key) => {
          if (outputMeta[key]) {
            objectKeys.push(outputMeta[key]);
          }
        });
      });

      const [thumbnailRows] = await connection.execute(
        `SELECT output_path AS outputPath, output_meta_json AS outputMetaJson
         FROM bt_material_thumbnails
         WHERE material_id = ?`,
        [materialId]
      );
      thumbnailRows.forEach((thumbnail) => {
        collectThumbnailObjectKeys({
          outputPath: thumbnail.outputPath,
          outputMeta: safeJsonParse(thumbnail.outputMetaJson, {})
        }).forEach((key) => objectKeys.push(key));
      });
      const [videoRows] = await connection.execute(
        `SELECT output_path AS outputPath, output_meta_json AS outputMetaJson
         FROM bt_material_thumbnail_videos
         WHERE material_id = ?`,
        [materialId]
      );
      videoRows.forEach((video) => {
        collectThumbnailVideoObjectKeys({
          outputPath: video.outputPath,
          outputMeta: safeJsonParse(video.outputMetaJson, {})
        }).forEach((key) => objectKeys.push(key));
      });
      const [audioRows] = await connection.execute(
        `SELECT output_path AS outputPath
         FROM bt_material_audios
         WHERE material_id = ?`,
        [materialId]
      );
      audioRows.forEach((audio) => {
        collectMaterialAudioObjectKeys({
          outputPath: audio.outputPath
        }).forEach((key) => objectKeys.push(key));
      });

      await connection.beginTransaction();
      try {
        await removeAllJobsForMaterial(connection, materialId);
        await connection.execute('DELETE FROM bt_material_thumbnail_annotations WHERE material_id = ?', [materialId]);
        await connection.execute('DELETE FROM bt_material_thumbnail_videos WHERE material_id = ?', [materialId]);
        await connection.execute('DELETE FROM bt_material_audios WHERE material_id = ?', [materialId]);
        await connection.execute('DELETE FROM bt_material_thumbnails WHERE material_id = ?', [materialId]);
        await connection.execute('DELETE FROM bt_material_assets WHERE material_id = ?', [materialId]);
        await connection.execute('DELETE FROM bt_material_pdf_page_contents WHERE material_id = ?', [materialId]);
        await connection.execute('DELETE FROM bt_material_pdfs WHERE material_id = ?', [materialId]);
        await connection.execute('DELETE FROM bt_materials WHERE id = ?', [materialId]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      if (objectKeys.length) {
        const ossClient = createOssClient(resolveOssConfig());
        await deleteOssObjects(ossClient, [...new Set(objectKeys)]);
      }

      res.json({ success: true });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback failures
        }
      }

      console.error('删除教材失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });
};
