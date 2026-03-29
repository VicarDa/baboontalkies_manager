import { promises as fsp } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

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
  const protectedKeys = new Set(Object.keys(process.env));
  const envFiles = ['.env', '.env.local'];

  for (const fileName of envFiles) {
    const envPath = path.resolve(cwd, fileName);
    const parsed = await readEnvFile(envPath);
    if (!parsed) continue;

    Object.entries(parsed).forEach(([key, value]) => {
      if (protectedKeys.has(key)) return;
      process.env[key] = value;
    });
  }
};
