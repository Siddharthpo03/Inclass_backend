# Multi-stage build for InClass backend
# Stage 1: Build (lightweight)
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for sharp prebuilt binaries)
RUN npm ci

# Stage 2: Production (Debian-based for better binary compatibility with ONNX Runtime)
FROM node:22-bookworm-slim

# Install system dependencies for:
# - Sharp (image processing): libcairo2, libpango-1.0-0, libpangocairo-1.0-0
# - ONNX Runtime: libomp (OpenMP for CPU execution), libgomp
# - General: dumb-init for signal handling
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    giflib-tools \
    libomp-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code (including models directory)
COPY . ./

# Ensure models directory exists and has proper permissions
RUN mkdir -p ./models && chmod 755 ./models

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]
