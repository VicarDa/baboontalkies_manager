# 使用官方 Node.js 镜像
FROM node:20-bookworm

# 设置工作目录
WORKDIR /code

# 设置环境变量
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOME=/root
ENV NODE_ENV=production
ENV PORT=9000
ENV HTTPS=false

# 安装 Playwright 系统依赖
RUN apt-get update && apt-get install -y \
    libnspr4 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libasound2 \
    libdrm2 \
    libxshmfence1 \
    fonts-liberation \
    libcups2 \
    libpango-1.0-0 \
    libcairo2 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    && rm -rf /var/lib/apt/lists/*

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --production

# 安装 Playwright Chromium 浏览器
RUN npx playwright install chromium

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 9000

# 启动命令
CMD ["node", "index.mjs"]
