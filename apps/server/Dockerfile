# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/zod-shared/package.json ./packages/zod-shared/
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
# extra-ca: optional TLS-intercepting proxy/AV root CA, never baked into the image.
RUN --mount=type=secret,id=extra-ca,target=/tmp/extra-ca.pem \
    --mount=type=cache,target=/root/.npm \
    if [ -s /tmp/extra-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi \
    && npm ci

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@blog/server"]

FROM deps AS builder
COPY . .
RUN npm run build --workspace=@blog/server --workspace=@blog/client

# Prod-only, server-scoped: the runner serves apps/client/dist as static bytes,
# it never runs React, so client deps have no reason to ship here.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/zod-shared/package.json ./packages/zod-shared/
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
RUN --mount=type=secret,id=extra-ca,target=/tmp/extra-ca.pem \
    --mount=type=cache,target=/root/.npm \
    if [ -s /tmp/extra-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi \
    && npm ci --omit=dev --workspace=@blog/server

FROM base AS runner
ENV NODE_ENV=production
# Non-root — the legacy image ran as root.
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs server
COPY --from=prod-deps --chown=server:nodejs /app /app
COPY --from=builder --chown=server:nodejs /app/apps/server/dist ./apps/server/dist
# SPA baked in — no separate client service in prod.
COPY --from=builder --chown=server:nodejs /app/apps/client/dist ./apps/client/dist
ENV CLIENT_DIST=apps/client/dist
USER server
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
