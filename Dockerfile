# 使用 Node.js 20 Debian 基础镜像（Playwright 官方镜像已预装浏览器）
FROM mcr.microsoft.com/playwright/node:20-bookworm

# 设置工作目录
WORKDIR /code

# 设置 Playwright 浏览器路径环境变量（必须在安装前设置）
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOME=/root

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --production

# 复制应用代码
COPY . .

# 确保 Playwright 浏览器已安装（使用预设的路径）
RUN npx playwright install chromium --with-deps

# 设置其他环境变量
ENV NODE_ENV=production
ENV PORT=9000
ENV HTTPS=false

# 暴露端口
EXPOSE 9000

# 启动命令
CMD ["node", "index.mjs"]
