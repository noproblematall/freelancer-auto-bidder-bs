# Production Dockerfile for Auto-Bidder Backend
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files from backend directory
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Development dependencies for Prisma generation
RUN npm install prisma --save-dev

# Generate Prisma Client
RUN npx prisma generate

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeapp

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy application code from backend directory
COPY --chown=nodeapp:nodejs backend/ .

# Copy ChatGPT prompt from project root
COPY --chown=nodeapp:nodejs ChatGPT-prompt.md ./

# Create directory for SQLite database with proper permissions
RUN mkdir -p /app/prisma && \
    chown -R nodeapp:nodejs /app/prisma

# Regenerate Prisma Client with the final schema (important for schema changes)
RUN npx prisma generate

# Switch to non-root user
USER nodeapp

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run migrations and start application
CMD ["sh", "/app/start.sh"]
