#!/usr/bin/env bash

set -euo pipefail

deploy_dir="${1:?deploy dir is required}"
backup_dir="${2:?backup dir is required}"
env_filename="${3:-.env.deploy}"
compose_filename="${4:-docker-compose.deploy-image.yml}"

env_file="${deploy_dir}/${env_filename}"
compose_file="${deploy_dir}/${compose_filename}"

if [[ ! -f "${env_file}" ]]; then
  echo "Env file not found: ${env_file}" >&2
  exit 1
fi

if [[ ! -f "${compose_file}" ]]; then
  echo "Compose file not found: ${compose_file}" >&2
  exit 1
fi

mkdir -p "${backup_dir}/postgres" "${backup_dir}/redis" "${backup_dir}/deploy" "${backup_dir}/meta"

compose_cmd=(docker compose --env-file "${env_file}" -f "${compose_file}")

postgres_container="$("${compose_cmd[@]}" ps -q postgres | tr -d '[:space:]')"
redis_container="$("${compose_cmd[@]}" ps -q redis | tr -d '[:space:]')"

if [[ -z "${postgres_container}" ]]; then
  echo "postgres service is not running" >&2
  exit 1
fi

if [[ -z "${redis_container}" ]]; then
  echo "redis service is not running" >&2
  exit 1
fi

cp "${env_file}" "${backup_dir}/deploy/${env_filename}"
cp "${compose_file}" "${backup_dir}/deploy/${compose_filename}"

if [[ -f "${deploy_dir}/deploy/nginx/default.conf.template" ]]; then
  cp "${deploy_dir}/deploy/nginx/default.conf.template" "${backup_dir}/deploy/default.conf.template"
fi

if [[ -f "${deploy_dir}/scripts/start-multi-instance.sh" ]]; then
  cp "${deploy_dir}/scripts/start-multi-instance.sh" "${backup_dir}/deploy/start-multi-instance.sh"
fi

"${compose_cmd[@]}" ps > "${backup_dir}/meta/docker-compose-ps.txt"
"${compose_cmd[@]}" config > "${backup_dir}/meta/docker-compose-config.yml"
docker volume ls > "${backup_dir}/meta/docker-volume-ls.txt"
find "${deploy_dir}" -maxdepth 3 -type f | sort > "${backup_dir}/meta/deploy-file-list.txt"

postgres_db="$("${compose_cmd[@]}" exec -T postgres sh -lc 'printf "%s" "${POSTGRES_DB:-llm_delegate}"')"
postgres_user="$("${compose_cmd[@]}" exec -T postgres sh -lc 'printf "%s" "${POSTGRES_USER:-postgres}"')"

printf "%s\n" "${postgres_db}" > "${backup_dir}/postgres/database-name.txt"
printf "%s\n" "${postgres_user}" > "${backup_dir}/postgres/database-user.txt"

"${compose_cmd[@]}" exec -T postgres sh -lc '
  export PGPASSWORD="${POSTGRES_PASSWORD:-}"
  pg_dumpall --globals-only -U "${POSTGRES_USER:-postgres}"
' > "${backup_dir}/postgres/globals.sql"

"${compose_cmd[@]}" exec -T postgres sh -lc '
  export PGPASSWORD="${POSTGRES_PASSWORD:-}"
  pg_dump \
    -U "${POSTGRES_USER:-postgres}" \
    -d "${POSTGRES_DB:-llm_delegate}" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists
' > "${backup_dir}/postgres/${postgres_db}.sql"

"${compose_cmd[@]}" exec -T redis sh -lc 'redis-cli SAVE >/dev/null'
"${compose_cmd[@]}" exec -T redis sh -lc '
  redis-cli --rdb /tmp/llm-delegate-redis-backup.rdb >/dev/null
  cat /tmp/llm-delegate-redis-backup.rdb
  rm -f /tmp/llm-delegate-redis-backup.rdb
' > "${backup_dir}/redis/redis.rdb"

"${compose_cmd[@]}" exec -T redis sh -lc 'tar -czf - -C /data .' > "${backup_dir}/redis/redis-data.tar.gz"
"${compose_cmd[@]}" exec -T redis sh -lc 'redis-cli INFO persistence' > "${backup_dir}/meta/redis-persistence-info.txt"

cat > "${backup_dir}/meta/backup-scope.txt" <<'EOF'
Included:
- PostgreSQL logical dump for the active application database
- PostgreSQL global roles dump
- Redis RDB snapshot
- Redis /data archive
- ECS deployment env and compose files
- Compose metadata and deploy file manifest

Not included:
- Docker images and image tar files
- Container logs outside the captured compose metadata
EOF
