# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files for dependency installation
COPY package*.json ./

# Install dependencies with development dependencies
RUN npm ci

# Copy application files
COPY public ./public
COPY config ./config
COPY controllers ./controllers
COPY models ./models
COPY routes ./routes
COPY server.js .
COPY create-tables.js .
COPY list-tables.js .
COPY nodemon.json .

# Build the application (if you have a build step)
RUN npm run build || true

# Production stage
FROM node:18-alpine

# Install production dependencies
RUN apk add --no-cache \
    wget \
    dumb-init \
    # Add any other required runtime dependencies here
    && addgroup -g 1001 nodejs \
    && adduser -u 1001 -G nodejs -s /bin/sh -D nodejs

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY *.json ./

# Install production dependencies only
RUN npm ci --only=production \
    && npm cache clean --force

# Copy application files from builder stage
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/ ./

# Create and set permissions for exports directory
RUN mkdir -p public/exports \
    && chown -R nodejs:nodejs public/exports \
    && chmod 755 public/exports

# Set environment variables
ENV NODE_ENV=production \
    PORT=5001

# Expose the application port
EXPOSE 5001

# Switch to non-root user
USER nodejs

# Add health check
#HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
#    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

# Use dumb-init as PID 1
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
