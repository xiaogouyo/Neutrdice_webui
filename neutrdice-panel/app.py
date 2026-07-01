"""
Neutrdice Panel - 海豹/NapCat 容器管理面板
"""
import json
import logging
import os
import re
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import docker
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder="static", static_url_path="")

# --- 配置 ---
COMPOSE_DIR = os.environ.get("COMPOSE_DIR", "/app/compose")
COMPOSE_FILE = os.path.join(COMPOSE_DIR, "docker-compose.yml")
SEALDICE_CONTAINER = os.environ.get("SEALDICE_CONTAINER", "sealdice-core")
NAPCAT_CONTAINER = os.environ.get("NAPCAT_CONTAINER", "napcat-core")
SEALDICE_IMAGE_BASE = "shiaworkshop/sealdice"
VALID_SEALDICE_CHANNELS = ["latest", "stable", "pre"]
NAME_MAP = {
    "sealdice": SEALDICE_CONTAINER,
    "napcat": NAPCAT_CONTAINER,
}
NEUTRDICE_PANEL_REPO = os.environ.get(
    "NEUTRDICE_PANEL_REPO",
    "https://github.com/xiaogouyo/Neutrdice_webui.git",
)
NEUTRDICE_PANEL_REPO_NAME = os.environ.get("NEUTRDICE_PANEL_REPO_NAME", "NeutrDice")
# 日志持久化目录
LOG_DIR = os.environ.get("LOG_DIR", "/app/logs")
os.makedirs(LOG_DIR, exist_ok=True)
# 每个容器保留的日志文件数量
LOG_FILE_MAX_LINES = 10000


def resolve_container(name: str):
    alias = name
    real = NAME_MAP.get(name, name)
    return real, alias


def get_panel_container_name() -> str:
    name = os.environ.get("PANEL_CONTAINER")
    if name:
        return name
    try:
        client = get_docker_client()
        containers = client.containers.list(all=True)
        for container in containers:
            labels = container.labels or {}
            if labels.get("neutrdice.type") == "system" and "panel" in container.name:
                return container.name
    except Exception:
        pass
    return "neutrdice-panel"


# Docker 客户端
_docker_client_lock = threading.Lock()
_docker_client = None


def get_docker_client():
    global _docker_client
    if _docker_client is None:
        with _docker_client_lock:
            if _docker_client is None:
                _docker_client = docker.from_env()
    return _docker_client


def _get_napcat_webui_token(container_name: str) -> str:
    """从 NapCat 容器的 webui.json 配置文件中读取 token"""
    try:
        client = get_docker_client()
        container = client.containers.get(container_name)
        # NapCat 的配置文件在 /app/napcat/config/webui.json
        result = container.exec_run("cat /app/napcat/config/webui.json")
        if result.exit_code == 0:
            import json
            config = json.loads(result.output.decode("utf-8"))
            return config.get("token", "")
    except Exception:
        pass
    return ""


def _get_local_git_revision(repo_path: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", repo_path, "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()[:12]
    except Exception:
        pass
    return "local"


def _get_remote_latest_revision(repo_url: str) -> str:
    try:
        result = subprocess.run(
            ["git", "ls-remote", "--heads", repo_url, "main"],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().split()[0][:12]
    except Exception:
        pass
    return ""


# 版本信息缓存
_panel_version_cache = {"data": None, "ts": 0}
_version_cache = {"data": None, "ts": 0}
_stats_cache = {"data": None, "ts": 0}
_stats_lock = threading.Lock()

# --- 调试日志 ---
LOG_PATH = os.environ.get("NEUTRDICE_LOG", os.path.join(os.path.dirname(__file__), "debug.log"))
logger = logging.getLogger("neutrdice")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    file_handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(file_handler)


def log(msg, *args):
    logger.debug(msg, *args)


# --- 后台统计刷新 ---
_stats_executor = ThreadPoolExecutor(max_workers=4)


def _normalize_stats(container_name):
    t0 = time.time()
    log("_normalize_stats start: %s", container_name)
    try:
        stream = get_docker_client().containers.get(container_name).stats(stream=False)
        cpu = stream.get("cpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
        system = stream.get("cpu_stats", {}).get("system_cpu_usage", 0)
        online_cpus = stream.get("cpu_stats", {}).get("online_cpus", 1)
        cpu_percent = 0.0
        if system and online_cpus:
            cpu_percent = (cpu / system) * online_cpus * 100.0

        mem_usage = stream.get("memory_stats", {}).get("usage", 0)
        mem_limit = stream.get("memory_stats", {}).get("limit", 0)
        memory_percent = 0.0
        if mem_limit:
            memory_percent = (mem_usage / mem_limit) * 100.0

        log("_normalize_stats done in %.3fs cpu=%.1f mem=%.1f", time.time() - t0, cpu_percent, memory_percent)
        return {
            "cpu_percent": round(cpu_percent, 1),
            "memory_usage": mem_usage,
            "memory_limit": mem_limit,
            "memory_percent": round(memory_percent, 1),
        }
    except Exception as e:
        log("_normalize_stats error in %.3fs: %s", time.time() - t0, e)
        return None


def get_stats(force_refresh=False):
    now = time.time()
    cached = _stats_cache.get("data") if isinstance(_stats_cache, dict) else None
    cached_ts = _stats_cache.get("ts", 0) if isinstance(_stats_cache, dict) else 0
    if not force_refresh and cached is not None and (now - cached_ts) < 5:
        log("get_stats cache hit")
        return cached

    t0 = time.time()
    containers = [SEALDICE_CONTAINER, NAPCAT_CONTAINER]
    data = {}

    futures = {_stats_executor.submit(_normalize_stats, name): name for name in containers}
    for future in as_completed(futures):
        name = futures[future]
        try:
            data[name] = future.result(timeout=10)
        except Exception as e:
            log("get_stats future error for %s: %s", name, e)
            data[name] = None

    with _stats_lock:
        _stats_cache["data"] = data
        _stats_cache["ts"] = now
    log("get_stats done in %.3fs", time.time() - t0)
    return data


def get_compose_config():
    """读取当前的 docker-compose.yml 内容"""
    t0 = time.time()
    log("read compose file: %s", COMPOSE_FILE)
    if not os.path.exists(COMPOSE_FILE):
        log("compose file missing")
        return None
    with open(COMPOSE_FILE, "r", encoding="utf-8") as f:
        content = f.read()
    log("read compose file done in %.3fs", time.time() - t0)
    return content


def get_current_channel():
    """从 docker-compose.yml 中解析当前使用的版本渠道"""
    t0 = time.time()
    content = get_compose_config()
    if not content:
        log("get_current_channel=unknown because no compose content")
        return "unknown"
    channel = "unknown"
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("image:") and SEALDICE_IMAGE_BASE in line:
            tag = line.split(":")[-1].strip()
            channel = tag if tag not in VALID_SEALDICE_CHANNELS else tag
            log("found image line=%s tag=%s", line, tag)
            break
    log("get_current_channel=%s in %.3fs", channel, time.time() - t0)
    return channel


def get_container_info(container_name):
    """获取容器状态信息"""
    t0 = time.time()
    log("get_container_info start: %s", container_name)
    try:
        container = get_docker_client().containers.get(container_name)
        payload = {
            "name": container.name,
            "status": container.status,
            "running": container.status == "running",
            "started_at": container.attrs.get("State", {}).get("StartedAt", ""),
            "image": container.image.tags[0] if container.image.tags else "unknown",
            "ports": container.ports,
        }
        log("get_container_info done in %.3fs status=%s", time.time() - t0, container.status)
        return payload
    except docker.errors.NotFound:
        log("get_container_info not_found in %.3fs", time.time() - t0)
        return {"name": container_name, "status": "not_found", "running": False}
    except Exception as e:
        log("get_container_info error in %.3fs: %s", time.time() - t0, e)
        return {"name": container_name, "status": "error", "error": str(e), "running": False}


def get_webui_urls():
    """获取 Sealdice 和 NapCat 的 WebUI 访问地址"""
    t0 = time.time()
    host = os.environ.get("HOST_IP", "localhost")
    urls = {"sealdice": None, "napcat": None}

    try:
        ct = get_docker_client().containers.get(SEALDICE_CONTAINER)
        ports = ct.ports
        for container_port, host_bindings in ports.items():
            if container_port == "3211/tcp" and host_bindings:
                urls["sealdice"] = f"http://{host}:{host_bindings[0]['HostPort']}"
                break
    except Exception as e:
        log("get_webui_urls sealdice error: %s", e)

    try:
        ct = get_docker_client().containers.get(NAPCAT_CONTAINER)
        ports = ct.ports
        for container_port, host_bindings in ports.items():
            if container_port == "6099/tcp" and host_bindings:
                urls["napcat"] = f"http://{host}:{host_bindings[0]['HostPort']}/webui"
                break
    except Exception as e:
        log("get_webui_urls napcat error: %s", e)

    log("get_webui_urls done in %.3fs", time.time() - t0)
    return urls


def fetch_sealdice_versions():
    """从 GitHub 获取海豹版本信息"""
    global _version_cache
    now = time.time()
    if _version_cache["data"] and (now - _version_cache["ts"]) < 300:
        log("fetch_sealdice_versions cache hit")
        return _version_cache["data"]

    t0 = time.time()
    log("fetch_sealdice_versions start")
    try:
        import urllib.request

        url = "https://raw.githubusercontent.com/DiceZone/Sealdice-Docker/main/release_info.json"
        req = urllib.request.Request(url, headers={"User-Agent": "Neutrdice-Panel"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())

        versions = {
            "latest": {"label": "最新版本", "tag": "latest"},
            "stable": {"label": "稳定版本（推荐）", "tag": "stable"},
            "pre": {"label": "预发布版本", "tag": "pre"},
        }

        for channel in ["stable", "pre"]:
            if data.get(channel):
                info = data[channel]
                versions[channel]["updated_at"] = info.get("updated_at", "")
                versions[channel]["commit_hash"] = info.get("commit_hash", "")

        _version_cache = {"data": versions, "ts": now}
        log("fetch_sealdice_versions done in %.3fs", time.time() - t0)
        return versions
    except Exception as e:
        log("fetch_sealdice_versions error in %.3fs: %s", time.time() - t0, e)
        return {
            "latest": {"label": "最新版本", "tag": "latest"},
            "stable": {"label": "稳定版本（推荐）", "tag": "stable"},
            "pre": {"label": "预发布版本", "tag": "pre"},
        }


def _build_container_payload_fast(container_name, labels):
    t0 = time.time()
    log("_build_container_payload_fast start: %s", container_name)
    try:
        container = get_docker_client().containers.get(container_name)
        ports = []
        raw_ports = container.ports or {}
        if isinstance(raw_ports, dict):
            port_items = raw_ports.items()
        elif isinstance(raw_ports, list):
            port_items = [
                (str(item.get("PrivatePort", item.get("private_port", 0))), [item])
                for item in raw_ports
            ]
        else:
            port_items = []

        for container_port, bindings in port_items:
            container_port_str = str(container_port)
            parts = container_port_str.split("/")
            private_port = int(parts[0]) if parts[0].isdigit() else 0
            port_type = parts[1] if len(parts) > 1 else "tcp"
            for binding in (bindings or []):
                ports.append({
                    "ip": binding.get("HostIp", binding.get("ip", "")),
                    "private_port": private_port,
                    "public_port": binding.get("HostPort", binding.get("public_port", 0)),
                    "type": port_type,
                })

        payload = {
            "id": container_name,
            "name": container_name,
            "image": container.image.tags[0] if container.image.tags else "unknown",
            "status": container.status,
            "state": container.status,
            "ports": ports,
            "labels": labels,
            "config": {},
            "stats": None,
        }

        instance_type = labels.get("neutrdice.type")
        if instance_type == "napcat":
            webui_password = labels.get("neutrdice.webui_password", "")
            if not webui_password:
                webui_password = _get_napcat_webui_token(container_name)
            payload["config"] = {
                "instance_type": "napcat",
                "instance_name": labels.get("neutrdice.name", container_name),
                "webui_password": webui_password,
                "network_address": labels.get("neutrdice.network_address", ""),
            }
        elif instance_type == "sealdice":
            payload["config"] = {
                "instance_type": "sealdice",
                "instance_name": labels.get("neutrdice.instance", container_name),
                "channel": labels.get("neutrdice.channel", "stable"),
                "qq_account": labels.get("neutrdice.qq", ""),
                "login_method": labels.get("neutrdice.login_method", "napcat"),
                "network_address": labels.get("neutrdice.network_address", ""),
            }
        else:
            payload["config"] = {
                "instance_type": instance_type or "system",
                "instance_name": labels.get("neutrdice.name", container_name),
            }

        log("_build_container_payload_fast done in %.3fs", time.time() - t0)
        return payload
    except docker.errors.NotFound:
        log("_build_container_payload_fast not_found in %.3fs", time.time() - t0)
        instance_type = labels.get("neutrdice.type")
        config = {}
        if instance_type == "napcat":
            config = {
                "instance_type": "napcat",
                "instance_name": labels.get("neutrdice.name", container_name),
                "webui_password": _get_napcat_webui_token(container_name),
                "network_address": labels.get("neutrdice.network_address", ""),
            }
        elif instance_type == "sealdice":
            config = {
                "instance_type": "sealdice",
                "instance_name": labels.get("neutrdice.instance", container_name),
                "channel": labels.get("neutrdice.channel", "stable"),
                "qq_account": labels.get("neutrdice.qq", ""),
                "login_method": labels.get("neutrdice.login_method", "napcat"),
                "network_address": labels.get("neutrdice.network_address", ""),
            }
        else:
            config = {
                "instance_type": instance_type or "system",
                "instance_name": labels.get("neutrdice.name", container_name),
            }
        return {
            "id": container_name,
            "name": container_name,
            "image": "unknown",
            "status": "not_found",
            "state": "not_found",
            "ports": [],
            "labels": labels,
            "config": config,
            "stats": None,
        }
    except Exception as e:
        log("_build_container_payload_fast error in %.3fs: %s", time.time() - t0, e)
        return {
            "id": container_name,
            "name": container_name,
            "image": "unknown",
            "status": "error",
            "state": "error",
            "ports": [],
            "labels": labels,
            "config": {},
            "stats": None,
        }


def build_container_payload(container_name, labels):
    t0 = time.time()
    log("build_container_payload start: %s", container_name)
    info = get_container_info(container_name)
    ports = []
    raw_ports = info.get("ports") or {}
    if isinstance(raw_ports, dict):
        port_items = raw_ports.items()
    elif isinstance(raw_ports, list):
        port_items = [
            (str(item.get("PrivatePort", item.get("private_port", 0))), [item])
            for item in raw_ports
        ]
    else:
        port_items = []

    for container_port, bindings in port_items:
        container_port_str = str(container_port)
        parts = container_port_str.split("/")
        private_port = int(parts[0]) if parts[0].isdigit() else 0
        port_type = parts[1] if len(parts) > 1 else "tcp"
        for binding in (bindings or []):
            ports.append({
                "ip": binding.get("HostIp", binding.get("ip", "")),
                "private_port": private_port,
                "public_port": binding.get("HostPort", binding.get("public_port", 0)),
                "type": port_type,
            })

    stats = None
    cached = get_stats()
    if cached.get(container_name):
        stats = cached[container_name]

    config = {}
    instance_type = labels.get("neutrdice.type")
    if instance_type == "napcat":
        webui_password = labels.get("neutrdice.webui_password", "")
        if not webui_password:
            webui_password = _get_napcat_webui_token(container_name)
        config = {
            "instance_type": "napcat",
            "instance_name": labels.get("neutrdice.name", container_name),
            "webui_password": webui_password,
            "network_address": labels.get("neutrdice.network_address", ""),
        }
    elif instance_type == "sealdice":
        config = {
            "instance_type": "sealdice",
            "instance_name": labels.get("neutrdice.instance", container_name),
            "channel": labels.get("neutrdice.channel", "stable"),
            "qq_account": labels.get("neutrdice.qq", ""),
            "login_method": labels.get("neutrdice.login_method", "napcat"),
            "network_address": labels.get("neutrdice.network_address", ""),
        }
    else:
        config = {
            "instance_type": instance_type or "system",
            "instance_name": labels.get("neutrdice.name", container_name),
        }

    log("build_container_payload done in %.3fs", time.time() - t0)
    return {
        "id": container_name,
        "name": container_name,
        "image": info.get("image", "unknown"),
        "status": info.get("status", "unknown"),
        "state": info.get("status", "unknown"),
        "ports": ports,
        "labels": labels,
        "config": config,
        "stats": stats,
    }


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/status")
def api_status():
    t0 = time.time()
    log("api_status start")
    sealdice_name = os.environ.get("SEALDICE_CONTAINER", SEALDICE_CONTAINER)
    napcat_name = os.environ.get("NAPCAT_CONTAINER", NAPCAT_CONTAINER)

    labels_sealdice = {
        "neutrdice.built-in": "true",
        "neutrdice.type": "sealdice",
        "neutrdice.instance": sealdice_name,
        "neutrdice.channel": get_current_channel(),
        "neutrdice.name": "海豹核心",
    }
    labels_napcat = {
        "neutrdice.built-in": "true",
        "neutrdice.type": "napcat",
        "neutrdice.instance": napcat_name,
        "neutrdice.name": "NapCat QQ",
    }

    sealdice = build_container_payload(sealdice_name, labels_sealdice)
    napcat = build_container_payload(napcat_name, labels_napcat)
    webui_urls = get_webui_urls()

    payload = {
        "sealdice": sealdice,
        "napcat": napcat,
        "current_channel": get_current_channel(),
        "webui": webui_urls,
    }
    log("api_status done in %.3fs", time.time() - t0)
    return jsonify(payload)


@app.route("/api/containers")
def api_containers():
    t0 = time.time()
    log("api_containers start")
    sealdice_name = os.environ.get("SEALDICE_CONTAINER", SEALDICE_CONTAINER)
    napcat_name = os.environ.get("NAPCAT_CONTAINER", NAPCAT_CONTAINER)

    labels_sealdice = {
        "neutrdice.built-in": "true",
        "neutrdice.type": "sealdice",
        "neutrdice.instance": sealdice_name,
        "neutrdice.channel": get_current_channel(),
        "neutrdice.name": "海豹核心",
    }
    labels_napcat = {
        "neutrdice.built-in": "true",
        "neutrdice.type": "napcat",
        "neutrdice.instance": napcat_name,
        "neutrdice.name": "NapCat QQ",
    }

    containers = []
    for name, labels in [(sealdice_name, labels_sealdice), (napcat_name, labels_napcat)]:
        containers.append(_build_container_payload_fast(name, labels))

    log("api_containers done in %.3fs", time.time() - t0)
    return jsonify({"success": True, "containers": containers})


@app.route("/api/instances")
def api_instances():
    t0 = time.time()
    log("api_instances start")
    sealdice_name = os.environ.get("SEALDICE_CONTAINER", SEALDICE_CONTAINER)
    napcat_name = os.environ.get("NAPCAT_CONTAINER", NAPCAT_CONTAINER)
    channel = get_current_channel()

    instances = [
        {
            "id": sealdice_name,
            "name": sealdice_name,
            "qq": "",
            "channel": channel,
            "login_method": "napcat",
            "container_id": sealdice_name,
            "container_name": sealdice_name,
        }
    ]

    log("api_instances done in %.3fs", time.time() - t0)
    return jsonify({"success": True, "instances": instances})


@app.route("/api/stats")
def api_stats():
    t0 = time.time()
    log("api_stats start")
    data = get_stats(force_refresh=True)
    log("api_stats done in %.3fs", time.time() - t0)
    return jsonify({"success": True, "stats": data})


@app.route("/api/logs/<container>")
def api_logs(container):
    t0 = time.time()
    log("api_logs start: %s", container)
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_logs alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        log("api_logs invalid container: %s", container)
        return jsonify({"error": "无效的容器名称"}), 400

    tail = request.args.get("tail", 200, type=int)
    try:
        ct = get_docker_client().containers.get(real_container)
        logs = ct.logs(tail=tail, timestamps=True).decode("utf-8", errors="replace")
        log("api_logs done in %.3fs", time.time() - t0)
        return jsonify({"success": True, "logs": logs, "container": alias})
    except docker.errors.NotFound:
        log("api_logs not found in %.3fs", time.time() - t0)
        return jsonify({"error": f"容器 {real_container} 不存在"}), 404
    except Exception as e:
        log("api_logs error in %.3fs: %s", time.time() - t0, e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/restart/<container>", methods=["POST"])
def api_restart(container):
    t0 = time.time()
    log("api_restart start: %s", container)
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_restart alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400

    try:
        ct = get_docker_client().containers.get(real_container)
        ct.restart()
        log("api_restart done in %.3fs", time.time() - t0)
        return jsonify({"success": True, "message": f"{alias} 正在重启..."})
    except docker.errors.NotFound:
        log("api_restart not found in %.3fs", time.time() - t0)
        return jsonify({"error": f"容器 {real_container} 不存在"}), 404
    except Exception as e:
        log("api_restart error in %.3fs: %s", time.time() - t0, e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/versions")
def api_versions():
    t0 = time.time()
    log("api_versions start")
    versions = fetch_sealdice_versions()
    current = get_current_channel()
    log("api_versions done in %.3fs", time.time() - t0)
    return jsonify({"versions": versions, "current": current})


@app.route("/api/version/change", methods=["POST"])
def api_change_version():
    t0 = time.time()
    log("api_change_version start")
    data = request.get_json()
    channel = data.get("channel", "").strip()

    if channel not in VALID_SEALDICE_CHANNELS:
        log("api_change_version invalid channel: %s", channel)
        return jsonify({"error": f"无效的版本渠道: {channel}，可选: {', '.join(VALID_SEALDICE_CHANNELS)}"}), 400

    try:
        content = get_compose_config()
        if not content:
            return jsonify({"error": "找不到 docker-compose.yml"}), 500

        new_content = []
        changed = False
        for line in content.split("\n"):
            if f"image: {SEALDICE_IMAGE_BASE}:" in line:
                indent = line[: len(line) - len(line.lstrip())]
                new_line = f"{indent}image: {SEALDICE_IMAGE_BASE}:{channel}"
                new_content.append(new_line)
                changed = True
            else:
                new_content.append(line)

        if not changed:
            log("api_change_version no image line matched")
            return jsonify({"error": "无法在 compose 文件中找到海豹镜像配置"}), 500

        with open(COMPOSE_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(new_content))

        result_pull = subprocess.run(
            ["docker", "compose", "-f", COMPOSE_FILE, "pull", "sealdice"],
            capture_output=True, text=True, timeout=120, cwd=COMPOSE_DIR
        )

        result_up = subprocess.run(
            ["docker", "compose", "-f", COMPOSE_FILE, "up", "-d", "sealdice"],
            capture_output=True, text=True, timeout=60, cwd=COMPOSE_DIR
        )

        log("api_change_version done in %.3fs channel=%s", time.time() - t0, channel)
        return jsonify({
            "success": True,
            "channel": channel,
            "message": f"已切换到 {channel} 版本，容器正在重新部署...",
            "pull_output": result_pull.stdout[-500:] + result_pull.stderr[-500:],
            "up_output": result_up.stdout[-500:] + result_up.stderr[-500:],
        })
    except subprocess.TimeoutExpired:
        log("api_change_version timeout")
        return jsonify({"error": "操作超时，请检查网络连接"}), 500
    except Exception as e:
        log("api_change_version error in %.3fs: %s", time.time() - t0, e)
        return jsonify({"error": str(e)}), 500


def _fetch_github_latest_tag(org_repo: str) -> tuple[str, str]:
    """获取 GitHub 最新的 tag 版本号和发布说明"""
    try:
        import urllib.request

        url = f"https://api.github.com/repos/{org_repo}/releases/latest"
        req = urllib.request.Request(url, headers={"User-Agent": "Neutrdice-Panel", "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())

        tag = data.get("tag_name", "").lstrip("v")
        body = data.get("body", "")[:500] if data.get("body") else ""
        log("_fetch_github_latest_tag tag=%s", tag)
        return tag, body
    except Exception as e:
        log("_fetch_github_latest_tag error: %s", e)
        return "", ""


@app.route("/api/panel/version")
def api_panel_version():
    t0 = time.time()
    log("api_panel_version start")
    try:
        now = time.time()
        global _panel_version_cache
        if (
            _panel_version_cache.get("data")
            and (now - _panel_version_cache.get("ts", 0)) < 600
        ):
            log("api_panel_version cache hit")
            return jsonify(_panel_version_cache["data"])

        # 立即返回本地版本，不等待 GitHub API
        local_rev = os.environ.get("IMAGE_TAG", "unknown")

        # 异步获取最新版本
        latest_tag, release_body = "", ""
        try:
            latest_tag, release_body = _fetch_github_latest_tag(
                NEUTRDICE_PANEL_REPO.rstrip(".git").replace("https://github.com/", "")
            )
        except Exception:
            pass

        update_available = bool(latest_tag and local_rev and latest_tag != local_rev)
        payload = {
            "success": True,
            "repo": NEUTRDICE_PANEL_REPO,
            "repo_name": NEUTRDICE_PANEL_REPO_NAME,
            "latest_tag": latest_tag,
            "local_rev": local_rev,
            "release_body": release_body,
            "update_available": update_available,
        }
        _panel_version_cache = {"data": payload, "ts": now}
        log("api_panel_version done in %.3fs update_available=%s", time.time() - t0, update_available)
        return jsonify(payload)
    except Exception as e:
        log("api_panel_version error in %.3fs: %s", time.time() - t0, e)
        return jsonify({"success": False, "update_available": False, "error": str(e)})


@app.route("/api/panel/update", methods=["POST"])
def api_panel_update():
    t0 = time.time()
    log("api_panel_update start")
    try:
        repo_path = os.environ.get("NEUTRDICE_PANEL_REPO_PATH", "/app/compose")
        os.makedirs(repo_path, exist_ok=True)

        if not os.path.exists(os.path.join(repo_path, ".git")):
            init = subprocess.run(
                ["git", "clone", NEUTRDICE_PANEL_REPO, repo_path],
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            if init.returncode != 0:
                return jsonify({
                    "success": False,
                    "error": init.stderr[-1000:].strip() or init.stdout[-1000:].strip(),
                }), 500

        fetch = subprocess.run(
            ["git", "-C", repo_path, "fetch", "origin"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if fetch.returncode != 0:
            return jsonify({
                "success": False,
                "error": fetch.stderr[-1000:].strip() or fetch.stdout[-1000:].strip(),
            }), 500

        reset = subprocess.run(
            ["git", "-C", repo_path, "reset", "--hard", "origin/main"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if reset.returncode != 0:
            return jsonify({
                "success": False,
                "error": reset.stderr[-1000:].strip() or reset.stdout[-1000:].strip(),
            }), 500

        compose_path = Path(repo_path) / "docker-compose.yml"
        compose_exists = compose_path.exists()

        update_commands = []
        update_commands.append(subprocess.run(
            ["docker", "compose", "-f", str(compose_path), "pull"],
            capture_output=True,
            text=True,
            timeout=180,
            cwd=repo_path,
            check=False,
        ))
        up_targets = []
        if compose_exists:
            up_targets.append(str(compose_path))
        panel_name = get_panel_container_name()
        up_targets.append("-d")
        up_targets.append(panel_name)
        update_commands.append(subprocess.run(
            ["docker", "compose", *up_targets, "up"],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=repo_path,
            check=False,
        ))

        outputs = []
        for cmd in update_commands:
            outputs.append((cmd.returncode, cmd.stdout[-500:], cmd.stderr[-500:]))
            if cmd.returncode != 0:
                return jsonify({
                    "success": False,
                    "message": "已拉取最新代码，但服务更新失败。",
                    "outputs": outputs,
                }), 500

        global _panel_version_cache
        _panel_version_cache = {}
        log("api_panel_update done in %.3fs", time.time() - t0)
        return jsonify({
            "success": True,
            "message": "NeutrDice 已从 GitHub 更新到最新版本并重启。",
            "outputs": outputs,
        })
    except subprocess.TimeoutExpired:
        log("api_panel_update timeout")
        return jsonify({"success": False, "error": "操作超时，请检查网络连接"}), 500
    except Exception as e:
        log("api_panel_update error in %.3fs: %s", time.time() - t0, e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/health")
def api_health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


@app.route("/auth/login", methods=["POST"])
def auth_login():
    password = (request.get_json() or {}).get("password", "")
    if password == os.environ.get("PANEL_PASSWORD", "neutrdice2024"):
        return jsonify({"success": True, "token": password})
    return jsonify({"success": False, "message": "密码错误"}), 401


@app.route("/auth/check")
def auth_check():
    password = os.environ.get("PANEL_PASSWORD", "neutrdice2024")
    return jsonify({"authenticated": True, "password": password})


@app.route("/containers/<container>")
def api_containers_detail(container):
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_containers_detail alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    try:
        ct = get_docker_client().containers.get(real_container)
        info = get_container_info(real_container)
        return jsonify({"success": True, "container": {**info, "name": alias, "id": alias}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/containers/<container>/info")
def api_containers_info(container):
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_containers_info alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    info = get_container_info(real_container)
    return jsonify({"success": True, "container": {**info, "name": alias, "id": alias}})


@app.route("/containers/<container>/logs")
def api_containers_logs(container):
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_containers_logs alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    tail = request.args.get("tail", 200, type=int)
    try:
        ct = get_docker_client().containers.get(real_container)
        logs = ct.logs(tail=tail, timestamps=True).decode("utf-8", errors="replace")
        return jsonify({"success": True, "logs": logs, "container": alias})
    except docker.errors.NotFound:
        return jsonify({"error": f"容器 {real_container} 不存在"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/containers/<container>/start", methods=["POST"])
def api_containers_start(container):
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_containers_start alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    try:
        ct = get_docker_client().containers.get(real_container)
        ct.start()
        return jsonify({"success": True, "message": f"{alias} 已启动"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/containers/<container>/stop", methods=["POST"])
def api_containers_stop(container):
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_containers_stop alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    try:
        ct = get_docker_client().containers.get(real_container)
        ct.stop()
        return jsonify({"success": True, "message": f"{alias} 已停止"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/containers/<container>/restart", methods=["POST"])
def api_containers_restart(container):
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_containers_restart alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    try:
        ct = get_docker_client().containers.get(real_container)
        ct.restart()
        return jsonify({"success": True, "message": f"{alias} 正在重启..."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/containers/<container>/update", methods=["POST"])
def api_containers_update(container):
    real_container, alias = resolve_container(container)
    if real_container != alias:
        log("api_containers_update alias resolved: %s -> %s", alias, real_container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    data = request.get_json() or {}
    channel = data.get("channel", "").strip()
    if channel not in VALID_SEALDICE_CHANNELS:
        return jsonify({"error": f"无效的版本渠道: {channel}"}), 400
    try:
        content = get_compose_config()
        if not content:
            return jsonify({"error": "找不到 docker-compose.yml"}), 500
        new_content = []
        changed = False
        for line in content.split("\n"):
            if f"image: {SEALDICE_IMAGE_BASE}:" in line:
                indent = line[: len(line) - len(line.lstrip())]
                new_content.append(f"{indent}image: {SEALDICE_IMAGE_BASE}:{channel}")
                changed = True
            else:
                new_content.append(line)
        if not changed:
            return jsonify({"error": "无法在 compose 文件中找到海豹镜像配置"}), 500
        with open(COMPOSE_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(new_content))
        subprocess.run(
            ["docker", "compose", "-f", COMPOSE_FILE, "pull", real_container],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=COMPOSE_DIR,
        )
        subprocess.run(
            ["docker", "compose", "-f", COMPOSE_FILE, "up", "-d", real_container],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=COMPOSE_DIR,
        )
        return jsonify({"success": True, "message": f"已更新 {alias}，容器正在重新部署..."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 日志持久化辅助函数 ---
def append_to_log_file(container: str, line: str):
    """追加日志到文件，保留最后 LOG_FILE_MAX_LINES 行"""
    log_file = os.path.join(LOG_DIR, f"{container}.log")
    try:
        lines = []
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
        lines.append(line + "\n")
        if len(lines) > LOG_FILE_MAX_LINES:
            lines = lines[-LOG_FILE_MAX_LINES:]
        with open(log_file, "w", encoding="utf-8") as f:
            f.writelines(lines)
    except Exception as e:
        logging.error(f"Failed to write log file: {e}")


# --- SSE 流式日志端点 ---
@app.route("/api/logs/stream/<container>")
def api_logs_stream(container):
    real_container, alias = resolve_container(container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400

    def generate():
        try:
            ct = get_docker_client().containers.get(real_container)
            if ct.status != "running":
                yield f"data: [等待容器启动...]\n\n"
            for line in ct.logs(stream=True, follow=True, timestamps=True, tail=200):
                decoded = line.decode("utf-8", errors="replace").rstrip("\n")
                append_to_log_file(real_container, decoded)
                yield f"data: {decoded}\n\n"
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"

    return app.response_class(generate(), mimetype="text/event-stream")


# --- 获取历史日志端点 ---
@app.route("/api/logs/<container>")
def api_get_logs(container):
    """获取容器历史日志"""
    real_container, alias = resolve_container(container)
    if not real_container:
        return jsonify({"error": "无效的容器名称"}), 400
    log_file = os.path.join(LOG_DIR, f"{real_container}.log")
    if not os.path.exists(log_file):
        return jsonify({"logs": []})
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            lines = [l.rstrip("\n") for l in f.readlines()]
        return jsonify({"logs": lines})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 配置管理端点 ---
CONFIG_FILE = os.path.join(os.environ.get("NEUTRDICE_BASE_DIR", "/opt/neutrdice"), "panel_config.json")


def _load_config() -> dict:
    """加载配置文件"""
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_config(data: dict) -> bool:
    """保存配置文件"""
    try:
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        log("_save_config error: %s", e)
        return False


@app.route("/api/config", methods=["GET"])
def api_config_get():
    """获取面板配置"""
    try:
        config = _load_config()
        return jsonify({
            "success": True,
            "config": {
                "image_mirror": config.get("image_mirror", "ghcr.io"),
                "panel_port": os.environ.get("PANEL_PORT", "3001"),
                "panel_password": os.environ.get("PANEL_PASSWORD", "neutrdice2024"),
                "docker_socket": os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock"),
                "base_dir": os.environ.get("NEUTRDICE_BASE_DIR", "/opt/neutrdice"),
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/config", methods=["POST"])
def api_config_save():
    """保存面板配置"""
    try:
        data = request.get_json() or {}
        config = _load_config()
        
        if "image_mirror" in data:
            config["image_mirror"] = data["image_mirror"]
        
        if _save_config(config):
            return jsonify({"success": True, "message": "配置已保存"})
        else:
            return jsonify({"success": False, "error": "保存失败"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def refresh_cache_loop():
    """后台定期刷新版本缓存"""
    while True:
        try:
            fetch_sealdice_versions()
            get_stats()
        except Exception:
            pass
        time.sleep(2)


if __name__ == "__main__":
    threading.Thread(target=refresh_cache_loop, daemon=True).start()
    log("startup port=%s", os.environ.get("PORT", 5000))
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
