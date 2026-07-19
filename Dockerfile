# ---- deps: install once, cached separately from app code ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- runtime ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate

EXPOSE 3000

# Applies any pending migrations before starting, so a fresh database is
# never a manual extra step — see the "Docker Compose" README section.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.ts"]
