# Alternate Control Plane image (tsc build inside control-plane/). For Render staging/prod, prefer repo-root
# **Dockerfile.control-plane** (see render.yaml) — esbuild bundle + in-process migrations after /health.
#
# If you use this file: dockerContext MUST still be repo root (.), never control-plane/ alone, so COPY scripts/ + supabase/ works.
# Build: docker build -f control-plane/Dockerfile .
#
# Render default: dockerfilePath ./Dockerfile.control-plane, dockerContext .

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