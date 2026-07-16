FROM asia-east1-docker.pkg.dev/project-59ee4a6b-1c4d-4d7b-a37/cloud-run-source-deploy/baboontalkies_manager/baboontalkies-manager@sha256:38c51a9590adcfbedf997613a04b2b76047d383f18f2c9e1863e86960f47ba7e

WORKDIR /code

# Reuse the already-imported Python/Playwright runtime. If Python requirements
# change, fail explicitly so the runtime base is refreshed instead of silently
# deploying mismatched packages.
RUN cp /code/src/python/requirements-marker.txt /tmp/runtime-base-requirements-marker.txt \
    && find /code -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +

COPY package*.json ./
RUN npm ci --omit=dev && npx playwright install chromium

COPY . .
RUN tr -d '\r' < /tmp/runtime-base-requirements-marker.txt > /tmp/runtime-base-requirements-marker.normalized \
    && tr -d '\r' < src/python/requirements-marker.txt > /tmp/source-requirements-marker.normalized \
    && cmp /tmp/runtime-base-requirements-marker.normalized /tmp/source-requirements-marker.normalized
RUN cd public/checkin \
    && NODE_ENV=development npm ci \
    && npm run build \
    && rm -rf node_modules

ENV NODE_ENV=production
ENV PORT=9000
ENV HTTPS=false

EXPOSE 9000
CMD ["node", "index.mjs"]
