import { promises as fsp } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ENV_BASE_DIR = path.resolve(__dirname, '..');

const readEnvFile = async (filePath) => {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    return dotenv.parse(content);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const loadLocalEnv = async (cwd = process.cwd()) => {
  const protectedKeys = new Set(
    Object.entries(process.env)
      .filter(([, value]) => String(value ?? '').trim() !== '')
      .map(([key]) => key)
  );
  const envFiles = ['.env', '.env.local'];
  const candidateDirs = Array.from(new Set([
    path.resolve(cwd),
    DEFAULT_ENV_BASE_DIR
  ]));

  for (const baseDir of candidateDirs) {
    for (const fileName of envFiles) {
      const envPath = path.resolve(baseDir, fileName);
      const parsed = await readEnvFile(envPath);
      if (!parsed) continue;

      Object.entries(parsed).forEach(([key, value]) => {
        if (protectedKeys.has(key)) return;
        process.env[key] = value;
      });
    }
  }
};
