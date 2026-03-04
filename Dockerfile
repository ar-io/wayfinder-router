# Wayfinder Router Dockerfile
# Multi-stage build for minimal production image

# Build stage - install dependencies
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Production stage
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 wayfinder

# Copy source and dependencies (Bun runs TS directly, no build step needed)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY src ./src
COPY tsconfig.json ./
COPY docker-entrypoint.sh ./

# Pre-create data directories so volume mounts inherit correct ownership
RUN mkdir -p /app/data/content-cache

# Set ownership
RUN chown -R wayfinder:nodejs /app

# Switch to non-root user
USER wayfinder

# Expose ports (public + admin)
EXPOSE 3000
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/wayfinder/health || exit 1

# Start server
ENTRYPOINT ["./docker-entrypoint.sh"]
