# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev --include=optional --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm test && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    CLOUDFLARE_CF_FETCH_ENABLED=false \
    WRANGLER_SEND_METRICS=false \
    WRANGLER_WRITE_LOGS=false \
    DOCKER_LOCAL_MODE=1 \
    PORT=3000
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/package.json ./package.json
RUN mkdir -p .wrangler/state .sites-runtime && chown -R node:node .wrangler .sites-runtime
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:3000/healthz'); process.exit(r.ok ? 0 : 1)"
CMD ["node", "scripts/docker-start.mjs"]
