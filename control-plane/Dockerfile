# Control Plane — must be built with repo root as context so migrations are included and run on every start.
# Render: set dockerContext: . and dockerfilePath: control-plane/Dockerfile. Then migrations run on their own.
# Build: from repo root run  docker build -f control-plane/Dockerfile .

FROM node:20-alpine AS builder
WORKDIR /app
COPY control-plane/package*.json ./
RUN npm ci
COPY control-plane/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY control-plane/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# From repo root: migration assets so CMD can run migrate on every start
COPY scripts/run-migrate.mjs ./scripts/
COPY schemas ./schemas
COPY supabase ./supabase
EXPOSE 10000
ENV PORT=10000
CMD ["sh", "-c", "node scripts/run-migrate.mjs && exec node dist/index.js"]