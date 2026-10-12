FROM node:20-alpine

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json ./
COPY scripts/verify-runtime.js ./scripts/verify-runtime.js
RUN npm ci --omit=dev --no-audit --no-fund --update-notifier=false \
    --registry="${NPM_REGISTRY}" --replace-registry-host=always \
    --fetch-retries=2 --fetch-timeout=60000 \
    && node scripts/verify-runtime.js --dependencies-only

COPY . .
RUN node scripts/verify-runtime.js

EXPOSE 3000

CMD ["node", "src/server.js"]
