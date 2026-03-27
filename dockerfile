# ─── Stage 1: Builder ───────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN corepack enable

# Copy lock file if it exists, otherwise install without it
COPY package.json .

# Copy source and build
COPY ./src ./src
COPY ./postgres ./postgres
COPY ./drizzle.config.ts ./drizzle.config.ts

# Copy agent directory for Python gold evaluator
# COPY agent ./agent

# Note: Don't generate migrations during build - run them at container startup
# CMD ["./start.sh"]
# RUN sh ./start.sh

RUN pnpm i
# RUN pnpm run migrate

# Build the application
RUN pnpm build


# ─── Stage 2: Runtime with Chromium for puppeteer-core ────────
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

# Copy only necessary files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/postgres ./postgres
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 7777

# CMD ["pnpm", "run", "dev"]

CMD ["node", "dist/main.js"]

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://localhost:7777/api/v1/health || exit 1