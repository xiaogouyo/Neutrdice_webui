# NeutrDice Panel

自定义 Docker 容器管理面板，用于管理海豹骰子和 NapCat 的部署、启停、版本管理、日志查看和 WebUI 访问。

## 功能特性

- **容器管理** - 海豹和 NapCat 容器的启停、重启
- **版本管理** - 支持 latest / stable / pre 三种版本渠道的拉取、下载、部署
- **日志查看** - 实时流式日志显示，支持历史日志查看
- **WebUI 访问** - 海豹和 NapCat 的 WebUI 一键访问
- **简约 UI** - 紫色骰子主题的现代化管理界面

## 架构

```
neutrdice-panel/
├── backend/          # Go 后端服务 (Gin)
│   ├── handlers/     # HTTP 路由处理
│   ├── middleware/   # 中间件 (认证、日志)
│   ├── docker/       # Docker API 封装
│   └── version/      # 版本信息获取
├── frontend/         # React 前端 (Vite + TypeScript + Tailwind)
├── docker/          # Docker 配置文件
└── scripts/         # 部署脚本
```

## 快速开始

### 一键部署

```bash
bash <(curl -sL https://your-deploy-url/neutrdice-install.sh)
```

### 手动部署

1. 构建并启动：
```bash
cd docker
docker compose up -d --build
```

2. 访问面板：`http://your-server:3000`

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| NeutrDice Panel | 3000 | 面板前端访问 |
| Panel API | 3001 | 后端 API 服务 |

## 许可证

MIT License
