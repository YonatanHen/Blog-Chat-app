# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
# The optional extra-ca build secret lets machines behind a TLS-intercepting
# proxy/AV supply their interception root CA (via gitignored
# compose.override.yaml) without it ever entering the image or the repo.
# When the secret is absent — CI, Render, any normal machine — this is a no-op.
RUN --mount=type=secret,id=extra-ca,target=/tmp/extra-ca.pem \
    --mount=type=cache,target=/root/.npm \
    if [ -s /tmp/extra-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi \
    && npm ci

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@blog/api"]

FROM deps AS builder
COPY . .
RUN npm run build --workspace=@blog/api

# A separate production-only install: `deps` installs devDependencies too
# (tsx/tsup/vitest/etc, needed by `dev` and `builder`), which `runner` has no
# use for and shouldn't ship.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN --mount=type=secret,id=extra-ca,target=/tmp/extra-ca.pem \
    --mount=type=cache,target=/root/.npm \
    if [ -s /tmp/extra-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi \
    && npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
# Non-root. The legacy Dockerfile ran as root with a Windows WORKDIR in a Linux image.
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs api
# tsup bundles @blog/shared into dist/index.js but leaves real npm deps
# (express, mongoose, ...) external
# Bring over the clean prod-deps workspace (preserves the monorepo layout /
# hoisting structure the other stages already use).
COPY --from=prod-deps --chown=api:nodejs /app /app
# Inject the built production code.
COPY --from=builder --chown=api:nodejs /app/apps/api/dist ./apps/api/dist
USER api
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]