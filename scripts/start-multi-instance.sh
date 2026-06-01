#!/usr/bin/env bash

set -euo pipefail

MODE="${MODE:-deploy}"
ENV_FILE="${ENV_FILE:-.env.deploy}"
DEV_COMPOSE_FILE="${DEV_COMPOSE_FILE:-docker-compose.deploy.yml}"
DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-docker-compose.deploy-image.yml}"
IMAGE_TAR="${IMAGE_TAR:-llm-delegate.tar}"
SKIP_IMAGE_LOAD="${SKIP_IMAGE_LOAD:-false}"
KEEP_IMAGE_TAR="${KEEP_IMAGE_TAR:-false}"
PRUNE_DANGLING_IMAGES="${PRUNE_DANGLING_IMAGES:-true}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${MODE}" == "deploy" ]]; then
  COMPOSE_FILE="${DEPLOY_COMPOSE_FILE}"
else
  COMPOSE_FILE="${DEV_COMPOSE_FILE}"
fi

ENV_FILE_PATH="${PROJECT_ROOT}/${ENV_FILE}"
COMPOSE_FILE_PATH="${PROJECT_ROOT}/${COMPOSE_FILE}"
IMAGE_TAR_PATH="${PROJECT_ROOT}/${IMAGE_TAR}"
STACK_SERVICES=(migrate app-1 app-2 app-3 nginx)

write_step() {
  echo
  echo "==> $1"
}

assert_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

invoke_compose() {
  docker compose --env-file "${ENV_FILE_PATH}" -f "${COMPOSE_FILE_PATH}" "$@"
}

get_compose_container_id() {
  local service_name="$1"
  local container_id
  container_id="$(docker compose --env-file "${ENV_FILE_PATH}" -f "${COMPOSE_FILE_PATH}" ps -a -q "${service_name}")"
  container_id="$(echo "${container_id}" | tr -d '\r\n')"

  if [[ -z "${container_id}" ]]; then
    echo "Container not found for service: ${service_name}" >&2
    exit 1
  fi

  echo "${container_id}"
}

wait_for_service_state() {
  local service_name="$1"
  local accepted_states="$2"
  local timeout_seconds="${3:-120}"
  local container_id
  local deadline
  local state

  container_id="$(get_compose_container_id "${service_name}")"
  deadline=$((SECONDS + timeout_seconds))

  while (( SECONDS < deadline )); do
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || true)"
    state="$(echo "${state}" | tr -d '\r\n')"
    if [[ ",${accepted_states}," == *",${state},"* ]]; then
      return 0
    fi
    sleep 3
  done

  docker compose --env-file "${ENV_FILE_PATH}" -f "${COMPOSE_FILE_PATH}" ps
  echo "Service did not reach state [${accepted_states}]: ${service_name}" >&2
  exit 1
}

assert_service_exited_successfully() {
  local service_name="$1"
  local container_id
  local exit_code

  container_id="$(get_compose_container_id "${service_name}")"
  exit_code="$(docker inspect --format '{{.State.ExitCode}}' "${container_id}")"
  exit_code="$(echo "${exit_code}" | tr -d '\r\n')"

  if [[ "${exit_code}" != "0" ]]; then
    docker compose --env-file "${ENV_FILE_PATH}" -f "${COMPOSE_FILE_PATH}" logs --tail 50 "${service_name}"
    echo "Service exited with failure: ${service_name} (exit code ${exit_code})" >&2
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  local fallback="$2"

  if [[ ! -f "${ENV_FILE_PATH}" ]]; then
    echo "${fallback}"
    return 0
  fi

  local line
  line="$(grep -E "^${key}=" "${ENV_FILE_PATH}" | head -n 1 || true)"
  if [[ -z "${line}" ]]; then
    echo "${fallback}"
    return 0
  fi

  echo "${line#*=}"
}

show_startup_summary() {
  local public_port
  public_port="$(get_env_value PORT 3000)"

  echo
  echo "Multi-instance stack is ready."
  echo "Application URL: http://127.0.0.1:${public_port}"
  echo "Active app instances: app-1, app-2, app-3"
  echo "Compose file: ${COMPOSE_FILE}"
}

main() {
  write_step "Checking required commands"
  assert_command docker

  if [[ ! -f "${ENV_FILE_PATH}" ]]; then
    echo "Env file not found: ${ENV_FILE}" >&2
    exit 1
  fi

  if [[ ! -f "${COMPOSE_FILE_PATH}" ]]; then
    echo "Compose file not found: ${COMPOSE_FILE}" >&2
    exit 1
  fi

  write_step "Checking Docker runtime"
  docker --version
  docker compose version
  docker info >/dev/null

  if [[ "${MODE}" == "deploy" && "${SKIP_IMAGE_LOAD}" != "true" && -f "${IMAGE_TAR_PATH}" ]]; then
    write_step "Loading app image tar"
    docker load -i "${IMAGE_TAR_PATH}"

    if [[ "${KEEP_IMAGE_TAR}" != "true" ]]; then
      write_step "Removing loaded image tar"
      rm -f "${IMAGE_TAR_PATH}"
    fi
  fi

  write_step "Starting PostgreSQL and Redis"
  invoke_compose up -d postgres redis
  wait_for_service_state postgres "healthy,running" 120
  wait_for_service_state redis "healthy,running" 120

  write_step "Starting multi-instance stack"
  invoke_compose up -d --force-recreate --no-build "${STACK_SERVICES[@]}"

  wait_for_service_state migrate "exited" 120
  assert_service_exited_successfully migrate
  wait_for_service_state app-1 "running" 120
  wait_for_service_state app-2 "running" 120
  wait_for_service_state app-3 "running" 120
  wait_for_service_state nginx "running" 120

  if [[ "${MODE}" == "deploy" && "${PRUNE_DANGLING_IMAGES}" == "true" ]]; then
    write_step "Pruning dangling Docker images"
    docker image prune -f
  fi

  write_step "Startup completed"
  show_startup_summary
}

main "$@"
