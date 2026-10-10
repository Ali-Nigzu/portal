# syntax=docker/dockerfile:1
# --------------------------------------------
# Stage 1: Build React frontend
# --------------------------------------------
FROM node:20-alpine AS react-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci

COPY frontend/ ./
RUN npm run build

# --------------------------------------------
# Stage 2: Python backend with frontend build
# --------------------------------------------
FROM python:3.11-slim

# Environment setup
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV NODE_ENV=production

WORKDIR /app

# Copy backend requirements
COPY backend/requirements.txt ./backend/requirements.txt

# Install backend dependencies
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built React frontend
COPY --from=react-build /app/frontend/build ./backend/frontend_build

# Expose port
EXPOSE 8080

# Start the backend server
CMD ["sh", "-c", "uvicorn backend.fastapi_app:app --host 0.0.0.0 --port ${PORT:-8080}"]
