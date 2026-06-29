# NeutrDice Panel Backend Dockerfile (Python/Flask)
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl procps wget && \
    rm -rf /var/lib/apt/lists/*

COPY neutrdice-panel/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY neutrdice-panel/ ./neutrdice-panel/
WORKDIR /app/neutrdice-panel

EXPOSE 3001

ARG PANEL_PORT=3001
ARG PANEL_PASSWORD=neutrdice2024
ENV PANEL_PORT=${PANEL_PORT}
ENV PANEL_PASSWORD=${PANEL_PASSWORD}
ENV DOCKER_SOCKET=/var/run/docker.sock
ENV NEUTRDICE_BASE_DIR=/opt/neutrdice
ENV NEUTRDICE_CONFIG=/opt/neutrdice/config.json

CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PANEL_PORT} --workers 2 --threads 50 app:app"]
