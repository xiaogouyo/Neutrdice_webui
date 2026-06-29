#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# NeutrDice Snow - 一键部署脚本
# ============================================================================
# 特性：
# - 交互式输入 WebUI / NapCat / SealDice 端口
# - 自动生成 .env 文件
# - 自动检测 docker-compose 可用性
# - 支持按端口号命名实例（docker-<webui-port>）
# - 自动创建数据目录
# - 端口冲突检测
# - 支持清理实例
# ============================================================================

COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_banner() {
  echo -e "${GREEN}"
  cat <<'EOF'
  _   _                 _ _   _       _   _            _    
 | | | | ___  ___      | | |_| |_ ___| |_| | ___   ___| | __
 | | | |/ _ \/ __|_____| | __| __/ _ \ __| |/ _ \ / __| |/ /
 | |_| |  __/\__ \_____| | |_| ||  __/ |_| | (_) | (__|   < 
  \___/ \___||___/     |_|\__|\__\___|\__|_|\___/ \___|_|\_\
EOF
  echo -e "${NC}"
  echo "部署脚本已启动"
  echo
}

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

confirm() {
  local prompt="${1:-确认继续? [y/N]}"
  local answer
  read -r -p "$prompt " answer
  case "$answer" in
    [yY][eE][sS]|[yY]) return 0 ;;
    *) return 1 ;;
  esac
}

prompt_port() {
  local name="$1"
  local default="$2"
  local value=""
  while true; do
    read -r -p "请输入${name}端口 [默认: ${default}]: " value || true
    value="${value:-$default}"
    if [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 1 && value <= 65535 )); then
      echo "$value"
      return 0
    fi
    log_error "请输入有效的端口号 (1-65535)"
  done
}

check_port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
      return 0
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -tlnp 2>/dev/null | grep -q ":${port} "; then
      return 0
    fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -i :"${port}" -sTCP:LISTEN -t >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

check_docker_ports() {
  local ports=("$@")
  local in_use=()
  
  for port in "${ports[@]}"; do
    if check_port_in_use "$port"; then
      in_use+=("$port")
    fi
  done
  
  if [[ ${#in_use[@]} -gt 0 ]]; then
    log_warn "以下端口可能已被占用: ${in_use[*]}"
    if ! confirm "是否继续部署? (可能导致端口冲突)"; then
      echo "已取消部署。"
      exit 0
    fi
  fi
}

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    log_info "已找到: $1"
    return 0
  else
    log_error "缺少依赖: $1"
    return 1
  fi
}

write_env() {
  local env_file="$1"
  local project_name="$2"
  local webui_port="$3"
  local frontend_port="$4"
  local napcat_webui_port="$5"
  local napcat_port1="$6"
  local napcat_port2="$7"
  local napcat_port3="$8"
  local sealdice_webui_port="$9"
  local sealdice_port2="${10:-32111}"
  local panel_password="${11:-neutrdice2024}"

  cat > "$env_file" <<EOF
# 由 deploy.sh 自动生成
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')
COMPOSE_PROJECT_NAME=${project_name}

# 面板/前端/核心端口
PANEL_PORT=${webui_port}
FRONTEND_PORT=${frontend_port}
SEALDICE_PORT1=${sealdice_webui_port}
SEALDICE_PORT2=${sealdice_port2}
NAPCAT_PORT1=${napcat_port1}
NAPCAT_PORT2=${napcat_port2}
NAPCAT_PORT3=${napcat_port3}
NAPCAT_WEBUI_PORT=${napcat_webui_port}
PANEL_PASSWORD=${panel_password}
EOF
  log_info "环境文件已生成: ${env_file}"
}

create_data_dirs() {
  local data_dir="$1"
  local project_name="$2"
  
  mkdir -p "$data_dir"
  mkdir -p "$data_dir/sealdice/data"
  mkdir -p "$data_dir/sealdice/backups"
  mkdir -p "$data_dir/napcat/data"
  mkdir -p "$data_dir/napcat/qq_data"
  mkdir -p "$data_dir/${project_name}-logs"
  
  log_info "数据目录已创建: ${data_dir}"
}

do_deploy() {
  print_banner

  echo "=========================================="
  echo "  环境检测"
  echo "=========================================="
  
  MISSING_DEPS=0
  check_command docker || MISSING_DEPS=1
  
  if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
    log_error "未找到 docker-compose 或 docker compose"
    MISSING_DEPS=1
  fi
  
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    log_warn "未找到 curl 或 wget，健康检查可能受影响"
  fi
  
  if [[ "$MISSING_DEPS" -ne 0 ]]; then
    log_error "请先安装缺失的依赖后重试。"
    echo "安装 Docker: https://docs.docker.com/get-docker/"
    echo "安装 docker-compose: https://docs.docker.com/compose/install/"
    exit 1
  fi

  echo
  echo "=========================================="
  echo "  端口配置"
  echo "=========================================="
  echo
  
  # WebUI 端口（面板）
  WEBUI_PORT=$(prompt_port "WebUI (面板)" "3001")
  
  # NapCat 端口
  echo
  echo "NapCat 端口配置："
  echo "  建议分配 3 个连续端口，用于 QQ 登录和 WebUI"
  echo "  例如输入 6099，则自动分配 6099, 6100, 6101"
  NAPCAT_BASE=$(prompt_port "NapCat 基础" "6099")
  NAPCAT_WEBUI_PORT="$NAPCAT_BASE"
  NAPCAT_PORT1="$NAPCAT_BASE"
  NAPCAT_PORT2="$((NAPCAT_BASE + 1))"
  NAPCAT_PORT3="$((NAPCAT_BASE + 2))"
  
  # SealDice 端口
  echo
  echo "SealDice 端口配置："
  echo "  建议分配 2 个连续端口"
  echo "  例如输入 32110，则自动分配 32110, 32111"
  SEALDICE_BASE=$(prompt_port "SealDice 基础" "32110")
  SEALDICE_WEBUI_PORT="$SEALDICE_BASE"
  SEALDICE_PORT2="$((SEALDICE_BASE + 1))"
  
  # 前端端口
  FRONTEND_PORT=$(prompt_port "前端" "3000")
  
  echo
  echo "=========================================="
  echo "  数据目录"
  echo "=========================================="
  echo
  read -r -p "数据目录 [默认: ./data]: " DATA_DIR_INPUT || true
  DATA_DIR="${DATA_DIR_INPUT:-./data}"
  
  # 实例名基于 WebUI 端口
  PROJECT_NAME="docker-${WEBUI_PORT}"
  ENV_FILE="$SCRIPT_DIR/.env.${PROJECT_NAME}"
  
  echo
  echo "=========================================="
  echo "  配置预览"
  echo "=========================================="
  echo
  echo "  实例名:       ${PROJECT_NAME}"
  echo "  面板端口:     ${WEBUI_PORT} -> 3001"
  echo "  前端端口:     ${FRONTEND_PORT} -> 80"
  echo "  NapCat 端口:  ${NAPCAT_PORT1}, ${NAPCAT_PORT2}, ${NAPCAT_PORT3}"
  echo "                NapCat WebUI: ${NAPCAT_WEBUI_PORT}"
  echo "  SealDice 端口: ${SEALDICE_WEBUI_PORT}, ${SEALDICE_PORT2}"
  echo "  数据目录:     ${DATA_DIR}"
  echo "  环境文件:     ${ENV_FILE}"
  echo "  容器名前缀:   ${PROJECT_NAME}-"
  echo
  
  # 端口冲突检测
  echo "=========================================="
  echo "  端口冲突检测"
  echo "=========================================="
  echo
  ALL_PORTS=("$WEBUI_PORT" "$FRONTEND_PORT" "$NAPCAT_PORT1" "$NAPCAT_PORT2" "$NAPCAT_PORT3" "$NAPCAT_WEBUI_PORT" "$SEALDICE_WEBUI_PORT" "$SEALDICE_PORT2")
  check_docker_ports "${ALL_PORTS[@]}"
  
  if ! confirm "确认开始部署?"; then
    echo "已取消部署。"
    exit 0
  fi

  echo
  echo "=========================================="
  echo "  创建数据目录"
  echo "=========================================="
  echo
  create_data_dirs "$DATA_DIR" "$PROJECT_NAME"

  echo
  echo "=========================================="
  echo "  生成配置文件"
  echo "=========================================="
  echo
  PANEL_PASSWORD="neutrdice2024"
  write_env "$ENV_FILE" \
    "$PROJECT_NAME" \
    "$WEBUI_PORT" \
    "$FRONTEND_PORT" \
    "$NAPCAT_WEBUI_PORT" \
    "$SEALDICE_WEBUI_PORT" \
    "$SEALDICE_PORT2" \
    "$NAPCAT_PORT1" \
    "$NAPCAT_PORT2" \
    "$NAPCAT_PORT3" \
    "$PANEL_PASSWORD"

  echo
  echo "=========================================="
  echo "  启动服务"
  echo "=========================================="
  echo
  if command -v docker-compose >/dev/null 2>&1; then
    log_info "使用 docker-compose 启动..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
  else
    log_info "使用 docker compose 启动..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
  fi

  echo
  echo "=========================================="
  echo "  部署完成"
  echo "=========================================="
  echo
  echo "  面板地址: http://<服务器IP>:${WEBUI_PORT}"
  echo "  前端地址: http://<服务器IP>:${FRONTEND_PORT}"
  echo "  默认密码: ${PANEL_PASSWORD}"
  echo "  环境文件: ${ENV_FILE}"
  echo
  echo "  如需再次部署/更新："
  echo "    bash deploy.sh"
  echo
  echo "  如需清理实例："
  echo "    bash deploy.sh --clean ${PROJECT_NAME}"
  echo
  echo "  如需查看日志："
  echo "    docker logs ${PROJECT_NAME}-panel"
  echo "    docker logs ${PROJECT_NAME}-frontend"
  echo "    docker logs ${PROJECT_NAME}-sealdice-core"
  echo "    docker logs ${PROJECT_NAME}-napcat-core"
  echo
}

do_clean() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    echo "用法: $0 --clean <实例名>"
    echo "例如: $0 --clean docker-3001"
    exit 1
  fi

  echo "即将清理实例: ${target}"
  echo "这将删除所有容器、网络和数据卷！"
  echo
  
  if ! confirm "确认删除该实例? 该操作不可恢复"; then
    echo "已取消清理。"
    exit 0
  fi

  echo
  log_info "正在停止并删除实例..."
  
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" -p "$target" down -v || true
  else
    docker compose -f "$COMPOSE_FILE" -p "$target" down -v || true
  fi

  echo
  log_info "实例清理完成。"
  echo "如需彻底删除，请额外手动删除："
  echo "  - 环境文件: .env.${target}"
  echo "  - 数据目录: ./data (如果不再需要)"
}

show_status() {
  echo "=========================================="
  echo "  实例状态"
  echo "=========================================="
  echo
  docker ps --filter "label=neutrdice.instance" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
  echo
  echo "环境文件："
  ls -la .env.docker-* 2>/dev/null || echo "  未找到环境文件"
}

main() {
  local action="${1:-deploy}"
  case "$action" in
    deploy|""|-d)
      shift || true
      do_deploy "$@"
      ;;
    clean|--clean)
      shift || true
      do_clean "$@"
      ;;
    status|--status|-s)
      show_status
      ;;
    help|-h|--help)
      echo "用法:"
      echo "  $0              # 交互式部署"
      echo "  $0 --clean      # 清理实例"
      echo "  $0 --status     # 查看实例状态"
      echo
      echo "环境变量："
      echo "  COMPOSE_FILE          # 指定 compose 文件路径"
      echo "  DEFAULT_WEBUI_PORT    # 默认 WebUI 端口"
      echo "  DEFAULT_FRONTEND_PORT # 默认前端端口"
      ;;
    *)
      echo "未知参数: $action"
      echo "运行 $0 --help 查看帮助"
      exit 1
      ;;
  esac
}

main "$@"
