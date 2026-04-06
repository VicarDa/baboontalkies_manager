import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const MATERIAL_PDF_PAGES_TABLE = 'bt_material_pdf_pages';
const MATERIAL_PDF_PAGE_CONTENTS_TABLE = 'bt_material_pdf_page_contents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const normalizeText = (value) => String(value ?? '').trim();

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '34.87.145.27',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'dev',
  password: process.env.MYSQL_PASSWORD || '3.@d?*|X|GLc;0%z',
  database: process.env.MYSQL_DATABASE || 'baboon'
});

try {
  const [currentColumns] = await connection.execute(
    `SELECT COLUMN_NAME AS columnName
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION ASC`,
    [process.env.MYSQL_DATABASE || 'baboon', MATERIAL_PDF_PAGE_CONTENTS_TABLE]
  );
  const currentColumnNames = currentColumns.map((column) => column.columnName);
  const hasExplainText = currentColumnNames.includes('explain_text');
  const hasExplainAudio = currentColumnNames.includes('explain_audio');

  const [pageStatsRows] = await connection.execute(
    `SELECT COUNT(*) AS totalPages FROM \`${MATERIAL_PDF_PAGES_TABLE}\``
  );
  const [segmentStatsRows] = await connection.execute(
    `SELECT COUNT(*) AS totalSegments FROM \`${MATERIAL_PDF_PAGE_CONTENTS_TABLE}\``
  );

  let explainedSegmentRows = [{ explainedSegments: 0 }];
  if (hasExplainText || hasExplainAudio) {
    const explainConditions = [];
    if (hasExplainText) {
      explainConditions.push(`COALESCE(TRIM(explain_text), '') <> ''`);
    }
    if (hasExplainAudio) {
      explainConditions.push(`COALESCE(TRIM(explain_audio), '') <> ''`);
    }
    [explainedSegmentRows] = await connection.execute(
      `SELECT COUNT(*) AS explainedSegments
       FROM \`${MATERIAL_PDF_PAGE_CONTENTS_TABLE}\`
       WHERE ${explainConditions.join(' OR ')}`
    );
  }

  const [pageRows] = await connection.execute(
    `SELECT material_pdf_id AS materialPdfId, page, title
     FROM \`${MATERIAL_PDF_PAGES_TABLE}\`
     ORDER BY material_pdf_id ASC, page ASC`
  );
  const [segmentRows] = await connection.execute(
    `SELECT material_pdf_id AS materialPdfId, page, seg, seg_text AS segText, seg_pic AS segPic
     FROM \`${MATERIAL_PDF_PAGE_CONTENTS_TABLE}\`
     ORDER BY material_pdf_id ASC, page ASC, seg ASC`
  );

  const segmentCountByPageKey = new Map();
  for (const row of segmentRows) {
    const key = `${row.materialPdfId}:${row.page}`;
    segmentCountByPageKey.set(key, (segmentCountByPageKey.get(key) || 0) + 1);
  }

  const segmentDistribution = pageRows.map((pageRow) => {
    const key = `${pageRow.materialPdfId}:${pageRow.page}`;
    return {
      materialPdfId: Number(pageRow.materialPdfId || 0),
      page: Number(pageRow.page || 0),
      title: normalizeText(pageRow.title),
      segmentCount: Number(segmentCountByPageKey.get(key) || 0)
    };
  });

  console.log(JSON.stringify({
    success: true,
    migratedSchema: ['seg_text', 'seg_pic', 'explain_text', 'explain_audio']
      .every((columnName) => currentColumnNames.includes(columnName)),
    currentColumns: currentColumnNames,
    totalPages: Number(pageStatsRows[0]?.totalPages || 0),
    totalSegments: Number(segmentStatsRows[0]?.totalSegments || 0),
    explainedSegments: Number(explainedSegmentRows[0]?.explainedSegments || 0),
    pagesWithoutSegments: segmentDistribution.filter((pageRow) => pageRow.segmentCount <= 0),
    segmentDistribution
  }, null, 2));
} finally {
  await connection.end();
}
