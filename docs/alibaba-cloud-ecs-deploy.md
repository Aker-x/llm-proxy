# Alibaba Cloud ECS Deployment

This project is a good fit for an Alibaba Cloud ECS instance running Docker Compose. The same codebase can be deployed to more than one ECS, while each ECS keeps its own independent runtime data.

For project overview and configuration reference, see [README.md](../README.md).

## Recommended Topology

- 1 ECS instance per environment
- Docker Engine + Docker Compose plugin
- 7 containers on one host:
  - `nginx`
  - `migrate`
  - `app-1`
  - `app-2`
  - `app-3`
  - `postgres`
  - `redis`

## Current ECS Targets

The repository currently distinguishes two ECS targets:

| Target | Public IP | Instance ID | Hostname | Data scope |
|--------|-----------|-------------|----------|------------|
| `ecs2` | `43.106.12.39` | `i-t4ndf2e41u6bvin6n0nv` | `iZt4ndf2e41u6bvin6n0nvZ` | Main runtime data and current CLIProxy instances |
| `ecs2` | `43.106.12.39` | `i-t4n5wcn1ykvqrwj26j30` | `iZt4n5wcn1ykvqrwj26j30Z` | Separate runtime data |

Both targets run the same application code. PostgreSQL, Redis, CLIProxy auth/config, logs, and runtime data are intentionally not shared.

See [ecs-targets.md](./ecs-targets.md) for the concise target map.

## Recommended ECS Baseline

Use this baseline for each ECS:

- Region: Singapore
- Upstream access: direct access to OpenAI/Claude/Google APIs, no proxy needed
- Image source: Docker Hub images (daocloud may be unavailable)
- OS: Ubuntu 22.04 LTS 64-bit
- Instance type: at least `2 vCPU / 4 GiB`
- System disk: at least `40 GiB`
- Public IP: enabled
- Security group inbound:
  - `22/tcp` for SSH
  - `80/tcp` for HTTP
  - `8317/tcp` if exposing `cliproxy-1`
  - `8318/tcp` if exposing `cliproxy-2`

## Verified Working Baseline

| Target | Public entry | Deployment directory | Notes |
|--------|--------------|----------------------|-------|
| `ecs2` | `http://43.106.12.39/` | `/root/llm-delegate` | Main runtime data. `cliproxy-1` and `cliproxy-2` are present on this ECS. |
| `ecs2` | `http://43.106.12.39/` | `/root/llm-delegate` | Separate runtime data. `cliproxy-1` and `cliproxy-2` are present on this ECS. |

Both entries have been verified with HTTP `200 OK`. Both ECS targets currently expose `80`, `8317`, and `8318` for the known runtime layout.

## Files To Upload To ECS

Upload these files to the server, for example into `/root/llm-delegate`:

- [`.env.deploy`](../.env.deploy)
- [`docker-compose.deploy-image.yml`](../docker-compose.deploy-image.yml)
- [`deploy/nginx/default.conf.template`](../deploy/nginx/default.conf.template)
- [`scripts/start-multi-instance.sh`](../scripts/start-multi-instance.sh)
- `llm-delegate.tar`

You can also upload the full repository if you want to keep the source code on the server.

## Build The App Image Locally

Run this on your local machine:

```powershell
docker compose --env-file .env.deploy -f docker-compose.deploy.yml build migrate
docker save -o llm-delegate.tar llm-delegate:latest
```

If you want a single local command that builds, uploads, restarts, and verifies the ECS deployment, use:

```powershell
.\deploy-ecs.bat
```

The default target in [`scripts/deploy-to-ecs.ps1`](../scripts/deploy-to-ecs.ps1) is ECS2:

- Host: `43.106.12.39`
- User: `root`
- SSH key resolution order:
- `deploy/ssh/id_rsa` in the local project directory
- `~/.ssh/id_rsa_sg` on the current machine
- `~/.ssh/id_rsa` on the current machine
- or pass `-KeyFile` explicitly
- Deploy dir: `/root/llm-delegate`

Common examples:

```powershell
.\deploy-ecs.bat -SkipBuild
.\deploy-ecs2.bat -SkipBuild
.\deploy-ecs.bat -ServerHost 43.106.12.39 -User root
.\deploy-ecs.bat -KeyFile C:\path\to\id_rsa
```

Default key selection order:

- `deploy/ssh/id_rsa`
- `~/.ssh/id_rsa_sg`
- `~/.ssh/id_rsa`

For Windows, use the repository helpers because they copy the selected key to a temporary path with SSH-safe permissions before invoking OpenSSH.

If the repository lives on a filesystem that does not support Windows ACLs in a way OpenSSH accepts, direct commands such as
`ssh -i deploy/ssh/id_rsa ...` may fail with `UNPROTECTED PRIVATE KEY FILE`. In that case:

- prefer [`ssh-ecs.bat`](../ssh-ecs.bat), [`ssh-ecs2.bat`](../ssh-ecs2.bat), [`deploy-ecs.bat`](../deploy-ecs.bat), or [`deploy-ecs2.bat`](../deploy-ecs2.bat)
- or copy the key to a normal NTFS-backed path such as `%USERPROFILE%\.ssh\id_rsa_sg` before using `ssh -i`

## Recommended Entrypoints

For day-to-day deployment work on Windows, the recommended commands are:

```powershell
.\ssh-ecs.bat                    # SSH to ECS2 (default)
.\ssh-ecs2.bat                   # SSH to ECS2
.\exec-ecs.bat -RemoteCommand "docker ps --format 'table {{.Names}}\t{{.Status}}'"
.\exec-ecs2.bat -RemoteCommand "docker ps --format 'table {{.Names}}\t{{.Status}}'"
.\deploy-ecs.bat                 # Build, upload, restart ECS2
.\deploy-ecs2.bat                # Build, upload, restart ECS2
```

Use `.\ssh-ecs.bat` when you want an interactive shell on the ECS instance.

On Windows, this is also the safest default because it avoids OpenSSH ACL issues on non-NTFS or ACL-incompatible paths.

For the current ECS baselines, password-based SSH login is disabled. Use the configured private key through the repository helpers or `ssh -i`.

Use `.\deploy-ecs.bat` / `.\deploy-ecs2.bat` when you want the full deployment flow from the development machine to the selected ECS:

- build image locally
- export `llm-delegate.tar`
- upload deployment files to ECS
- restart the multi-instance stack remotely
- verify the service after restart

## Script Map

Deployment-related scripts in this repository have different responsibilities:

- [`deploy-ecs.bat`](../deploy-ecs.bat)
  Windows deployment entrypoint for ECS2. Thin wrapper around `scripts/deploy-to-ecs.ps1`.
- [`deploy-ecs2.bat`](../deploy-ecs2.bat)
  Explicit Windows deployment entrypoint for ECS2.
- [`deploy-ecs2.bat`](../deploy-ecs2.bat)
  Explicit Windows deployment entrypoint for ECS2.
- [`scripts/deploy-to-ecs.ps1`](../scripts/deploy-to-ecs.ps1)
  Main one-click deployment script. Handles local build, file upload, remote restart, and health checks for the selected ECS target.
- [`ssh-ecs.bat`](../ssh-ecs.bat)
  Windows SSH entrypoint for ECS2. Thin wrapper around `scripts/open-ecs-shell.ps1`.
- [`ssh-ecs2.bat`](../ssh-ecs2.bat)
  Explicit Windows SSH entrypoint for ECS2.
- [`ssh-ecs2.bat`](../ssh-ecs2.bat)
  Explicit Windows SSH entrypoint for ECS2.
- [`exec-ecs.bat`](../exec-ecs.bat)
  Windows remote-command entrypoint for ECS2. Thin wrapper around `scripts/invoke-ecs-command.ps1`, intended for non-interactive diagnostics without using encoded shell wrappers.
- [`exec-ecs2.bat`](../exec-ecs2.bat)
  Explicit Windows remote-command entrypoint for ECS2.
- [`exec-ecs2.bat`](../exec-ecs2.bat)
  Explicit Windows remote-command entrypoint for ECS2.
- [`backup-ecs-data.bat`](../backup-ecs-data.bat)
  Windows data backup entrypoint for ECS2.
- [`backup-ecs-data-ecs2.bat`](../backup-ecs-data-ecs2.bat)
  Explicit Windows data backup entrypoint for ECS2.
- [`backup-ecs-data-ecs2.bat`](../backup-ecs-data-ecs2.bat)
  Explicit Windows data backup entrypoint for ECS2.
- [`scripts/open-ecs-shell.ps1`](../scripts/open-ecs-shell.ps1)
  Opens a direct SSH shell to the selected ECS instance.
- [`scripts/invoke-ecs-command.ps1`](../scripts/invoke-ecs-command.ps1)
  Executes a direct remote command or uploads a local script to `/tmp` and runs it on the ECS instance, then removes the temp script by default.
- [`start-deploy.bat`](../start-deploy.bat)
  Local wrapper that runs `scripts/start-multi-instance.ps1 -Mode deploy`. Best suited when the current machine itself is the deployment target.
- [`scripts/start-multi-instance.ps1`](../scripts/start-multi-instance.ps1)
  Windows multi-instance startup script. Supports both `dev` and `deploy` modes.
- [`scripts/start-multi-instance.sh`](../scripts/start-multi-instance.sh)
  Linux multi-instance startup script intended to run on the ECS host.
- [`start-dev.bat`](../start-dev.bat)
  Windows development entrypoint for local dev stack startup.

## Which Script To Use

Choose the script based on where you are operating:

- Development machine to remote ECS:
  use [`deploy-ecs.bat`](../deploy-ecs.bat) for ECS2 or [`deploy-ecs2.bat`](../deploy-ecs2.bat) for ECS2
- Development machine to open a remote shell:
  use [`ssh-ecs.bat`](../ssh-ecs.bat) for ECS2 or [`ssh-ecs2.bat`](../ssh-ecs2.bat) for ECS2
- Development machine to run a one-off diagnostic command safely:
  use [`exec-ecs.bat`](../exec-ecs.bat) for ECS2 or [`exec-ecs2.bat`](../exec-ecs2.bat) for ECS2
- Directly on the Linux ECS server:
  use [`scripts/start-multi-instance.sh`](../scripts/start-multi-instance.sh)
- Directly on a Windows machine running the stack locally:
  use [`start-deploy.bat`](../start-deploy.bat) or [`scripts/start-multi-instance.ps1`](../scripts/start-multi-instance.ps1)

## Server Bootstrap

After connecting to the ECS instance:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
```

Notes:

- This Ubuntu repository path is more reliable in mainland China than depending on Docker's official apt repository.
- If your environment can reach Docker's official repository consistently, you can still use the upstream installation method instead.

## Deploy On ECS

Assuming the deployment files are in `/root/llm-delegate`:

```bash
cd /root/llm-delegate
chmod +x scripts/start-multi-instance.sh
MODE=deploy ./scripts/start-multi-instance.sh
```

This repository now recommends the script above as the default restart path on ECS because it handles:

- `docker load` when `llm-delegate.tar` exists in the deployment directory
- removing `llm-delegate.tar` after a successful image load by default
- pruning dangling Docker images after startup by default
- restarting `postgres` and `redis` first
- running `migrate` before `app-1` / `app-2` / `app-3`
- final runtime checks after the stack comes up

If you want to keep the tar on disk or skip the dangling-image cleanup, set:

- `KEEP_IMAGE_TAR=true`
- `PRUNE_DANGLING_IMAGES=false`

The startup scripts were updated to track exited containers with `docker compose ps -a`, so a successful `migrate` run no longer causes a false deployment failure.

## Health Checks

Check running containers:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy-image.yml ps
```

Tail logs:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy-image.yml logs -f nginx app-1 app-2 app-3
```

Verify locally on the server:

```bash
curl -I http://127.0.0.1/
```

Verify from another machine:

```text
http://<your-ecs-public-ip>/
```

For the current ECS public entries:

```text
ECS2: http://43.106.12.39/
ECS2: http://43.106.12.39/
```

If you intentionally want to expose a non-standard port such as `3000`, update `.env.deploy` and the ECS security group together.

