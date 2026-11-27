# STREAM-009.7: optional build targets, never a production deployment by themselves.
# Build from the repository root: docker build -f deploy/Dockerfile --target api .
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Prisma config requires a syntactically valid URL at generate time; no connection is attempted.
# This disposable build-only value never appears in the runtime stages.
ENV DATABASE_URL=postgresql://build_only:build_only@127.0.0.1:5432/build_only
RUN npm install --global pnpm@10.34.9
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate \
    && pnpm --filter @streamlab/contracts build \
    && pnpm --filter @streamlab/api build \
    && pnpm --filter @streamlab/worker build \
    && pnpm --filter @streamlab/web build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Runtime FFmpeg includes ffprobe; CA roots are required for HTTPS S3/managed services.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.34.9 \
    && mkdir -p /scratch \
    && chown node:node /scratch
# Include the Prisma CLI for the isolated migration target. Never copy local .env files.
COPY --from=build --chown=node:node /app /app
USER node

FROM runtime AS api
EXPOSE 4000
CMD ["sh", "-c", "node scripts/production/preflight.mjs && exec node apps/api/dist/index.js"]

FROM runtime AS worker
ENV TMPDIR=/scratch
CMD ["sh", "-c", "node scripts/production/preflight.mjs && exec node apps/worker/dist/index.js"]

FROM runtime AS migrate
CMD ["sh", "-c", "node scripts/production/preflight.mjs && exec pnpm --filter @streamlab/api db:migrate:deploy"]

FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
