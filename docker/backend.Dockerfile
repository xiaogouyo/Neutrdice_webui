# NeutrDice Panel Backend Dockerfile (Python/Flask)
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl procps wget git && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY neutrdice-panel/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY neutrdice-panel/ ./neutrdice-panel/
WORKDIR /app/neutrdice-panel

# Create necessary directories
RUN mkdir -p /opt/neutrdice /app/logs /app/compose

EXPOSE 3001

ENV PANEL_PORT=3001
ENV DOCKER_SOCKET=/var/run/docker.sock
ENV NEUTRDICE_BASE_DIR=/opt/neutrdice
ENV NEUTRDICE_CONFIG=/opt/neutrdice/config.json
ENV LOG_DIR=/app/logs
ENV COMPOSE_DIR=/app/compose

# Run with gunicorn for production
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PANEL_PORT} --workers 2 --threads 50 --timeout 120 app:app"]
