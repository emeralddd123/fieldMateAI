FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV COREPACK_HOME="/pnpm/corepack"
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=fieldmate-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @fieldmate/api... --store-dir=/pnpm/store --network-concurrency=8 --fetch-timeout=60000
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @fieldmate/shared build && pnpm --filter @fieldmate/api prisma:generate && pnpm --filter @fieldmate/api build
RUN --mount=type=cache,id=fieldmate-pnpm,target=/pnpm/store pnpm --filter @fieldmate/api deploy --prod /prod/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /prod/api ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
