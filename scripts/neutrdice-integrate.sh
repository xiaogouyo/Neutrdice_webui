#!/bin/bash

# NeutrDice 集成安装脚本
# 在已有 Sealdice-Docker 环境下安装 NeutrDice 面板
# 替换 MCSManager 管理面板

set -e

PANEL_PASSWORD="${PANEL_PASSWORD:-neutrdice2024}"
PANEL_PORT="${PANEL_PORT:-3000}"
API_PORT="${API_PORT:-3001}"

echo ""
echo "正在安装 NeutrDice 面板..."
echo ""

INSTALL_DIR="/opt/neutrdice-panel"

if [ -d "$INSTALL_DIR" ]; then
    echo "检测到已安装 NeutrDice 面板，更新中..."
else
    mkdir -p "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

cat > .env <<EOF
PANEL_PASSWORD=${PANEL_PASSWORD}
PANEL_PORT=${API_PORT}
DOCKER_SOCKET=/var/run/docker.sock
NEUTRDICE_BASE_DIR=/opt/neutrdice
NEUTRDICE_CONFIG=/opt/neutrdice/config.json
EOF

cat > docker-compose.yml <<'EOF'
version: '3.8'

services:
  neutrdice-panel:
    image: neutrdice/panel:latest
    container_name: neutrdice-panel
    ports:
      - "${API_PORT:-3001}:3001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - neutrdice-data:/opt/neutrdice
    env_file:
      - .env
    restart: unless-stopped
    networks:
      - neutrdice-net
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  neutrdice-net:
    name: neutrdice-net
    driver: bridge

volumes:
  neutrdice-data:
    name: neutrdice-data
EOF

docker compose up -d --build

EXTERNAL_IP=$(curl -s --connect-timeout 5 https://ipinfo.io/ip 2>/dev/null) || \
EXTERNAL_IP=$(curl -s --connect-timeout 5 https://ifconfig.me 2>/dev/null) || \
EXTERNAL_IP="localhost"

echo ""
echo "============================================================"
echo " NeutrDice 面板安装完成"
echo "============================================================"
echo ""
echo "面板访问地址:"
echo " http://${EXTERNAL_IP}:${PANEL_PORT}"
echo ""
echo "访问密码: ${PANEL_PASSWORD}"
echo ""
echo "============================================================"
