import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const browsersPath = path.join(projectRoot, '.playwright-browsers');
const playwrightCli = path.join(projectRoot, 'node_modules', 'playwright', 'cli.js');

if (!existsSync(playwrightCli)) {
  console.error('Playwright is not installed. Run npm install first.');
  process.exit(1);
}

await mkdir(browsersPath, { recursive: true });

console.log(`Installing Playwright Chromium into ${browsersPath}`);

const child = spawn(
  process.execPath,
  [playwrightCli, 'install', 'chromium'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath
    }
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Playwright browser install was interrupted by ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
