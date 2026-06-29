// ===== Neutrdice Panel App =====

const REFRESH_INTERVAL = 5000;
let logContainer = null;
let refreshTimer = null;
const pageCache = { status: null, versions: null };

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  fetchStatus();
  fetchVersions();
  refreshTimer = setInterval(fetchStatus, REFRESH_INTERVAL);
});

function updateClock() {
  document.getElementById("clock").textContent = new Date().toLocaleString("zh-CN");
}

async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.3s";
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function formatUptime(startedAt) {
  if (!startedAt) return "--";
  const started = new Date(startedAt);
  const now = new Date();
  const diff = Math.floor((now - started) / 1000);
  if (diff < 0) return "--";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusBadgeClass(status) {
  if (status === "running") return "running";
  if (status === "exited" || status === "stopped") return "stopped";
  if (status === "not_found") return "not_found";
  return "error";
}

function statusLabel(status) {
  const map = {
    running: "运行中",
    exited: "已停止",
    stopped: "已停止",
    not_found: "未找到",
    error: "异常",
  };
  return map[status] || status;
}

async function fetchStatus() {
  if (pageCache.status) {
    updateCard("sealdice", pageCache.status.sealdice);
    updateCard("napcat", pageCache.status.napcat);
    updateWebUIButtons(pageCache.status.webui);
    updateCurrentChannel(pageCache.status.current_channel);
  }

  try {
    const data = await apiGet("/api/status");
    pageCache.status = data;
    updateCard("sealdice", data.sealdice);
    updateCard("napcat", data.napcat);
    updateWebUIButtons(data.webui);
    updateCurrentChannel(data.current_channel);
  } catch (e) {
    // keep previous state visible
  }
}

function updateCard(type, info) {
  const prefix = type === "sealdice" ? "sd" : "nc";
  const statusEl = document.getElementById(`${prefix}-status`);
  statusEl.textContent = statusLabel(info.status);
  statusEl.className = `status-badge ${statusBadgeClass(info.status)}`;

  document.getElementById(`${prefix}-image`).textContent = info.image || "--";
  document.getElementById(`${prefix}-uptime`).textContent = formatUptime(info.started_at);

  if (type === "sealdice" && info.image) {
    const tag = info.image.split(":").pop() || "";
    document.getElementById("sd-version").textContent = tag;
  }
}

function updateWebUIButtons(urls) {
  const sdBtn = document.getElementById("btn-sd-webui");
  const ncBtn = document.getElementById("btn-nc-webui");

  if (urls.sealdice) {
    sdBtn.disabled = false;
    sdBtn.dataset.url = urls.sealdice;
  } else {
    sdBtn.disabled = true;
    delete sdBtn.dataset.url;
  }

  if (urls.napcat) {
    ncBtn.disabled = false;
    ncBtn.dataset.url = urls.napcat;
  } else {
    ncBtn.disabled = true;
    delete ncBtn.dataset.url;
  }
}

function updateCurrentChannel(channel) {
  const el = document.getElementById("current-channel-tag");
  el.textContent = channel || "unknown";
}

function openWebUI(type) {
  const btn = document.getElementById(`btn-${type}-webui`);
  const url = btn.dataset.url;
  if (url) {
    window.open(url, "_blank");
  } else {
    toast("WebUI 地址不可用", "error");
  }
}

async function restartContainer(type) {
  const label = type === "sealdice" ? "海豹" : "NapCat";
  try {
    toast(`正在重启 ${label}...`, "info");
    await apiPost(`/api/restart/${type}`);
    toast(`${label} 重启成功`, "success");
    setTimeout(fetchStatus, 2000);
  } catch (e) {
    toast(`重启失败: ${e.message}`, "error");
  }
}

async function showLogs(type) {
  const label = type === "sealdice" ? "SealDice 海豹" : "NapCat";
  document.getElementById("log-title").textContent = `${label} 日志`;
  document.getElementById("log-content").textContent = "加载中...";
  document.getElementById("log-modal").classList.add("open");
  logContainer = type;
  await refreshLogs();
}

async function refreshLogs() {
  if (!logContainer) return;
  const el = document.getElementById("log-content");
  el.textContent = "加载中...";
  try {
    const data = await apiGet(`/api/logs/${logContainer}?tail=300`);
    el.textContent = data.logs || "(无日志)";
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    el.textContent = `加载失败: ${e.message}`;
  }
}

function closeLogs() {
  document.getElementById("log-modal").classList.remove("open");
  logContainer = null;
}

document.addEventListener("click", (e) => {
  if (e.target.id === "log-modal") closeLogs();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLogs();
});

async function fetchVersions() {
  if (pageCache.versions) {
    renderVersionCards(pageCache.versions, pageCache.currentVersion);
  }

  try {
    const data = await apiGet("/api/versions");
    pageCache.versions = data.versions;
    pageCache.currentVersion = data.current;
    renderVersionCards(data.versions, data.current);
  } catch (e) {
    document.getElementById("version-grid").innerHTML =
      '<div class="version-card skeleton">加载版本信息失败</div>';
  }
}

function renderVersionCards(versions, current) {
  const grid = document.getElementById("version-grid");
  const channelOrder = ["stable", "latest", "pre"];
  const labels = {
    latest: "最新版本",
    stable: "稳定版本",
    pre: "预发布版本",
  };
  const descs = {
    latest: "包含所有通道的最新构建",
    stable: "经过验证的正式发布版本",
    pre: "抢先体验新功能，可能不稳定",
  };

  let html = "";
  for (const ch of channelOrder) {
    const v = versions[ch] || {};
    const isActive = ch === current;
    const updatedAt = v.updated_at
      ? new Date(v.updated_at).toLocaleString("zh-CN")
      : "";
    const hash = v.commit_hash || "";

    html += `
      <div class="version-card ${isActive ? "active" : ""}" id="vc-${ch}">
        <div class="v-label">${labels[ch]}</div>
        <div class="v-tag">:${v.tag || ch}</div>
        <div class="v-info">${descs[ch]}</div>
        ${updatedAt ? `<div class="v-info">更新: ${updatedAt}</div>` : ""}
        ${hash ? `<div class="v-info">commit: ${hash}</div>` : ""}
        <div class="v-action">
          <button class="btn btn-primary btn-sm" onclick="changeVersion('${ch}')">
            切换到此版本
          </button>
        </div>
      </div>`;
  }
  grid.innerHTML = html;
}

async function changeVersion(channel) {
  const labels = { latest: "最新版本", stable: "稳定版本", pre: "预发布版本" };
  const label = labels[channel] || channel;

  if (!confirm(`确定要切换到 ${label} (${channel}) 吗？\n\n切换版本会重新拉取镜像并重建容器，海豹将会短暂重启。`)) {
    return;
  }

  try {
    toast(`正在切换到 ${label}，请稍候...`, "info");
    const result = await apiPost("/api/version/change", { channel });
    toast(`版本切换成功: ${result.message}`, "success");
    setTimeout(() => {
      fetchStatus();
      fetchVersions();
    }, 3000);
  } catch (e) {
    toast(`版本切换失败: ${e.message}`, "error");
  }
}
