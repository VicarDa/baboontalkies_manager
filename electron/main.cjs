const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

app.commandLine.appendSwitch('in-process-gpu');

let mainWindow = null;
let dashboardServer = null;

const toFileUrl = (filePath) => pathToFileURL(filePath).href;

const getProjectRoot = () => path.resolve(__dirname, '..');

const getRuntimeCwd = () => (
  app.isPackaged ? path.dirname(app.getPath('exe')) : getProjectRoot()
);

const getBundledPlaywrightBrowsersPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'playwright-browsers');
  }

  const localBrowsersPath = path.join(getProjectRoot(), '.playwright-browsers');
  return fs.existsSync(localBrowsersPath) ? localBrowsersPath : null;
};

const getEnvCandidateDirs = () => {
  const dirs = [
    process.cwd(),
    path.dirname(app.getPath('exe')),
    app.getPath('userData'),
    getProjectRoot()
  ];

  return Array.from(new Set(dirs.filter(Boolean)));
};

const loadEnvFiles = async () => {
  const { loadLocalEnv } = await import(toFileUrl(path.join(getProjectRoot(), 'src', 'load-env.js')));

  for (const envDir of getEnvCandidateDirs()) {
    await loadLocalEnv(envDir);
  }
};

const normalizePort = (value) => {
  const port = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
};

const startDashboardServer = async () => {
  process.chdir(getRuntimeCwd());
  process.env.HTTPS = 'false';
  process.env.BT_ELECTRON = 'true';

  await loadEnvFiles();

  process.env.BT_RUNTIME_DATA_DIR = process.env.BT_RUNTIME_DATA_DIR || path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(process.env.BT_RUNTIME_DATA_DIR, { recursive: true });

  const bundledPlaywrightBrowsersPath = getBundledPlaywrightBrowsersPath();
  if (app.isPackaged && bundledPlaywrightBrowsersPath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledPlaywrightBrowsersPath;
  } else if (!process.env.PLAYWRIGHT_BROWSERS_PATH && bundledPlaywrightBrowsersPath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledPlaywrightBrowsersPath;
  }

  const { YuekebaoGrabberServer } = await import(toFileUrl(path.join(getProjectRoot(), 'src', 'index.js')));
  dashboardServer = new YuekebaoGrabberServer();

  const port = normalizePort(process.env.ELECTRON_PORT || process.env.PORT);
  await dashboardServer.startDashboard(port, false);

  const address = dashboardServer.webServer?.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return `http://127.0.0.1:${actualPort}`;
};

const createMainWindow = async () => {
  const dashboardUrl = await startDashboardServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    title: 'BaboonTalkies Manager',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(dashboardUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(dashboardUrl);
};

const closeDashboardServer = () => new Promise((resolve) => {
  if (!dashboardServer?.webServer) {
    resolve();
    return;
  }

  dashboardServer.webServer.close(() => {
    resolve();
  });
});

app.whenReady()
  .then(createMainWindow)
  .catch((error) => {
    dialog.showErrorBox('BaboonTalkies Manager 启动失败', error?.stack || String(error));
    app.quit();
  });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      dialog.showErrorBox('BaboonTalkies Manager 启动失败', error?.stack || String(error));
    });
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  if (!dashboardServer?.webServer) {
    return;
  }

  event.preventDefault();
  closeDashboardServer().finally(() => {
    dashboardServer = null;
    app.quit();
  });
});
