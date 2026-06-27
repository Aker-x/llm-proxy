# llm-delegate

单机多实例的 LLM 代理服务，提供统一代理入口、用户/API Key 体系、余额计费和管理后台。

## 技术栈

- Node.js + Express
- PostgreSQL
- Redis
- Nginx

## 运行拓扑

- `nginx` 对外提供统一入口
- `app-1`、`app-2`、`app-3` 作为应用实例在 Docker 内网运行
- `postgres` 和 `redis` 作为共享基础设施
- `migrate` 在应用启动前执行数据库迁移
- 所有响应都会带上 `X-Proxy-Instance`，用于识别当前请求由哪个实例处理

## 快速开始

开发机直接运行：

```bat
start-dev.bat
```

这个脚本会：

- 检查 Docker 是否可用
- 自动尝试启动 Docker Desktop
- 启动 `postgres` 和 `redis`
- 默认导入 [`dev-data/llm_delegate.sql`](./dev-data/llm_delegate.sql)
- 构建应用镜像
- 启动 `migrate + nginx + app-1/app-2/app-3`

开发入口：

- [http://127.0.0.1:3000](http://127.0.0.1:3000)

常用命令：

```powershell
.\start-dev.bat -SkipImportDevData
powershell -ExecutionPolicy Bypass -File .\scripts\start-multi-instance.ps1 -Mode dev -SkipImportDevData
```

## 部署概览

常用入口：

- Windows 本地部署：[start-deploy.bat](./start-deploy.bat)
- Windows SSH 连接：[ssh-ecs.bat](./ssh-ecs.bat)
- Windows 远程执行：[exec-ecs.bat](./exec-ecs.bat)
- Windows ECS 部署：[deploy-ecs.bat](./deploy-ecs.bat)
- Linux：[`scripts/start-multi-instance.sh`](./scripts/start-multi-instance.sh)

默认行为：

- 部署入口默认使用 `http://127.0.0.1`
- `.env.deploy` 默认 `PORT=80`
- 如果同机有公网 IP 且开放了 `80/tcp`，可以直接通过 `http://<your-server-public-ip>/` 访问
- 如果部署目录里存在 `llm-delegate.tar`，启动脚本会自动尝试 `docker load`

### ECS 部署支持

当前代码库保留了两套 ECS 相关脚本和数据路径，代码逻辑保持一致，但数据库、Redis、CLIProxy auth/config、运行数据彼此独立。

部署前请确认目标主机和脚本入口是否一致，避免把一台机器的数据同步到另一台机器。

### 本地构建并导出镜像

```powershell
docker compose --env-file .env.deploy -f docker-compose.deploy.yml build migrate
docker save -o llm-delegate.tar llm-delegate:latest
```

### Linux 服务器上启动

```bash
cd /root/llm-delegate
chmod +x scripts/start-multi-instance.sh
MODE=deploy ./scripts/start-multi-instance.sh
```

## 文档

- [docs/alibaba-cloud-ecs-deploy.md](./docs/alibaba-cloud-ecs-deploy.md): 阿里云 ECS 部署步骤、推荐规范、安全组和验证命令
- [docs/ecs-targets.md](./docs/ecs-targets.md): ECS 目标、IP、脚本入口和数据隔离说明
- [docs/双代理部署说明书.md](./docs/双代理部署说明书.md): 当前部署状态、最新源码部署方式、连接方式和维护命令
- [docs/cliproxy-auth-health-check.md](./docs/cliproxy-auth-health-check.md): 校验 CLIProxy 授权文件是否失效、是否仍可轮询，以及额度耗尽/冷却中的脚本说明

## 配置文件

- [`.env.deploy`](./.env.deploy): 单机多实例部署配置
- [`docker-compose.deploy.yml`](./docker-compose.deploy.yml): 开发机多实例 compose，包含镜像构建
- [`docker-compose.deploy-image.yml`](./docker-compose.deploy-image.yml): 部署机多实例 compose，直接使用已有镜像
- [`deploy/nginx/default.conf.template`](./deploy/nginx/default.conf.template): Nginx 反向代理与负载均衡模板
- [Dockerfile](./Dockerfile): 应用镜像构建文件

## Dev Data

导出开发数据：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-dev-data.ps1
```

导入开发数据：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import-dev-data.ps1 -ComposeFile docker-compose.deploy.yml
```

导出文件：

- [`dev-data/llm_delegate.sql`](./dev-data/llm_delegate.sql)
- [`dev-data/export-info.json`](./dev-data/export-info.json)

说明：

- 只会同步 PostgreSQL 开发数据
- Redis session 不在导出范围内
- 导入开发数据后，账号密码以导出数据为准

## 默认账号

空库首次初始化时，默认种子账号来自代码：

- 管理员：`luozhendong / L19991219zd#`
- 用户：`user / 123456`

如果导入了 [`dev-data/llm_delegate.sql`](./dev-data/llm_delegate.sql)，则以导入数据里的账号为准。

## 关键文件

- [src/app.js](./src/app.js): 应用入口
- [src/server.js](./src/server.js): 启动入口
- [src/bootstrap/load-env.js](./src/bootstrap/load-env.js): 环境变量加载
- [src/bootstrap/create-runtime-infra.js](./src/bootstrap/create-runtime-infra.js): 运行时依赖装配
- [src/bootstrap/ensure-initial-state.js](./src/bootstrap/ensure-initial-state.js): 初始种子数据
- [src/services/model-resolution-service.js](./src/services/model-resolution-service.js): 模型解析
- [src/services/proxy-service.js](./src/services/proxy-service.js): 代理核心
- [scripts/start-multi-instance.ps1](./scripts/start-multi-instance.ps1): 多实例启动脚本
- [scripts/start-multi-instance.sh](./scripts/start-multi-instance.sh): Linux 部署启动脚本

## 日志

建议直接看 Docker 容器日志：

```powershell
docker compose --env-file .env.deploy -f docker-compose.deploy-image.yml logs -f
```

或者只看应用和网关：

```powershell
docker compose --env-file .env.deploy -f docker-compose.deploy-image.yml logs -f nginx app-1 app-2 app-3
```
