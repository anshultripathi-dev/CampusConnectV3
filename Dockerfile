# syntax=docker/dockerfile:1

# ── Stage 1: build the React app ────────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    CAMPUSCONNECT_DB=/data/campusconnect.db \
    CAMPUSCONNECT_UPLOADS=/data/uploads
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY data/seed.json ./data/seed.json
COPY --from=web /app/frontend/dist ./frontend/dist

# Persistent state (SQLite database + photo uploads) lives outside the image.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
