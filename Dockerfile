# Multi-stage build for production deployment
# Stage 1: Build React frontend
FROM node:20-alpine AS react-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/ .
RUN npm run build

# Stage 2: Python backend with React build
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV NODE_ENV=production

# Set work directory
WORKDIR /app

# Install system dependencies including nginx
RUN apt-get update && apt-get install -y \
    gcc \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (backend)
COPY . .

# Copy React build from first stage
COPY --from=react-build /app/frontend/build ./static/react

# Create nginx configuration
RUN echo 'events { worker_connections 1024; } \
http { \
    include /etc/nginx/mime.types; \
    default_type application/octet-stream; \
    server { \
        listen 8080; \
        server_name _; \
        root /app/static/react; \
        index index.html; \
        location / { \
            try_files $uri $uri/ @backend; \
        } \
        location @backend { \
            proxy_pass http://127.0.0.1:8000; \
            proxy_set_header Host $host; \
            proxy_set_header X-Real-IP $remote_addr; \
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
            proxy_set_header X-Forwarded-Proto $scheme; \
        } \
        location /api { \
            proxy_pass http://127.0.0.1:8000; \
            proxy_set_header Host $host; \
            proxy_set_header X-Real-IP $remote_addr; \
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
            proxy_set_header X-Forwarded-Proto $scheme; \
        } \
        location /login { \
            proxy_pass http://127.0.0.1:8000; \
            proxy_set_header Host $host; \
            proxy_set_header X-Real-IP $remote_addr; \
        } \
    } \
}' > /etc/nginx/nginx.conf

# Create startup script
RUN echo '#!/bin/bash \
nginx & \
exec uvicorn fastapi_app:app --host 127.0.0.1 --port 8000' > /app/start.sh \
&& chmod +x /app/start.sh

# Create a non-root user
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app \
    && chown -R app:app /var/log/nginx \
    && chown -R app:app /var/lib/nginx

USER app

# Expose port
EXPOSE 8080

# Command to run both nginx and FastAPI
CMD ["/app/start.sh"]