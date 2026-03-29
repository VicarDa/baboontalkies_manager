import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import OSS from 'ali-oss';

const execFileAsync = promisify(execFile);

const MATERIAL_ASSET_TYPES = ['slide', 'audio', 'video', 'exercise', 'summary_image'];

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

const JOB_TYPES = {
  PARSE_PDF: 'parse_pdf',
  REPARSE_PDF: 'reparse_pdf',
  MOVE_MATERIAL_PREFIX: 'move_material_prefix'
};

const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const DEFAULT_JOB_MAX_ATTEMPTS = 3;
const JOB_POLL_INTERVAL_MS = 3000;
const JOB_STALE_RESET_MESSAGE = 'Worker restarted before task finished';
const MAX_UPLOAD_SIZE = 200 * 1024 * 1024;
const MAX_FILE_COUNT = 50;
const MATERIAL_OSS_ROOT_PREFIX = 'BaboonStudy/Material';
const PARSER_NAME = 'marker';

const PLACEHOLDER_MESSAGES = {
  slide: 'Slide 生成逻辑待补充',
  audio: '音频生成逻辑待补充',
  video: '视频生成逻辑待补充',
  exercise: '练习生成逻辑待补充',
  summary_image: '摘要图生成逻辑待补充'
};

let materialWorkerStarted = false;
let materialWorkerBusy = false;
let materialWorkerTimer = null;
let materialWorkerId = `material-worker-${process.pid}`;

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

const normalizeNullableId = (value) => {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  summary_image: createPlaceholderGenerator('summary_image')
};

const runMaterialAssetGeneration = async (connection, material, assetType) => {
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

  const result = await generator({ connection, material, assetType });

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
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`
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
      `ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${definitionSql}`
    );
  }
};

const ensureMaterialLibraryTables = async (connection, databaseName) => {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_groups (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(255) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_bt_material_groups_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

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
      KEY idx_bt_material_pdfs_parse_status (parse_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS bt_material_jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      job_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'queued',
      material_id BIGINT UNSIGNED NULL,
      material_pdf_id BIGINT UNSIGNED NULL,
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
      KEY idx_bt_material_jobs_pdf (material_pdf_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const enqueueJob = async (connection, {
  jobType,
  materialId = null,
  materialPdfId = null,
  payload = {},
  maxAttempts = DEFAULT_JOB_MAX_ATTEMPTS
}) => {
  const [result] = await connection.execute(
    `INSERT INTO bt_material_jobs (
      job_type, status, material_id, material_pdf_id, payload_json, attempts,
      max_attempts, worker_id, locked_at, started_at, finished_at, next_run_at, error_message
    ) VALUES (?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, NOW(), NULL)`,
    [
      jobType,
      JOB_STATUS.QUEUED,
      materialId,
      materialPdfId,
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

const formatPdfRow = (row) => {
  return {
    id: row.id,
    materialId: row.materialId,
    sortOrder: Number(row.sortOrder || 0),
    storageSequence: Number(row.storageSequence || 0),
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
      outputUrl: asset.outputPath ? buildLocalPublicUrl(asset.outputPath) : null,
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

  const pdfsByMaterialId = new Map();
  pdfRows.forEach((row) => {
    if (!pdfsByMaterialId.has(row.materialId)) {
      pdfsByMaterialId.set(row.materialId, []);
    }
    pdfsByMaterialId.get(row.materialId).push(row);
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

const uploadLocalFileToOss = async (client, ossConfig, localPath, objectKey, contentType) => {
  await client.put(objectKey, localPath, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
      'x-oss-object-acl': 'public-read'
    }
  });

  return buildOssPublicUrl(ossConfig, objectKey);
};

const downloadOssFileToLocal = async (client, objectKey, localPath) => {
  await client.get(objectKey, localPath);
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

const runMaterialParser = async ({ projectRoot, inputPdfPath, outputDir }) => {
  const scriptPath = getMaterialParserScriptPath(projectRoot);
  try {
    const { stdout } = await execFileAsync(
      'python3',
      [scriptPath, '--input', inputPdfPath, '--output-dir', outputDir],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          TORCH_DEVICE: 'cpu'
        },
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

const claimNextQueuedJob = async (connection, workerId) => {
  let rows;
  try {
    await connection.beginTransaction();

    try {
      [rows] = await connection.execute(
        `SELECT id, job_type AS jobType, status, material_id AS materialId, material_pdf_id AS materialPdfId,
                payload_json AS payloadJson, attempts, max_attempts AS maxAttempts
         FROM bt_material_jobs
         WHERE status = ? AND next_run_at <= NOW()
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [JOB_STATUS.QUEUED]
      );
    } catch (_error) {
      [rows] = await connection.execute(
        `SELECT id, job_type AS jobType, status, material_id AS materialId, material_pdf_id AS materialPdfId,
                payload_json AS payloadJson, attempts, max_attempts AS maxAttempts
         FROM bt_material_jobs
         WHERE status = ? AND next_run_at <= NOW()
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
        [JOB_STATUS.QUEUED]
      );
    }

    if (!rows.length) {
      await connection.commit();
      return null;
    }

    const job = rows[0];
    await connection.execute(
      `UPDATE bt_material_jobs
       SET status = ?, attempts = attempts + 1, worker_id = ?, locked_at = NOW(), started_at = NOW(), finished_at = NULL
       WHERE id = ?`,
      [JOB_STATUS.RUNNING, workerId, job.id]
    );

    await connection.commit();

    return {
      ...job,
      attempts: Number(job.attempts || 0) + 1,
      maxAttempts: Number(job.maxAttempts || DEFAULT_JOB_MAX_ATTEMPTS),
      payload: safeJsonParse(job.payloadJson, {})
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_rollbackError) {
      // ignore rollback failures
    }
    throw error;
  }
};

const completeJob = async (connection, jobId) => {
  await connection.execute(
    `UPDATE bt_material_jobs
     SET status = ?, worker_id = NULL, locked_at = NULL, finished_at = NOW(), error_message = NULL
     WHERE id = ?`,
    [JOB_STATUS.COMPLETED, jobId]
  );
};

const failOrRetryJob = async (connection, job, error) => {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.maxAttempts || DEFAULT_JOB_MAX_ATTEMPTS);
  const shouldRetry = attempts < maxAttempts;
  const retryDelaySeconds = Number(error.retryDelaySeconds || 30 * attempts || 30);

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

const handleParsePdfJob = async ({ job, connection, projectRoot }) => {
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
    error_message: null
  });
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

      await updateMaterialPdfResult(connection, pdf.id, {
        source_storage_key: sourceStorageKey,
        source_url: sourceUrl,
        legacy_local_path: null,
        upload_status: PDF_UPLOAD_STATUS.UPLOADED
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

    const coverUrl = await uploadLocalFileToOss(ossClient, ossConfig, coverPath, coverStorageKey, 'image/png');
    const contentUrl = await uploadLocalFileToOss(ossClient, ossConfig, contentPath, contentStorageKey, 'text/markdown; charset=utf-8');
    const parseUrl = await uploadLocalFileToOss(ossClient, ossConfig, parseJsonPath, parseStorageKey, 'application/json; charset=utf-8');

    await updateMaterialPdfResult(connection, pdf.id, {
      cover_storage_key: coverStorageKey,
      cover_url: coverUrl,
      content_storage_key: contentStorageKey,
      content_url: contentUrl,
      parse_storage_key: parseStorageKey,
      parse_url: parseUrl,
      parser_name: parserName,
      parser_version: parserVersion,
      page_count: pageCount,
      parse_status: PDF_PARSE_STATUS.READY,
      error_message: null,
      parsed_at: new Date()
    });

    await updateMaterialDerivedState(connection, material.id);
  } catch (error) {
    await updateMaterialPdfResult(connection, pdf.id, {
      parse_status: PDF_PARSE_STATUS.FAILED,
      error_message: error.message || '解析失败'
    });
    await updateMaterialDerivedState(connection, material.id);
    throw error;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
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
              content_storage_key AS contentStorageKey, parse_storage_key AS parseStorageKey
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

      await connection.execute(
        `UPDATE bt_material_pdfs
         SET source_storage_key = ?, source_url = ?,
             cover_storage_key = ?, cover_url = ?,
             content_storage_key = ?, content_url = ?,
             parse_storage_key = ?, parse_url = ?
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
          pdf.id
        ]
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
      await handleParsePdfJob({ job, connection, projectRoot });
    } else if (job.jobType === JOB_TYPES.MOVE_MATERIAL_PREFIX) {
      await handleMoveMaterialPrefixJob({ job, connection });
    } else {
      throw createHttpError(`未知任务类型: ${job.jobType}`, 500);
    }

    await completeJob(connection, job.id);
  } catch (error) {
    console.error('教材任务执行失败:', job, error);

    if (connection) {
      try {
        await failOrRetryJob(connection, job, error);
      } catch (updateError) {
        console.error('教材任务状态回写失败:', updateError);
      }
    }
  } finally {
    if (connection) {
      await connection.end();
    }
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
  try {
    await pollMaterialJobs({ getDbConnection, projectRoot });
  } catch (error) {
    console.error('教材任务轮询失败，将在下一轮重试:', error);
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
  await safelyPollMaterialJobs({ getDbConnection, projectRoot });
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
  await ensureDirectory(uploadDir);

  {
    let connection;
    try {
      connection = await getDbConnection();
      await ensureMaterialLibraryTables(connection, databaseName);
      await migrateLegacyMaterialRows({ connection, projectRoot });
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  await startMaterialWorker({ getDbConnection, projectRoot });

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
          pdfParseStatuses: PDF_PARSE_STATUS
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
      let nextStorageSequence = 1;
      let nextPdfSortOrder = 10;

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

        const [pdfResult] = await connection.execute(
          `INSERT INTO bt_material_pdfs (
            material_id, sort_order, storage_sequence, display_name, original_file_name,
            source_mime_type, source_size, source_storage_key, source_url, legacy_local_path,
            upload_status, parse_status, parser_name, parser_version, page_count, error_message, parsed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
          [
            materialId,
            nextPdfSortOrder,
            storageSequence,
            displayName,
            file.originalname,
            file.mimetype || 'application/pdf',
            file.size || 0,
            sourceStorageKey,
            sourceUrl,
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

        nextPdfSortOrder += 10;
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

      await connection.beginTransaction();

      let nextStorageSequence = await getNextPdfStorageSequence(connection, materialId);
      let nextPdfSortOrder = await getNextPdfSortOrder(connection, materialId);

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

        const [pdfResult] = await connection.execute(
          `INSERT INTO bt_material_pdfs (
            material_id, sort_order, storage_sequence, display_name, original_file_name,
            source_mime_type, source_size, source_storage_key, source_url, legacy_local_path,
            upload_status, parse_status, parser_name, parser_version, page_count, error_message, parsed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
          [
            materialId,
            nextPdfSortOrder,
            storageSequence,
            displayName,
            file.originalname,
            file.mimetype || 'application/pdf',
            file.size || 0,
            sourceStorageKey,
            sourceUrl,
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

        nextPdfSortOrder += 10;
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

      if (await hasPendingParseJob(connection, pdfId)) {
        return res.json({ success: true, message: '该 PDF 已存在待处理解析任务' });
      }

      await connection.beginTransaction();
      await updateMaterialPdfResult(connection, pdf.id, {
        parse_status: PDF_PARSE_STATUS.QUEUED,
        error_message: null
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
      const objectKeys = [
        pdf.sourceStorageKey,
        pdf.coverStorageKey,
        pdf.contentStorageKey,
        pdf.parseStorageKey
      ].filter(Boolean);

      await connection.beginTransaction();
      await removeQueuedJobsForPdf(connection, pdfId);
      await connection.execute('DELETE FROM bt_material_pdfs WHERE id = ?', [pdfId]);
      await updateMaterialDerivedState(connection, pdf.materialId);
      await connection.commit();

      if (objectKeys.length) {
        const ossClient = createOssClient(resolveOssConfig());
        await deleteOssObjects(ossClient, objectKeys);
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

      await ensureMaterialAssetRows(connection, materialId);

      for (const assetType of assetTypes) {
        try {
          await runMaterialAssetGeneration(connection, material, assetType);
        } catch (error) {
          await updateMaterialAssetRecord(connection, {
            materialId,
            assetType,
            status: MATERIAL_ASSET_STATUS.FAILED,
            lastMessage: error.message || `${MATERIAL_ASSET_LABELS[assetType]} 制作失败`
          });
        }
      }

      const refreshedMaterial = await getMaterialById(connection, materialId);
      const hydratedMaterials = await hydrateMaterials(connection, [refreshedMaterial]);

      res.json({
        success: true,
        data: hydratedMaterials[0],
        message: '已提交附件制作请求'
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
        pdf.parseStorageKey
      ]).filter(Boolean);

      await connection.beginTransaction();
      await removeAllJobsForMaterial(connection, materialId);
      await connection.execute('DELETE FROM bt_material_assets WHERE material_id = ?', [materialId]);
      await connection.execute('DELETE FROM bt_material_pdfs WHERE material_id = ?', [materialId]);
      await connection.execute('DELETE FROM bt_materials WHERE id = ?', [materialId]);
      await connection.commit();

      if (objectKeys.length) {
        const ossClient = createOssClient(resolveOssConfig());
        await deleteOssObjects(ossClient, objectKeys);
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
