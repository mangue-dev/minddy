# syntax=docker/dockerfile:1.7

# The build stage contains the package manager and compiler. The final image
# only contains the traced Next.js server and its production dependencies.
FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

FROM base AS dependencies

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .

# Runtime configuration is intentionally not supplied at build time. The
# application validates operator settings during process startup instead.
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN groupadd --gid 10001 minddy \
    && useradd --uid 10001 --gid minddy --create-home --shell /usr/sbin/nologin minddy

COPY --from=build --chown=minddy:minddy /app/public ./public
COPY --from=build --chown=minddy:minddy /app/supabase/email-templates ./supabase/email-templates
COPY --from=build --chown=minddy:minddy /app/.next/standalone ./
COPY --from=build --chown=minddy:minddy /app/.next/static ./.next/static

USER minddy

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
