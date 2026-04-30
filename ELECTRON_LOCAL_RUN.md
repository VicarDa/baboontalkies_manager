# Electron 和本地运行说明

## 本地浏览器运行

安装依赖后可以直接启动 HTTP 版仪表盘：

```bash
npm run local
```

默认访问地址：

```text
http://localhost:3000
```

如果需要换端口，可以先设置 `PORT`：

```powershell
$env:PORT = "3100"
npm run local
```

## Electron 开发运行

启动桌面壳：

```bash
npm run electron
```

Electron 会在本机启动内置 HTTP 服务，并自动打开桌面窗口。默认使用空闲端口；如果要固定端口，可以设置 `ELECTRON_PORT`。

```powershell
$env:ELECTRON_PORT = "3100"
npm run electron
```

## 打包

打包会先把 Playwright Chromium 下载到项目根目录的 `.playwright-browsers/`，再随 Electron 产物一起打进去。第一次执行会比较慢，后续会复用本地缓存。

生成未压缩目录，适合先检查文件结构：

```bash
npm run electron:pack
```

生成 Windows portable 程序：

```bash
npm run electron:dist
```

产物会输出到 `release/`。

## 配置文件

开发模式继续使用项目根目录的 `.env.local`。打包后的程序会依次尝试读取这些位置的 `.env` 和 `.env.local`：

- 当前工作目录
- exe 所在目录
- Electron 用户数据目录
- 应用内部目录

不要把真实密钥写进打包产物。发给别人使用时，把 `.env.local` 放在 exe 同级目录即可。

打包后需要写入的运行数据默认放在 Electron 用户数据目录下。如果要改位置，可以在 `.env.local` 中配置：

```text
BT_RUNTIME_DATA_DIR=D:\BaboonTalkiesData
```

## Playwright 浏览器

抓取功能依赖 Playwright Chromium。Electron 打包产物会内置浏览器；如果只是在源码目录直接运行，并且本机没有浏览器缓存，先执行：

```bash
npm run playwright:install-browsers
```
