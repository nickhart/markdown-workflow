# Multi-stage build for markdown-workflow presentation demo
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    # Pandoc for document conversion
    pandoc \
    # Chromium and dependencies for Mermaid CLI
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    # Additional fonts for better PDF/PPTX output
    font-noto \
    font-noto-cjk \
    # Git for potential version control features
    git \
    # Build tools
    make \
    g++

# Configure Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install Mermaid CLI globally (before app dependencies to leverage caching)
RUN npm install -g @mermaid-js/mermaid-cli

# Install app dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the Next.js application
RUN pnpm run build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Create temp directory for presentations with proper permissions
RUN mkdir -p /app/tmp/presentation-demo && \
    chown -R nextjs:nodejs /app/tmp

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/presentations/templates || exit 1

# Start the application
CMD ["pnpm", "start"]