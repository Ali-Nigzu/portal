# --------------------------------------------
# Stage 1: Build React frontend
# --------------------------------------------
FROM node:20-alpine AS react-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production

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

# Install system deps (gcc needed for psycopg2)
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt ./backend/requirements.txt

# Install backend dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built React frontend
COPY --from=react-build /app/frontend/build ./backend/frontend_build

# Expose port
EXPOSE 8080

# Start the backend server
CMD ["sh", "-c", "uvicorn backend.fastapi_app:app --host 0.0.0.0 --port ${PORT:-8080}"]