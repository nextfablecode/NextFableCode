FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/

# Install dependencies
WORKDIR /app/backend
RUN npm ci --only=production

# Copy backend source
COPY backend/ .

# Copy frontend
WORKDIR /app
COPY frontend/ ./frontend/

# Set working directory to backend
WORKDIR /app/backend

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S codesync -u 1001
USER codesync

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health || exit 1

CMD ["node", "server.js"]
