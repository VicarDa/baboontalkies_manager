FROM node:20-bookworm

WORKDIR /code

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOME=/root
ENV NODE_ENV=production
ENV PORT=9000
ENV HTTPS=false

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libgl1 \
    libmagic1 \
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

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

RUN mkdir -p src/python
COPY src/python/requirements-marker.txt ./src/python/requirements-marker.txt
# Cloud Run has no GPU. Preinstall the CPU wheel so marker-pdf does not pull
# several gigabytes of unused CUDA/NVIDIA runtime packages from PyPI.
RUN python3 -m pip install --no-cache-dir --break-system-packages \
      --index-url https://download.pytorch.org/whl/cpu \
      --extra-index-url https://pypi.org/simple \
      'torch==2.8.0+cpu' \
    && python3 -m pip install --no-cache-dir --break-system-packages \
      -r src/python/requirements-marker.txt

RUN npx playwright install chromium \
    && rm -rf /root/.cache /root/.npm

COPY . .
RUN cd public/checkin \
    && NODE_ENV=development npm ci \
    && npm run build \
    && rm -rf node_modules /root/.npm

EXPOSE 9000
CMD ["node", "index.mjs"]
