# ---- frontend build: static assets served by the API in production, so
# browser and API share one origin and the session cookie just works ----
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

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
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN npx prisma generate

EXPOSE 3000

# Applies any pending migrations before starting, so a fresh database is
# never a manual extra step — see the "Docker Compose" README section.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.ts"]
