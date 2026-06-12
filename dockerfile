# ─── Stage 1: Builder ───────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Skip puppeteer Chrome download in builder — runner uses system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Ensure pnpm is available (corepack-managed)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lock file if it exists, otherwise install without it
COPY package.json .

# Copy source and build
COPY ./src ./src
COPY ./postgres ./postgres
COPY ./drizzle.config.ts ./drizzle.config.ts
COPY ./drizzle.migrate.config.ts ./drizzle.migrate.config.ts
COPY ./tsconfig.json ./tsconfig.json

# Copy agent directory for Python gold evaluator
# COPY agent ./agent

# Note: Don't generate migrations during build - run them at container startup
# CMD ["./start.sh"]
# RUN sh ./start.sh

RUN pnpm i --ignore-scripts
RUN pnpm approve-builds
# RUN pnpm run migrate

# Build the application
RUN pnpm build


# ─── Stage 2: Runtime with Chromium for puppeteer ────────
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install system Chromium — handles all shared library deps automatically
# and tell puppeteer to use it instead of its bundled Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN corepack enable && corepack prepare pnpm@latest --activate

# Runtime: dist + migrations + migrate-only Drizzle config (no src/ — migrate applies SQL, not TS schema)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/postgres ./postgres
COPY --from=builder /app/drizzle.migrate.config.ts ./drizzle.migrate.config.ts

# HTML templates — not bundled by esbuild, must be copied alongside dist/
COPY --from=builder /app/src/features/report/html ./dist/html
COPY --from=builder /app/src/features/documents/html ./dist/html

EXPOSE 7777

CMD ["node", "dist/main.js"]
# ENV RUN_MIGRATIONS_ON_START=false
# CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS_ON_START\" = \"true\" ]; then pnpm run migrate:deploy; fi; node dist/main.js"]

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7777/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
