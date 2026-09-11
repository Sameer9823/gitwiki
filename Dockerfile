# GitWiki Intelligence - Production Docker Image
# Multi-stage build for smaller production image

# =============================================================================
# Base stage - install dependencies
# =============================================================================
FROM node:22-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    ca-certificates \
    dumb-init

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable pnpm

# =============================================================================
# Dependencies stage — uses plain npm (project has package-lock.json, not pnpm-lock)
# =============================================================================
FROM base AS deps

COPY package.json package-lock.json* ./
RUN npm ci

# =============================================================================
# Builder stage
# =============================================================================
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# =============================================================================
# Runner stage - production image
# =============================================================================
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy node_modules for Prisma (needed at runtime)
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]