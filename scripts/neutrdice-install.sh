#!/bin/bash

# NeutrDice Panel 一键安装脚本
# 适用于 Ubuntu/Debian 系统

set -e

PANEL_PASSWORD="${PANEL_PASSWORD:-neutrdice2024}"
PANEL_PORT="${PANEL_PORT:-3000}"
API_PORT="${API_PORT:-3001}"

echo ""
echo " ███████╗███████╗ █████╗ ██╗  ██████╗ ██╗  ██████╗███████╗"
echo " ██╔════╝██╔════╝██╔══██╗██║ ██╔══██╗██║██╔════╝██╔════╝"
echo " ███████╗█████╗  ███████║██║ ██║  ██║██║██║     █████╗  "
echo " ╚════██║██╔══╝  ██╔══██║██║ ██║  ██║██║██║     ██╔══╝  "
echo " ███████║███████╗██║  ██║███████╗██████╔╝██║╚██████╗███████╗"
echo " ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝ ╚═════╝╚══════╝"
echo "=================================================================="
echo " NeutrDice Panel 安装脚本"
echo "=================================================================="
echo ""

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
    echo "错误：请使用 sudo 运行此脚本"
    exit 1
fi

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "正在安装 Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        rm get-docker.sh
        systemctl enable docker
        systemctl start docker
    fi

    if ! command -v docker &> /dev/null; then
        echo "错误：Docker 安装失败"
        exit 1
    fi

    if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
        echo "正在安装 Docker Compose..."
        apt-get update && apt-get install -y docker-compose
    fi
}

# 检测系统并安装必要工具
check_dependencies() {
    echo "检查系统依赖..."
    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y curl wget unzip ca-certificates
    fi
}

# 获取公网 IP
get_external_ip() {
    local ip=""
    ip=$(curl -s --connect-timeout 5 https://ipinfo.io/ip 2>/dev/null) || \
    ip=$(curl -s --connect-timeout 5 https://ifconfig.me 2>/dev/null) || \
    ip=$(hostname -I | awk '{print $1}')
    echo "$ip"
}

# 主安装流程
main() {
    check_dependencies
    check_docker

    echo ""
    echo "正在安装 NeutrDice Panel..."
    echo ""

    # 创建安装目录
    INSTALL_DIR="/opt/neutrdice-panel"
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"

    # 提示用户输入配置
    echo "请配置面板参数（直接回车使用默认值）:"
    echo ""

    read -p "面板访问密码 [${PANEL_PASSWORD}]: " input_pwd
    PANEL_PASSWORD="${input_pwd:-$PANEL_PASSWORD}"

    read -p "前端端口 [${PANEL_PORT}]: " input_port
    PANEL_PORT="${input_port:-$PANEL_PORT}"

    read -p "API 端口 [${API_PORT}]: " input_api
    API_PORT="${input_api:-$API_PORT}"

    # 创建环境变量文件
    cat > "$INSTALL_DIR/.env" <<EOF
PANEL_PASSWORD=${PANEL_PASSWORD}
PANEL_PORT=${API_PORT}
DOCKER_SOCKET=/var/run/docker.sock
NEUTRDICE_BASE_DIR=/opt/neutrdice
NEUTRDICE_CONFIG=/opt/neutrdice/config.json
EOF

    # 拉取或复制配置文件
    cat > "$INSTALL_DIR/docker-compose.yml" <<'EOF'
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

    echo ""
    echo "正在构建并启动容器..."

    # 构建并启动
    docker compose down 2>/dev/null || true
    docker compose up -d --build

    # 等待服务启动
    echo "等待服务启动..."
    sleep 5

    # 获取 IP
    EXTERNAL_IP=$(get_external_ip)

    echo ""
    echo "============================================================"
    echo " NeutrDice Panel 安装完成!"
    echo "============================================================"
    echo ""
    echo "面板访问地址:"
    echo " http://${EXTERNAL_IP}:${PANEL_PORT}"
    echo ""
    echo "配置信息:"
    echo " 访问密码: ${PANEL_PASSWORD}"
    echo "  API 端口: ${API_PORT}"
    echo ""
    echo "注意事项:"
    echo " 1. 请在服务器防火墙/安全组开放 ${PANEL_PORT} 端口"
    echo " 2. 默认密码建议在设置中修改"
    echo "============================================================"
    echo ""
}

main "$@"
