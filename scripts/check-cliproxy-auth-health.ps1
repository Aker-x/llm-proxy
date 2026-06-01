param(
    [ValidateSet("ecs2")]
    [string]$Target = "ecs2",
    [string]$Instance = "all",
    [string]$ServerHost = "",
    [string]$User = "root",
    [string]$KeyFile = "",
    [string[]]$AuthFiles = @(),
    [string]$Model = "gpt-5.4-mini",
    [string]$Prompt = "Reply with exactly: pong",
    [string]$ExpectedText = "pong",
    [int]$RoundRobinRequests = 6,
    [switch]$SkipRoundRobin
)

$ErrorActionPreference = "Stop"

$invokeEcsCommand = Join-Path $PSScriptRoot "invoke-ecs-command.ps1"
$selfPath = $MyInvocation.MyCommand.Path

if ($AuthFiles.Count -eq 1 -and $AuthFiles[0] -match ",") {
    $AuthFiles = $AuthFiles[0].Split(",", [System.StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim() }
}

$normalizedInstance = $Instance.Trim().ToLowerInvariant()

if ([string]::IsNullOrWhiteSpace($normalizedInstance)) {
    throw "Instance cannot be empty. Use 'all', a numbered instance such as '1' or '2', or a concrete container name such as 'cliproxy-1'."
}

if ($normalizedInstance -eq "all") {
    if ($AuthFiles.Count -gt 0) {
        throw "AuthFiles cannot be used with -Instance all. Run per instance if you need a filtered file list."
    }

    $discoverArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $invokeEcsCommand,
        "-Target", $Target,
        "-User", $User,
        "-RemoteCommand", "docker ps --format '{{.Names}}'"
    )

    if ($ServerHost) {
        $discoverArgs += @("-ServerHost", $ServerHost)
    }
    if ($KeyFile) {
        $discoverArgs += @("-KeyFile", $KeyFile)
    }

    $rawContainers = & powershell @discoverArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $cliproxyContainers = @(
        $rawContainers |
        ForEach-Object { "$_".Trim() } |
        Where-Object { $_ -like "cliproxy-*" } |
        Sort-Object -Unique
    )

    if ($cliproxyContainers.Count -eq 0) {
        throw "No cliproxy-* containers were found on the target host."
    }

    $aggregateFailure = $false
    foreach ($containerName in $cliproxyContainers) {
        Write-Output ""
        Write-Output "### Checking $containerName ###"

        $childArgs = @(
            "-ExecutionPolicy", "Bypass",
            "-File", $selfPath,
            "-Target", $Target,
            "-Instance", $containerName,
            "-User", $User,
            "-Model", $Model,
            "-Prompt", $Prompt,
            "-ExpectedText", $ExpectedText,
            "-RoundRobinRequests", [string]$RoundRobinRequests
        )

        if ($ServerHost) {
            $childArgs += @("-ServerHost", $ServerHost)
        }
        if ($KeyFile) {
            $childArgs += @("-KeyFile", $KeyFile)
        }
        if ($SkipRoundRobin) {
            $childArgs += "-SkipRoundRobin"
        }

        & powershell @childArgs
        if ($LASTEXITCODE -ne 0) {
            $aggregateFailure = $true
        }
    }

    if ($aggregateFailure) {
        exit 1
    }

    exit 0
}

function ConvertTo-BashSingleQuoted {
    param([string]$Value)

    return "'" + ($Value -replace "'", "'""'""'") + "'"
}

function ConvertTo-BashArrayLiteral {
    param([string[]]$Values)

    if (-not $Values -or $Values.Count -eq 0) {
        return "()"
    }

    return "(" + (($Values | ForEach-Object { ConvertTo-BashSingleQuoted $_ }) -join " ") + ")"
}

if (-not (Test-Path $invokeEcsCommand)) {
    throw "Missing helper script: $invokeEcsCommand"
}

$bashTarget = ConvertTo-BashSingleQuoted $normalizedInstance
$bashModel = ConvertTo-BashSingleQuoted $Model
$bashPrompt = ConvertTo-BashSingleQuoted $Prompt
$bashExpectedText = ConvertTo-BashSingleQuoted $ExpectedText
$bashAuthFiles = ConvertTo-BashArrayLiteral $AuthFiles
$bashSkipRoundRobin = if ($SkipRoundRobin) { "true" } else { "false" }

$remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail

INSTANCE=__INSTANCE__
MODEL=__MODEL__
PROMPT=__PROMPT__
EXPECTED_TEXT=__EXPECTED_TEXT__
ROUND_ROBIN_REQUESTS=__ROUND_ROBIN_REQUESTS__
SKIP_ROUND_ROBIN=__SKIP_ROUND_ROBIN__
AUTH_FILES=__AUTH_FILES__

if [[ "$INSTANCE" == cliproxy-* ]]; then
  REFERENCE_CONTAINER="$INSTANCE"
  INSTANCE_LABEL="${INSTANCE#cliproxy-}"
else
  REFERENCE_CONTAINER="cliproxy-$INSTANCE"
  INSTANCE_LABEL="$INSTANCE"
fi

PROBE_API_KEY="probe-health-check"

declare -a PROBE_CONTAINERS=()
declare -A SAFETY_TO_FILE=()
declare -A FILE_TO_SAFETY=()
declare -A FILE_TO_MODEL=()
declare -A FILE_TO_STATUS=()

fail_count=0
inconclusive_count=0
overall_failure=0
round_robin_failure=0

log() {
  printf '%s\n' "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found on ECS host: $1" >&2
    exit 1
  fi
}

cleanup() {
  local container
  for container in "${PROBE_CONTAINERS[@]:-}"; do
    docker rm -f "$container" >/dev/null 2>&1 || true
  done
  if [[ -n "${WORK_DIR:-}" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
}

trap cleanup EXIT

require_command docker
require_command curl
require_command python3
require_command awk
require_command sed
require_command ss

if ! docker inspect "$REFERENCE_CONTAINER" >/dev/null 2>&1; then
  echo "Reference container not found: $REFERENCE_CONTAINER" >&2
  exit 1
fi

IMAGE=$(docker inspect "$REFERENCE_CONTAINER" --format '{{.Config.Image}}')
CONFIG_PATH=$(docker inspect "$REFERENCE_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/CLIProxyAPI/config.yaml"}}{{.Source}}{{end}}{{end}}')

if [[ -z "$CONFIG_PATH" || ! -f "$CONFIG_PATH" ]]; then
  echo "Failed to resolve mounted config for $REFERENCE_CONTAINER" >&2
  exit 1
fi

AUTH_DIR=$(awk -F': ' '
  $1 == "auth-dir" {
    value=$2
    gsub(/^"/, "", value)
    gsub(/"$/, "", value)
    print value
    exit
  }
' "$CONFIG_PATH")
if [[ -z "$AUTH_DIR" || ! -d "$AUTH_DIR" ]]; then
  echo "Failed to resolve auth-dir from $CONFIG_PATH" >&2
  exit 1
fi

INSTANCE_API_KEY=$(awk '
  /^api-keys:[[:space:]]*$/ { in_list=1; next }
  in_list && /^[[:space:]]*-[[:space:]]*/ {
    value=$0
    sub(/^[[:space:]]*-[[:space:]]*/, "", value)
    gsub(/^"/, "", value)
    gsub(/"$/, "", value)
    print value
    exit
  }
  in_list && !/^[[:space:]]*-/ { exit }
' "$CONFIG_PATH")

if [[ -z "$INSTANCE_API_KEY" ]]; then
  echo "Failed to resolve first api-keys entry from $CONFIG_PATH" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d /tmp/cliproxy-auth-health.XXXXXX)

port_in_use() {
  local port="$1"
  ss -ltnH | awk '{print $4}' | grep -Eq "(^|:)$port$"
}

next_free_port() {
  local port="$1"
  while port_in_use "$port"; do
    port=$((port + 1))
  done
  printf '%s\n' "$port"
}

wait_for_probe() {
  local port="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS -o /dev/null -H "Authorization: Bearer $PROBE_API_KEY" "http://127.0.0.1:$port/v1/models" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

extract_response_fields() {
  local response_file="$1"
  python3 - "$response_file" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
raw = path.read_text(encoding="utf-8", errors="replace")
safety = ""
text = ""
error_code = ""
error_message = ""

try:
    payload = json.loads(raw) if raw.strip() else {}
except Exception:
    print("\t\t\t")
    sys.exit(0)

if isinstance(payload, dict):
    safety = str(payload.get("safety_identifier") or "")

    output = payload.get("output") or []
    if output:
        first = output[0]
        content = first.get("content") or []
        if content:
            text = str(content[0].get("text") or "")

    error = payload.get("error")
    if isinstance(error, dict):
        error_code = str(error.get("code") or error.get("type") or "")
        error_message = str(error.get("message") or "")

fields = [safety, text, error_code, error_message]
for field in fields:
    print(field.replace("\t", " ").replace("\n", " ").strip())
PY
}

collect_candidate_models() {
  local models_file="$1"
  local preferred_model="$2"
  local auth_name="$3"
  python3 - "$models_file" "$preferred_model" "$auth_name" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
preferred = sys.argv[2]
auth_name = sys.argv[3].lower()
raw = path.read_text(encoding="utf-8", errors="replace")

try:
    payload = json.loads(raw) if raw.strip() else {}
except Exception:
    payload = {}

models = []
if isinstance(payload, dict):
    for item in payload.get("data") or []:
        if isinstance(item, dict):
            model_id = item.get("id")
            if model_id:
                models.append(str(model_id))

fallbacks = []
if auth_name.startswith("claude-"):
    fallbacks.extend([
        "claude-sonnet-4-6",
        "claude-opus-4-6",
        "claude-sonnet-4-5-20250929",
    ])
elif auth_name.startswith("gemini-"):
    fallbacks.extend([
        "gemini-2.5-flash",
        "gemini-2.5-pro",
    ])
else:
    fallbacks.extend([
        preferred,
        "gpt-5.4-mini",
        "gpt-5-mini",
    ])

ordered = []
seen = set()

def push(value: str):
    value = (value or "").strip()
    if not value or value in seen:
        return
    seen.add(value)
    ordered.append(value)

if preferred and preferred in models:
    push(preferred)
for model in models:
    push(model)
for model in fallbacks:
    push(model)

for model in ordered:
    print(model)
PY
}

is_auth_failure() {
  local http_status="$1"
  local error_code="$2"
  local error_message="$3"
  local response_text="$4"
  local combined="${error_code} ${error_message} ${response_text}"

  if [[ "$http_status" == "401" ]]; then
    return 0
  fi

  if [[ "$combined" =~ [Tt]oken[[:space:]_-]*invalidated ]]; then
    return 0
  fi

  if [[ "$combined" =~ [Ii]nvalid[[:space:]]API[[:space:]]key ]]; then
    return 0
  fi

  if [[ "$combined" =~ [Uu]nauthori[sz]ed ]]; then
    return 0
  fi

  return 1
}

is_model_selection_error() {
  local http_status="$1"
  local error_code="$2"
  local error_message="$3"
  local response_text="$4"
  local combined="${error_code} ${error_message} ${response_text}"

  if [[ "$combined" == *"unknown provider for model"* ]]; then
    return 0
  fi

  if [[ "$combined" =~ [Mm]odel ]] && [[ "$combined" =~ [Nn]ot[[:space:]]found|[Uu]nsupported|[Ii]nvalid ]]; then
    return 0
  fi

  if [[ "$http_status" == "404" ]]; then
    return 0
  fi

  return 1
}

request_response() {
  local port="$1"
  local body_file="$2"
  local response_file="$3"
  local attempts="${4:-4}"
  local attempt
  local http_status=""
  local parsed_safety=""
  local parsed_text=""
  local parsed_error_code=""
  local parsed_error_message=""

  for attempt in $(seq 1 "$attempts"); do
    http_status=$(curl -sS -o "$response_file" -w '%{http_code}' \
      -H "Authorization: Bearer $PROBE_API_KEY" \
      -H 'Content-Type: application/json' \
      --data-binary "@$body_file" \
      "http://127.0.0.1:$port/v1/responses" || true)

    mapfile -t parsed_fields < <(extract_response_fields "$response_file")
    parsed_safety="${parsed_fields[0]:-}"
    parsed_text="${parsed_fields[1]:-}"
    parsed_error_code="${parsed_fields[2]:-}"
    parsed_error_message="${parsed_fields[3]:-}"

    if [[ "$http_status" == "200" ]]; then
      break
    fi

    if [[ "$http_status" == "502" && ( "$parsed_text" == "unknown provider for model"* || "$parsed_error_message" == "unknown provider for model"* ) && "$attempt" -lt "$attempts" ]]; then
      sleep 2
      continue
    fi

    break
  done

  printf '%s\n%s\n%s\n%s\n%s\n' "$http_status" "$parsed_safety" "$parsed_text" "$parsed_error_code" "$parsed_error_message"
}

declare -a SELECTED_FILES=()

if (( ${#AUTH_FILES[@]} == 0 )); then
  while IFS= read -r -d '' file_path; do
    SELECTED_FILES+=("$file_path")
  done < <(find "$AUTH_DIR" -maxdepth 1 -type f -name '*.json' -print0 | sort -z)
else
  for auth_name in "${AUTH_FILES[@]}"; do
    auth_path="$AUTH_DIR/$auth_name"
    if [[ ! -f "$auth_path" ]]; then
      echo "Requested auth file not found: $auth_path" >&2
      exit 1
    fi
    SELECTED_FILES+=("$auth_path")
  done
fi

if (( ${#SELECTED_FILES[@]} == 0 )); then
  echo "No auth files found in $AUTH_DIR" >&2
  exit 1
fi

log "==> Instance: $INSTANCE_LABEL"
log "==> Reference container: $REFERENCE_CONTAINER"
log "==> Image: $IMAGE"
log "==> Config path: $CONFIG_PATH"
log "==> Auth dir: $AUTH_DIR"
log "==> Instance API key: $INSTANCE_API_KEY"
log "==> Selected auth files: ${#SELECTED_FILES[@]}"

run_single_probe() {
  local auth_path="$1"
  local index="$2"
  local auth_name
  local case_dir
  local case_auth_dir
  local case_config
  local body_file
  local response_file
  local models_file
  local probe_port
  local container_name
  local http_status
  local readiness_ok=0
  local selected_model=""
  local probe_status="INCONCLUSIVE"
  local safety_id=""
  local response_text=""
  local error_code=""
  local error_message=""
  local request_body=""
  local final_http_status="0"
  local final_safety_id=""
  local final_response_text=""
  local final_error_code=""
  local final_error_message=""
  local saw_auth_failure=0
  local saw_transport_failure=0
  local success=0
  local models_available=0
  declare -a candidate_models=()

  auth_name=$(basename "$auth_path")
  case_dir="$WORK_DIR/single-$index"
  case_auth_dir="$case_dir/auths"
  mkdir -p "$case_auth_dir"
  cp "$auth_path" "$case_auth_dir/$auth_name"

  case_config="$case_dir/config.yaml"
  cat > "$case_config" <<EOF
host: ""
port: 8317
auth-dir: "$AUTH_DIR"
api-keys:
  - "$PROBE_API_KEY"
debug: false
logging-to-file: false
EOF

  probe_port=$(next_free_port $((19170 + index)))
  container_name="cliproxy-auth-single-$INSTANCE_LABEL-$index-$RANDOM"
  PROBE_CONTAINERS+=("$container_name")

  docker run -d --rm \
    --name "$container_name" \
    -p "127.0.0.1:$probe_port:8317" \
    -v "${case_auth_dir}:${AUTH_DIR}" \
    -v "${case_config}:/CLIProxyAPI/config.yaml:ro" \
    "$IMAGE" >/dev/null

  if wait_for_probe "$probe_port"; then
    readiness_ok=1
  fi

  if (( readiness_ok == 0 )); then
    log "RESULT file=$auth_name status=FAILED http=0 error_code=probe_not_ready error_message=Probe container did not become ready"
    fail_count=$((fail_count + 1))
    overall_failure=1
    return
  fi

  models_file="$case_dir/models.json"
  if curl -fsS -o "$models_file" -H "Authorization: Bearer $PROBE_API_KEY" "http://127.0.0.1:$probe_port/v1/models" >/dev/null 2>&1; then
    models_available=1
  else
    printf '{"data":[],"object":"list"}\n' > "$models_file"
  fi

  while IFS= read -r candidate_model; do
    if [[ -n "$candidate_model" ]]; then
      candidate_models+=("$candidate_model")
    fi
  done < <(collect_candidate_models "$models_file" "$MODEL" "$auth_name")

  if (( ${#candidate_models[@]} == 0 )); then
    candidate_models+=("$MODEL")
  fi

  response_file="$case_dir/response.json"
  for selected_model in "${candidate_models[@]}"; do
    body_file="$case_dir/request.json"
    cat > "$body_file" <<EOF
{"model":"$selected_model","input":[{"role":"user","content":[{"type":"input_text","text":"$PROMPT"}]}],"max_output_tokens":8}
EOF

    mapfile -t response_fields < <(request_response "$probe_port" "$body_file" "$response_file" 4)
    http_status="${response_fields[0]:-}"
    safety_id="${response_fields[1]:-}"
    response_text="${response_fields[2]:-}"
    error_code="${response_fields[3]:-}"
    error_message="${response_fields[4]:-}"

    final_http_status="$http_status"
    final_safety_id="$safety_id"
    final_response_text="$response_text"
    final_error_code="$error_code"
    final_error_message="$error_message"

    if [[ "$http_status" == "200" && "$response_text" == "$EXPECTED_TEXT" ]]; then
      probe_status="OK"
      success=1
      break
    fi

    if [[ -z "$final_error_code" && "$final_http_status" == "401" ]]; then
      final_error_code="unauthorized"
    fi

    if is_auth_failure "$final_http_status" "$final_error_code" "$final_error_message" "$final_response_text"; then
      probe_status="FAILED"
      saw_auth_failure=1
      break
    fi

    if is_model_selection_error "$final_http_status" "$final_error_code" "$final_error_message" "$final_response_text"; then
      continue
    fi

    if [[ "$final_http_status" == "0" || "$final_http_status" == 5* ]]; then
      saw_transport_failure=1
    fi
  done

  if (( success == 1 )); then
    log "RESULT file=$auth_name status=OK http=$final_http_status model=$selected_model safety_id=$final_safety_id text=$final_response_text"
    FILE_TO_STATUS["$auth_name"]="OK"
    FILE_TO_MODEL["$auth_name"]="$selected_model"
    if [[ -n "$final_safety_id" ]]; then
      SAFETY_TO_FILE["$final_safety_id"]="$auth_name"
      FILE_TO_SAFETY["$auth_name"]="$final_safety_id"
    fi
    return
  fi

  if (( saw_auth_failure == 1 )); then
    log "RESULT file=$auth_name status=FAILED http=$final_http_status model=$selected_model safety_id=$final_safety_id text=$final_response_text error_code=$final_error_code error_message=$final_error_message"
    FILE_TO_STATUS["$auth_name"]="FAILED"
    fail_count=$((fail_count + 1))
    overall_failure=1
    return
  fi

  if (( saw_transport_failure == 1 )) || (( models_available == 0 )); then
    if [[ -z "$final_error_code" && (( models_available == 0 )) ]]; then
      final_error_code="models_probe_unavailable"
      final_error_message="Failed to fetch models from probe container; fell back to static probe models"
    fi
  fi

  log "RESULT file=$auth_name status=INCONCLUSIVE http=$final_http_status model=$selected_model safety_id=$final_safety_id text=$final_response_text error_code=$final_error_code error_message=$final_error_message"
  FILE_TO_STATUS["$auth_name"]="INCONCLUSIVE"
  inconclusive_count=$((inconclusive_count + 1))
  overall_failure=1
}

run_round_robin_request() {
  local port="$1"
  local body_file="$2"
  local response_file="$3"
  local attempts="${4:-4}"
  request_response "$port" "$body_file" "$response_file" "$attempts"
}

build_round_robin_body() {
  local body_file="$1"
  local shared_model="$2"

  cat > "$body_file" <<EOF
{"model":"$shared_model","input":[{"role":"user","content":[{"type":"input_text","text":"$PROMPT"}]}],"max_output_tokens":8}
EOF
}

run_round_robin_probe() {
  local rr_dir
  local rr_auth_dir
  local rr_config
  local body_file
  local shared_model=""
  local probe_port
  local container_name
  local req
  local response_file
  local http_status
  local safety_id=""
  local response_text=""
  local error_code=""
  local error_message=""
  local mapped_file=""
  local unique_count=0
  local cycle_ok=1
  local joined=""
  local idx
  local expected_id
  local auth_name
  declare -a rr_ids=()
  declare -a unique_ids=()
  declare -A seen_ids=()

  for auth_path in "${SELECTED_FILES[@]}"; do
    auth_name=$(basename "$auth_path")
    if [[ "${FILE_TO_STATUS[$auth_name]:-}" != "OK" ]]; then
      log "ROUND_ROBIN status=INCONCLUSIVE reason=At least one auth file was not validated successfully in isolated probing"
      return
    fi

    if [[ -z "${FILE_TO_MODEL[$auth_name]:-}" ]]; then
      log "ROUND_ROBIN status=INCONCLUSIVE reason=At least one auth file did not produce a probe model"
      return
    fi

    if [[ -z "$shared_model" ]]; then
      shared_model="${FILE_TO_MODEL[$auth_name]}"
    elif [[ "$shared_model" != "${FILE_TO_MODEL[$auth_name]}" ]]; then
      log "ROUND_ROBIN status=INCONCLUSIVE reason=Selected auth files do not share the same probe model"
      return
    fi
  done

  rr_dir="$WORK_DIR/round-robin"
  rr_auth_dir="$rr_dir/auths"
  mkdir -p "$rr_auth_dir"

  for auth_path in "${SELECTED_FILES[@]}"; do
    cp "$auth_path" "$rr_auth_dir/$(basename "$auth_path")"
  done

  rr_config="$rr_dir/config.yaml"
  cat > "$rr_config" <<EOF
host: ""
port: 8317
auth-dir: "$AUTH_DIR"
api-keys:
  - "$PROBE_API_KEY"
debug: false
logging-to-file: false
EOF

  body_file="$rr_dir/request.json"
  build_round_robin_body "$body_file" "$shared_model"

  probe_port=$(next_free_port 19270)
  container_name="cliproxy-auth-rr-$INSTANCE_LABEL-$RANDOM"
  PROBE_CONTAINERS+=("$container_name")

  docker run -d --rm \
    --name "$container_name" \
    -p "127.0.0.1:$probe_port:8317" \
    -v "${rr_auth_dir}:${AUTH_DIR}" \
    -v "${rr_config}:/CLIProxyAPI/config.yaml:ro" \
    "$IMAGE" >/dev/null

  if ! wait_for_probe "$probe_port"; then
    log "ROUND_ROBIN status=FAILED reason=Probe container did not become ready"
    round_robin_failure=1
    return
  fi

  for req in $(seq 1 "$ROUND_ROBIN_REQUESTS"); do
    response_file="$rr_dir/response-$req.json"
    mapfile -t response_fields < <(run_round_robin_request "$probe_port" "$body_file" "$response_file" 4)
    http_status="${response_fields[0]:-}"
    safety_id="${response_fields[1]:-}"
    response_text="${response_fields[2]:-}"
    error_code="${response_fields[3]:-}"
    error_message="${response_fields[4]:-}"
    mapped_file="${SAFETY_TO_FILE[$safety_id]:-unknown}"
    log "ROUND_ROBIN req=$req status=$http_status safety_id=$safety_id mapped_file=$mapped_file text=$response_text error_code=$error_code error_message=$error_message"

    if [[ "$http_status" != "200" ]]; then
      round_robin_failure=1
    fi

    rr_ids+=("$safety_id")
    if [[ -n "$safety_id" && -z "${seen_ids[$safety_id]+x}" ]]; then
      seen_ids["$safety_id"]=1
      unique_ids+=("$safety_id")
    fi
  done

  unique_count=${#unique_ids[@]}
  if (( unique_count < 2 )); then
    log "ROUND_ROBIN status=INCONCLUSIVE unique_safety_ids=$unique_count reason=Less than two unique safety identifiers observed"
    return
  fi

  for idx in "${!rr_ids[@]}"; do
    expected_id="${unique_ids[$((idx % unique_count))]}"
    if [[ "${rr_ids[$idx]}" != "$expected_id" ]]; then
      cycle_ok=0
      break
    fi
  done

  if (( cycle_ok == 1 )); then
    joined=$(IFS=,; echo "${unique_ids[*]}")
    log "ROUND_ROBIN status=OK unique_safety_ids=$unique_count cycle=$joined"
  else
    log "ROUND_ROBIN status=FAILED unique_safety_ids=$unique_count reason=Observed sequence does not follow a stable cycle"
    round_robin_failure=1
  fi
}

index=1
for auth_path in "${SELECTED_FILES[@]}"; do
  run_single_probe "$auth_path" "$index"
  index=$((index + 1))
done

if (( ${#SELECTED_FILES[@]} > 1 )) && [[ "$SKIP_ROUND_ROBIN" != "true" ]]; then
  run_round_robin_probe
else
  log "ROUND_ROBIN status=SKIPPED"
fi

log "SUMMARY instance=$INSTANCE_LABEL tested=${#SELECTED_FILES[@]} failed=$fail_count inconclusive=$inconclusive_count"

if (( overall_failure != 0 || round_robin_failure != 0 )); then
  exit 1
fi
'@

$remoteScript = $remoteScript.
    Replace("__INSTANCE__", $bashTarget).
    Replace("__MODEL__", $bashModel).
    Replace("__PROMPT__", $bashPrompt).
    Replace("__EXPECTED_TEXT__", $bashExpectedText).
    Replace("__ROUND_ROBIN_REQUESTS__", [string]$RoundRobinRequests).
    Replace("__SKIP_ROUND_ROBIN__", $bashSkipRoundRobin).
    Replace("__AUTH_FILES__", $bashAuthFiles)

$remoteScriptPath = Join-Path $env:TEMP ("cliproxy-auth-health-" + [guid]::NewGuid().ToString("N") + ".sh")
Set-Content -Path $remoteScriptPath -Value $remoteScript -Encoding utf8

try {
    $invokeArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $invokeEcsCommand,
        "-Target", $Target,
        "-User", $User,
        "-LocalScriptFile", $remoteScriptPath,
        "-Shell", "bash"
    )

    if ($ServerHost) {
        $invokeArgs += @("-ServerHost", $ServerHost)
    }
    if ($KeyFile) {
        $invokeArgs += @("-KeyFile", $KeyFile)
    }

    & powershell @invokeArgs
    exit $LASTEXITCODE
}
finally {
    if (Test-Path $remoteScriptPath) {
        Remove-Item $remoteScriptPath -Force -ErrorAction SilentlyContinue
    }
}

