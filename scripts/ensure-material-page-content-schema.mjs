import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

import { ensureMaterialPdfContentTables } from '../src/modules/material-library.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '34.87.145.27',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'dev',
  password: process.env.MYSQL_PASSWORD || '3.@d?*|X|GLc;0%z',
  database: process.env.MYSQL_DATABASE || 'baboon'
});

try {
  const databaseName = process.env.MYSQL_DATABASE || 'baboon';
  const result = await ensureMaterialPdfContentTables(connection, databaseName);
  console.log(JSON.stringify({
    success: true,
    databaseName,
    result
  }, null, 2));
} finally {
  await connection.end();
}
