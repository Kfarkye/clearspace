FROM node:22-slim AS build

WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY shared/sports-core/package.json shared/sports-core/
COPY shared/auth/package.json shared/auth/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy all source files
COPY . .

# Copy frontend env for Vite build (VITE_* vars are baked into the JS bundle)
COPY frontend/.env.local frontend/.env.local

# Build the frontend
RUN npm run build --prefix frontend

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY shared/sports-core/package.json shared/sports-core/
COPY shared/auth/package.json shared/auth/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy backend + shared source
COPY backend/ backend/
COPY shared/ shared/

# Copy built frontend from build stage
COPY --from=build /app/frontend/dist frontend/dist

# Cloud Run sets PORT env var
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "backend/server.js"]
