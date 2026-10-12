#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${DEPLOY_TEST_DOCKER_LOG}"
service="${@: -1}"
case "$1" in
  --version|info) exit 0 ;;
  inspect)
    if [[ "$*" == *ExitCode* ]]; then
      printf '%s\n' "${DEPLOY_TEST_MIGRATION_EXIT}"
    else
      case "${service}" in
        mock-postgres|mock-redis) echo healthy ;;
        mock-migrate) echo exited ;;
        *) echo running ;;
      esac
    fi
    ;;
  compose)
    for argument in "$@"; do
      case "${argument}" in
        version|up) exit 0 ;;
        ps) echo "mock-${service}"; exit 0 ;;
        logs) echo 'Migration details: test failure'; exit 0 ;;
      esac
    done
    exit 1
    ;;
  *) exit 1 ;;
esac
