import { promises as fsp } from 'fs';
import path from 'path';
import multer from 'multer';

const MATERIAL_ASSET_TYPES = ['slide', 'audio', 'video', 'exercise'];

const MATERIAL_ASSET_LABELS = {
  slide: 'Slide',
  audio: '音频',
  video: '视频',
  exercise: '练习'
};

const MATERIAL_ASSET_STATUS = {
  NOT_STARTED: 'not_started',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed'
};

const PLACEHOLDER_MESSAGES = {
  slide: 'Slide 生成逻辑待补充',
  audio: '音频生成逻辑待补充',
  video: '视频生成逻辑待补充',
  exercise: '练习生成逻辑待补充'
};

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024;

const safeJsonParse = (value, fallback = {}) => {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
};

const normalizeNullableId = (value) => {
  if (value === undefined || value === null || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sanitizeFileStem = (input = '') => {
  const stem = String(input)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return stem || 'material';
};

const ensureDirectory = async (targetDir) => {
  await fsp.mkdir(targetDir, { recursive: true });
};

const cleanupUploadedFile = async (file) => {
  if (!file?.path) return;

  try {
    await fsp.unlink(file.path);
  } catch (_error) {
    // ignore cleanup failures
  }
};

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const buildPublicFileUrl = (relativePath) => {
  if (!relativePath) return null;
  return `/${String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '')}`;
};

const formatMaterialRow = (row, assetRows = []) => {
  const assetStatus = {};

  MATERIAL_ASSET_TYPES.forEach((assetType) => {
    assetStatus[assetType] = {
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

  assetRows.forEach((asset) => {
    assetStatus[asset.assetType] = {
      type: asset.assetType,
      label: MATERIAL_ASSET_LABELS[asset.assetType],
      status: asset.status || MATERIAL_ASSET_STATUS.NOT_STARTED,
      outputPath: asset.outputPath || null,
      outputUrl: buildPublicFileUrl(asset.outputPath),
      outputMeta: safeJsonParse(asset.outputMetaJson, {}),
      lastMessage: asset.lastMessage || '',
      generatedAt: asset.generatedAt || null
    };
  });

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    groupId: row.groupId === null || row.groupId === undefined ? null : Number(row.groupId),
    groupName: row.groupName || '',
    sortOrder: Number(row.sortOrder || 0),
    originalFileName: row.originalFileName,
    storedFileName: row.storedFileName,
    filePath: row.filePath,
    fileUrl: buildPublicFileUrl(row.filePath),
    fileSize: Number(row.fileSize || 0),
    mimeType: row.mimeType || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assetStatus
  };
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
  exercise: createPlaceholderGenerator('exercise')
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
      const parsed = path.parse(file.originalname || 'material');
      const safeName = sanitizeFileStem(parsed.name);
      const extension = parsed.ext || '';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      callback(null, `${safeName}-${uniqueSuffix}${extension}`);
    }
  });

  return multer({
    storage,
    limits: {
      fileSize: MAX_UPLOAD_SIZE
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

const getNextSortOrder = async (connection, groupId) => {
  const { clause, params } = getGroupWhereClause(groupId);
  const [rows] = await connection.execute(
    `SELECT COALESCE(MAX(sort_order), 0) as maxSortOrder
     FROM bt_materials
     WHERE ${clause}`,
    params
  );

  return Number(rows[0]?.maxSortOrder || 0) + 10;
};

const getNextGroupSortOrder = async (connection) => {
  const [rows] = await connection.execute(
    'SELECT COALESCE(MAX(sort_order), 0) as maxSortOrder FROM bt_material_groups'
  );

  return Number(rows[0]?.maxSortOrder || 0) + 10;
};

const getMaterialById = async (connection, materialId) => {
  const [rows] = await connection.execute(
    `SELECT m.id, m.title, m.description, m.group_id AS groupId, m.sort_order AS sortOrder,
            m.original_file_name AS originalFileName, m.stored_file_name AS storedFileName,
            m.file_path AS filePath, m.file_size AS fileSize, m.mime_type AS mimeType,
            m.created_at AS createdAt, m.updated_at AS updatedAt, g.name AS groupName
     FROM bt_materials m
     LEFT JOIN bt_material_groups g ON g.id = m.group_id
     WHERE m.id = ?`,
    [materialId]
  );

  return rows[0] || null;
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

const updateMaterialAssetRecord = async (connection, { materialId, assetType, status, outputPath = null, outputMeta = {}, lastMessage = '', generatedAt = null }) => {
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

const runMaterialAssetGeneration = async (connection, material, assetType) => {
  const generator = materialAssetGenerators[assetType];
  if (!generator) {
    throw new Error(`不支持的附件类型: ${assetType}`);
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

export const getMaterialLibraryUploadDir = (projectRoot) => {
  return path.resolve(projectRoot, 'uploads', 'materials');
};

const ensureMaterialLibraryTables = async (getDbConnection) => {
  let connection;

  try {
    connection = await getDbConnection();

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
        original_file_name VARCHAR(255) NOT NULL,
        stored_file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
        mime_type VARCHAR(120) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_bt_materials_group_sort (group_id, sort_order),
        KEY idx_bt_materials_title (title)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

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
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

export const registerMaterialLibraryRoutes = async ({
  app,
  getDbConnection,
  projectRoot
}) => {
  const uploadDir = getMaterialLibraryUploadDir(projectRoot);
  await ensureDirectory(uploadDir);
  await ensureMaterialLibraryTables(getDbConnection);

  const materialUpload = createMaterialUpload(uploadDir);
  const handleMaterialUpload = (req, res, next) => {
    materialUpload.single('file')(req, res, (error) => {
      if (!error) {
        return next();
      }

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, error: '教材文件不能超过 200MB' });
        }
        return res.status(400).json({ success: false, error: error.message });
      }

      return res.status(400).json({ success: false, error: error.message || '教材上传失败' });
    });
  };

  app.get('/api/material-library/groups', async (_req, res) => {
    let connection;

    try {
      connection = await getDbConnection();
      const [rows] = await connection.execute(
        `SELECT g.id, g.name, g.description, g.sort_order AS sortOrder,
                g.created_at AS createdAt, g.updated_at AS updatedAt,
                COUNT(m.id) AS materialCount
         FROM bt_material_groups g
         LEFT JOIN bt_materials m ON m.group_id = g.id
         GROUP BY g.id
         ORDER BY g.sort_order ASC, g.id ASC`
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('获取教材组失败:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/groups', async (req, res) => {
    let connection;

    try {
      const name = String(req.body?.name || '').trim();
      const description = String(req.body?.description || '').trim();

      if (!name) {
        return res.status(400).json({ success: false, error: '教材组名称不能为空' });
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
      const message = error.code === 'ER_DUP_ENTRY' ? '教材组名称已存在' : error.message;
      const statusCode = error.code === 'ER_DUP_ENTRY' ? 400 : (error.statusCode || 500);
      res.status(statusCode).json({ success: false, error: message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.put('/api/material-library/groups/:id', async (req, res) => {
    let connection;

    try {
      const groupId = Number.parseInt(req.params.id, 10);
      const name = String(req.body?.name || '').trim();
      const description = String(req.body?.description || '').trim();

      if (!groupId) {
        return res.status(400).json({ success: false, error: '教材组 ID 无效' });
      }

      if (!name) {
        return res.status(400).json({ success: false, error: '教材组名称不能为空' });
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
      const message = error.code === 'ER_DUP_ENTRY' ? '教材组名称已存在' : error.message;
      const statusCode = error.code === 'ER_DUP_ENTRY' ? 400 : (error.statusCode || 500);
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
        return res.status(400).json({ success: false, error: '教材组 ID 无效' });
      }

      connection = await getDbConnection();
      const [materialRows] = await connection.execute(
        'SELECT COUNT(*) AS total FROM bt_materials WHERE group_id = ?',
        [groupId]
      );

      if (Number(materialRows[0]?.total || 0) > 0) {
        return res.status(400).json({ success: false, error: '该教材组下仍有教材，无法删除' });
      }

      await connection.execute('DELETE FROM bt_material_groups WHERE id = ?', [groupId]);
      res.json({ success: true });
    } catch (error) {
      console.error('删除教材组失败:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.get('/api/material-library/materials', async (req, res) => {
    let connection;

    try {
      const keyword = String(req.query?.keyword || '').trim();
      const rawGroupId = req.query?.groupId;
      connection = await getDbConnection();

      const filters = [];
      const params = [];

      if (keyword) {
        filters.push('(m.title LIKE ? OR m.original_file_name LIKE ? OR m.description LIKE ?)');
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      if (rawGroupId === 'ungrouped') {
        filters.push('m.group_id IS NULL');
      } else {
        const groupId = normalizeNullableId(rawGroupId);
        if (groupId !== null) {
          filters.push('m.group_id = ?');
          params.push(groupId);
        }
      }

      const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

      const [groupRows] = await connection.execute(
        `SELECT g.id, g.name, g.description, g.sort_order AS sortOrder,
                g.created_at AS createdAt, g.updated_at AS updatedAt,
                COUNT(m.id) AS materialCount
         FROM bt_material_groups g
         LEFT JOIN bt_materials m ON m.group_id = g.id
         GROUP BY g.id
         ORDER BY g.sort_order ASC, g.id ASC`
      );

      const [materialRows] = await connection.execute(
        `SELECT m.id, m.title, m.description, m.group_id AS groupId, m.sort_order AS sortOrder,
                m.original_file_name AS originalFileName, m.stored_file_name AS storedFileName,
                m.file_path AS filePath, m.file_size AS fileSize, m.mime_type AS mimeType,
                m.created_at AS createdAt, m.updated_at AS updatedAt, g.name AS groupName
         FROM bt_materials m
         LEFT JOIN bt_material_groups g ON g.id = m.group_id
         ${whereClause}
         ORDER BY
           CASE WHEN m.group_id IS NULL THEN 0 ELSE 1 END ASC,
           COALESCE(g.sort_order, 999999) ASC,
           COALESCE(m.sort_order, 999999) ASC,
           m.id ASC`,
        params
      );

      const materialIds = materialRows.map((row) => row.id);
      let assetRows = [];

      if (materialIds.length) {
        const placeholders = materialIds.map(() => '?').join(', ');
        const [rows] = await connection.execute(
          `SELECT material_id AS materialId, asset_type AS assetType, status,
                  output_path AS outputPath, output_meta_json AS outputMetaJson,
                  last_message AS lastMessage, generated_at AS generatedAt
           FROM bt_material_assets
           WHERE material_id IN (${placeholders})`,
          materialIds
        );
        assetRows = rows;
      }

      const assetsByMaterialId = new Map();
      assetRows.forEach((asset) => {
        const materialId = Number(asset.materialId);
        if (!assetsByMaterialId.has(materialId)) {
          assetsByMaterialId.set(materialId, []);
        }
        assetsByMaterialId.get(materialId).push(asset);
      });

      const materials = materialRows.map((row) => {
        return formatMaterialRow(row, assetsByMaterialId.get(row.id) || []);
      });

      res.json({
        success: true,
        data: {
          groups: groupRows,
          materials,
          assetTypes: MATERIAL_ASSET_TYPES,
          assetLabels: MATERIAL_ASSET_LABELS
        }
      });
    } catch (error) {
      console.error('获取教材列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.post('/api/material-library/materials/upload', handleMaterialUpload, async (req, res) => {
    let connection;

    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '请先选择教材文件' });
      }

      const groupId = normalizeNullableId(req.body?.groupId);
      const description = String(req.body?.description || '').trim();
      const rawTitle = String(req.body?.title || '').trim();
      const parsed = path.parse(req.file.originalname || req.file.filename || '教材');
      const title = rawTitle || parsed.name || '未命名教材';

      connection = await getDbConnection();
      await assertGroupExists(connection, groupId);

      const sortOrder = await getNextSortOrder(connection, groupId);
      const relativeFilePath = path.relative(projectRoot, req.file.path);
      const [result] = await connection.execute(
        `INSERT INTO bt_materials (
          title, description, group_id, sort_order, original_file_name,
          stored_file_name, file_path, file_size, mime_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          description || null,
          groupId,
          sortOrder,
          req.file.originalname,
          req.file.filename,
          relativeFilePath,
          req.file.size || 0,
          req.file.mimetype || null
        ]
      );

      await ensureMaterialAssetRows(connection, result.insertId);
      const material = await getMaterialById(connection, result.insertId);

      res.json({
        success: true,
        data: formatMaterialRow(material)
      });
    } catch (error) {
      await cleanupUploadedFile(req.file);
      console.error('上传教材失败:', error);
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.put('/api/material-library/materials/:id', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const nextGroupId = normalizeNullableId(req.body?.groupId);

      if (!materialId) {
        return res.status(400).json({ success: false, error: '教材 ID 无效' });
      }

      if (!title) {
        return res.status(400).json({ success: false, error: '教材名称不能为空' });
      }

      connection = await getDbConnection();
      const existingMaterial = await getMaterialById(connection, materialId);

      if (!existingMaterial) {
        return res.status(404).json({ success: false, error: '教材不存在' });
      }

      await assertGroupExists(connection, nextGroupId);

      let sortOrder = Number(existingMaterial.sortOrder || 0);
      const currentGroupId = normalizeNullableId(existingMaterial.groupId);
      if (currentGroupId !== nextGroupId) {
        sortOrder = await getNextSortOrder(connection, nextGroupId);
      }

      await connection.execute(
        `UPDATE bt_materials
         SET title = ?, description = ?, group_id = ?, sort_order = ?
         WHERE id = ?`,
        [title, description || null, nextGroupId, sortOrder, materialId]
      );

      const updatedMaterial = await getMaterialById(connection, materialId);
      const [assetRows] = await connection.execute(
        `SELECT material_id AS materialId, asset_type AS assetType, status,
                output_path AS outputPath, output_meta_json AS outputMetaJson,
                last_message AS lastMessage, generated_at AS generatedAt
         FROM bt_material_assets
         WHERE material_id = ?`,
        [materialId]
      );

      res.json({
        success: true,
        data: formatMaterialRow(updatedMaterial, assetRows)
      });
    } catch (error) {
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
        return res.status(400).json({ success: false, error: '教材 ID 无效' });
      }

      if (!['up', 'down'].includes(direction)) {
        return res.status(400).json({ success: false, error: '排序方向无效' });
      }

      connection = await getDbConnection();
      const currentMaterial = await getMaterialById(connection, materialId);

      if (!currentMaterial) {
        return res.status(404).json({ success: false, error: '教材不存在' });
      }

      const groupId = normalizeNullableId(currentMaterial.groupId);
      const { clause, params } = getGroupWhereClause(groupId);
      const compareOperator = direction === 'up' ? '<' : '>';
      const orderDirection = direction === 'up' ? 'DESC' : 'ASC';
      const [siblings] = await connection.execute(
        `SELECT id, sort_order AS sortOrder
         FROM bt_materials
         WHERE ${clause} AND sort_order ${compareOperator} ?
         ORDER BY sort_order ${orderDirection}
         LIMIT 1`,
        [...params, Number(currentMaterial.sortOrder || 0)]
      );

      const targetMaterial = siblings[0];
      if (!targetMaterial) {
        return res.json({ success: true, data: { moved: false } });
      }

      await connection.beginTransaction();
      await connection.execute(
        'UPDATE bt_materials SET sort_order = ? WHERE id = ?',
        [Number(targetMaterial.sortOrder || 0), materialId]
      );
      await connection.execute(
        'UPDATE bt_materials SET sort_order = ? WHERE id = ?',
        [Number(currentMaterial.sortOrder || 0), targetMaterial.id]
      );
      await connection.commit();

      res.json({ success: true, data: { moved: true } });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_rollbackError) {
          // ignore rollback error
        }
      }
      console.error('教材排序失败:', error);
      res.status(500).json({ success: false, error: error.message });
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
        return res.status(400).json({ success: false, error: '教材 ID 无效' });
      }

      if (!assetTypes.length) {
        return res.status(400).json({ success: false, error: '请至少选择一种附件类型' });
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);

      if (!material) {
        return res.status(404).json({ success: false, error: '教材不存在' });
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
      const [assetRows] = await connection.execute(
        `SELECT material_id AS materialId, asset_type AS assetType, status,
                output_path AS outputPath, output_meta_json AS outputMetaJson,
                last_message AS lastMessage, generated_at AS generatedAt
         FROM bt_material_assets
         WHERE material_id = ?`,
        [materialId]
      );

      res.json({
        success: true,
        data: formatMaterialRow(refreshedMaterial, assetRows),
        message: '已提交附件制作请求'
      });
    } catch (error) {
      console.error('教材附件制作失败:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });

  app.delete('/api/material-library/materials/:id', async (req, res) => {
    let connection;

    try {
      const materialId = Number.parseInt(req.params.id, 10);
      if (!materialId) {
        return res.status(400).json({ success: false, error: '教材 ID 无效' });
      }

      connection = await getDbConnection();
      const material = await getMaterialById(connection, materialId);

      if (!material) {
        return res.status(404).json({ success: false, error: '教材不存在' });
      }

      const [assetRows] = await connection.execute(
        'SELECT output_path AS outputPath FROM bt_material_assets WHERE material_id = ?',
        [materialId]
      );

      await connection.execute('DELETE FROM bt_material_assets WHERE material_id = ?', [materialId]);
      await connection.execute('DELETE FROM bt_materials WHERE id = ?', [materialId]);

      const filesToRemove = [material.filePath, ...assetRows.map((row) => row.outputPath)].filter(Boolean);
      await Promise.all(filesToRemove.map(async (relativePath) => {
        const absolutePath = path.resolve(projectRoot, relativePath);
        try {
          await fsp.unlink(absolutePath);
        } catch (_error) {
          // ignore file cleanup failures
        }
      }));

      res.json({ success: true });
    } catch (error) {
      console.error('删除教材失败:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
    }
  });
};
