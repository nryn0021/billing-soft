# syntax=docker/dockerfile:1

# ---- Build stage: compile the React/Vite client ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

ENV NODE_ENV=production

# Full install: drizzle-kit is used by the entrypoint to push the schema on first
# boot. (tsx is not needed at runtime — the seed script runs under plain node.)

# Server code, built client, and the seed data the seed script imports.
COPY server ./server
COPY src/data ./src/data
COPY drizzle.config.js ./
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
    && mkdir -p /app/data \
    && chown -R node:node /app

USER node
EXPOSE 8787

# Uses Node 22's global fetch against the app's own health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
