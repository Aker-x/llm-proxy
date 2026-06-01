param(
    [ValidateSet("ecs2")]
    [string]$Target = "ecs2",
    [string]$Instance = "all",
    [string]$ServerHost = "",
    [string]$User = "root",
    [string]$KeyFile = "",
    [switch]$IncludeNonCodex,
    [switch]$Json
)

$ErrorActionPreference = "Stop"

$invokeEcsCommand = Join-Path $PSScriptRoot "invoke-ecs-command.ps1"

function ConvertTo-BashSingleQuoted {
    param([string]$Value)

    return "'" + ($Value -replace "'", "'""'""'") + "'"
}

function Write-Utf8NoBomFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Content
    )

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

if (-not (Test-Path $invokeEcsCommand)) {
    throw "Missing helper script: $invokeEcsCommand"
}

$bashInstance = ConvertTo-BashSingleQuoted $Instance.Trim()
$bashIncludeNonCodex = if ($IncludeNonCodex) { "'true'" } else { "'false'" }
$bashJson = if ($Json) { "'true'" } else { "'false'" }

$remoteScript = @'
#!/usr/bin/env bash
set -euo pipefail

INSTANCE=__INSTANCE__
INCLUDE_NON_CODEX=__INCLUDE_NON_CODEX__
JSON_OUTPUT=__JSON_OUTPUT__

export INSTANCE
export INCLUDE_NON_CODEX
export JSON_OUTPUT

python3 - <<'PY'
import base64
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request


INSTANCE = os.environ.get("INSTANCE", "all").strip()
INCLUDE_NON_CODEX = os.environ.get("INCLUDE_NON_CODEX", "false").lower() == "true"
JSON_OUTPUT = os.environ.get("JSON_OUTPUT", "false").lower() == "true"


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def parse_iso(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc)
        except Exception:
            return None
    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(normalized)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


def format_dt(value):
    parsed = parse_iso(value)
    if not parsed:
        return None
    return parsed.astimezone().isoformat(timespec="seconds")


def format_unix_seconds(value):
    if value in (None, ""):
        return None
    try:
        return dt.datetime.fromtimestamp(float(value), tz=dt.timezone.utc).astimezone().isoformat(timespec="seconds")
    except Exception:
        return None


def decode_jwt_claims(token):
    if not isinstance(token, str) or token.count(".") != 2:
        return None
    try:
        payload = token.split(".")[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        return json.loads(decoded.decode("utf-8"))
    except Exception:
        return None


def parse_auth_dir(config_path):
    auth_dir = ""
    with open(config_path, "r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line.startswith("auth-dir:"):
                continue
            auth_dir = line.split(":", 1)[1].strip().strip('"').strip("'")
            break
    return auth_dir


def normalize_instance_names(raw_instance, containers):
    normalized = raw_instance.strip().lower()
    if not normalized or normalized == "all":
        return sorted(containers)
    if normalized.startswith("cliproxy-"):
        wanted = normalized
    else:
        wanted = "cliproxy-" + normalized
    return [name for name in containers if name.lower() == wanted]


def window_name(seconds):
    if seconds == 18000:
        return "five_hour"
    if seconds == 604800:
        return "seven_day"
    if not isinstance(seconds, int):
        return "unknown"
    if seconds % 86400 == 0:
        return f"{seconds // 86400}_day"
    if seconds % 3600 == 0:
        return f"{seconds // 3600}_hour"
    return f"{seconds}_second"


def summarize_window(label, payload):
    if not isinstance(payload, dict):
        return None
    used_percent = payload.get("used_percent")
    reset_at = format_unix_seconds(payload.get("reset_at"))
    reset_after = payload.get("reset_after_seconds")
    seconds = payload.get("limit_window_seconds")
    remaining_percent = None
    if isinstance(used_percent, (int, float)):
        remaining_percent = max(0.0, 100.0 - float(used_percent))
    return {
        "label": label,
        "tier": window_name(seconds) if isinstance(seconds, int) else "unknown",
        "used_percent": used_percent,
        "remaining_percent": remaining_percent,
        "limit_window_seconds": seconds,
        "reset_after_seconds": reset_after,
        "reset_at": reset_at,
    }


def fetch_wham_usage(access_token, account_id):
    if not access_token:
        return {
            "status_code": None,
            "ok": False,
            "error": "missing access_token",
            "body": None,
        }

    headers = {
        "Authorization": f"Bearer {access_token}",
        "User-Agent": "codex-cli",
        "Accept": "application/json",
    }
    if account_id:
        headers["ChatGPT-Account-Id"] = account_id

    request = urllib.request.Request(
        "https://chatgpt.com/backend-api/wham/usage",
        headers=headers,
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8", errors="replace")
            body = json.loads(raw)
            return {
                "status_code": response.status,
                "ok": True,
                "error": None,
                "body": body,
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        body = None
        try:
            body = json.loads(raw)
        except Exception:
            body = {"raw": raw}
        return {
            "status_code": exc.code,
            "ok": False,
            "error": str(exc),
            "body": body,
        }
    except Exception as exc:
        return {
            "status_code": None,
            "ok": False,
            "error": repr(exc),
            "body": None,
        }


def analyze_auth(auth_path):
    with open(auth_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    provider = str(data.get("type") or "").strip().lower()
    if not provider:
        provider = "unknown"

    result = {
        "file": os.path.basename(auth_path),
        "path": auth_path,
        "provider": provider,
        "email": data.get("email"),
        "disabled": bool(data.get("disabled", False)),
        "account_id": data.get("account_id"),
        "local_token_expires_at": format_dt(data.get("expired")),
        "last_refresh": format_dt(data.get("last_refresh")),
        "jwt": {},
        "backend": {},
        "warnings": [],
    }

    claims = decode_jwt_claims(data.get("id_token"))
    if claims:
        auth_info = claims.get("https://api.openai.com/auth", {})
        result["jwt"] = {
            "email": claims.get("email"),
            "plan_type": auth_info.get("chatgpt_plan_type"),
            "subscription_active_start": format_dt(auth_info.get("chatgpt_subscription_active_start")),
            "subscription_active_until": format_dt(auth_info.get("chatgpt_subscription_active_until")),
            "subscription_last_checked": format_dt(auth_info.get("chatgpt_subscription_last_checked")),
            "account_id": auth_info.get("chatgpt_account_id"),
            "id_token_expires_at": format_unix_seconds(claims.get("exp")),
        }

    if provider != "codex":
        result["backend"] = {
            "status": "skipped",
            "reason": "provider is not codex",
        }
        return result

    usage = fetch_wham_usage(str(data.get("access_token") or "").strip(), str(data.get("account_id") or "").strip())
    body = usage.get("body") if isinstance(usage.get("body"), dict) else {}
    rate_limit = body.get("rate_limit") if isinstance(body, dict) else {}
    credits = body.get("credits") if isinstance(body, dict) else {}

    primary = summarize_window("primary", rate_limit.get("primary_window") if isinstance(rate_limit, dict) else None)
    secondary = summarize_window("secondary", rate_limit.get("secondary_window") if isinstance(rate_limit, dict) else None)

    additional = []
    for item in body.get("additional_rate_limits") or []:
        if not isinstance(item, dict):
            continue
        item_rate = item.get("rate_limit") if isinstance(item.get("rate_limit"), dict) else {}
        item_windows = []
        maybe_primary = summarize_window("primary", item_rate.get("primary_window") if isinstance(item_rate, dict) else None)
        maybe_secondary = summarize_window("secondary", item_rate.get("secondary_window") if isinstance(item_rate, dict) else None)
        if maybe_primary:
            item_windows.append(maybe_primary)
        if maybe_secondary:
            item_windows.append(maybe_secondary)
        additional.append({
            "limit_name": item.get("limit_name"),
            "metered_feature": item.get("metered_feature"),
            "allowed": item_rate.get("allowed"),
            "limit_reached": item_rate.get("limit_reached"),
            "windows": item_windows,
        })

    status_text = "unknown"
    if usage.get("status_code") == 200:
        status_text = "valid"
    elif usage.get("status_code") in (401, 403):
        status_text = "invalid"
    elif usage.get("status_code") is not None:
        status_text = "error"

    result["backend"] = {
        "status": status_text,
        "http_status": usage.get("status_code"),
        "request_ok": bool(usage.get("ok")),
        "error": usage.get("error"),
        "plan_type": body.get("plan_type"),
        "response_account_id": body.get("account_id"),
        "response_email": body.get("email"),
        "allowed": rate_limit.get("allowed") if isinstance(rate_limit, dict) else None,
        "limit_reached": rate_limit.get("limit_reached") if isinstance(rate_limit, dict) else None,
        "rate_limit_reached_type": body.get("rate_limit_reached_type"),
        "primary_window": primary,
        "secondary_window": secondary,
        "additional_rate_limits": additional,
        "credits": {
            "has_credits": credits.get("has_credits") if isinstance(credits, dict) else None,
            "unlimited": credits.get("unlimited") if isinstance(credits, dict) else None,
            "balance": credits.get("balance") if isinstance(credits, dict) else None,
            "approx_local_messages": credits.get("approx_local_messages") if isinstance(credits, dict) else None,
            "approx_cloud_messages": credits.get("approx_cloud_messages") if isinstance(credits, dict) else None,
            "overage_limit_reached": credits.get("overage_limit_reached") if isinstance(credits, dict) else None,
        },
        "promo_message": body.get("promo", {}).get("message") if isinstance(body.get("promo"), dict) else None,
    }

    jwt_plan = result["jwt"].get("plan_type")
    backend_plan = result["backend"].get("plan_type")
    if jwt_plan and backend_plan and str(jwt_plan).strip().lower() != str(backend_plan).strip().lower():
        result["warnings"].append(
            f"JWT plan_type is {jwt_plan}, but backend currently reports {backend_plan}. Backend result should be treated as current."
        )

    return result


def format_percent(value):
    if value is None:
        return "n/a"
    if abs(value - round(value)) < 1e-9:
        return f"{int(round(value))}%"
    return f"{value:.2f}%"


def truncate_text(value, limit):
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    if limit <= 3:
        return text[:limit]
    return text[: limit - 3] + "..."


def status_badge(auth):
    backend = auth.get("backend") or {}
    status = str(backend.get("status") or "unknown").lower()
    if status == "valid":
        if backend.get("limit_reached") is True:
            return "LIMIT"
        if backend.get("allowed") is True:
            return "OK"
        return "VALID"
    if status == "invalid":
        return "INVALID"
    if status == "error":
        return "ERROR"
    if status == "skipped":
        return "SKIP"
    return "UNKNOWN"


def compact_window(window):
    if not window:
        return "n/a"
    tier = window.get("tier") or "unknown"
    used = format_percent(window.get("used_percent"))
    remaining = format_percent(window.get("remaining_percent"))
    reset_at = window.get("reset_at") or "n/a"
    reset_short = reset_at[5:16].replace("T", " ") if len(reset_at) >= 16 else reset_at
    return f"{tier} used {used}, left {remaining}, reset {reset_short}"


def compact_credits(credits):
    if not credits:
        return "n/a"
    balance = credits.get("balance")
    approx_local = credits.get("approx_local_messages")
    approx_cloud = credits.get("approx_cloud_messages")
    if balance not in (None, ""):
        return f"balance={balance}"
    if approx_local not in (None, "") or approx_cloud not in (None, ""):
        return f"local={approx_local} cloud={approx_cloud}"
    if credits.get("has_credits") is False:
        return "no credits"
    return "n/a"


def print_table(rows, columns):
    widths = []
    for key, title in columns:
        width = len(title)
        for row in rows:
            width = max(width, len(str(row.get(key, ""))))
        widths.append(width)

    def render(row):
        cells = []
        for idx, (key, _title) in enumerate(columns):
            cells.append(str(row.get(key, "")).ljust(widths[idx]))
        return " | ".join(cells)

    separator = "-+-".join("-" * width for width in widths)
    print(render({key: title for key, title in columns}))
    print(separator)
    for row in rows:
        print(render(row))


def print_window(prefix, window):
    if not window:
        print(f"    {prefix}: n/a")
        return
    print(
        f"    {prefix}: tier={window['tier']} used={format_percent(window['used_percent'])} "
        f"remaining={format_percent(window['remaining_percent'])} reset_at={window['reset_at'] or 'n/a'} "
        f"reset_after_seconds={window['reset_after_seconds'] if window['reset_after_seconds'] is not None else 'n/a'}"
    )


def print_report(report):
    print("=" * 79)
    print("ECS Codex Auth Report")
    print(f"Generated at: {report['generated_at']}")
    print("=" * 79)
    print()

    summary_rows = []
    for container in report["containers"]:
        for auth in container.get("auths") or []:
            jwt = auth.get("jwt") or {}
            backend = auth.get("backend") or {}
            warnings = auth.get("warnings") or []
            summary_rows.append({
                "instance": container["name"].replace("cliproxy-", ""),
                "file": truncate_text(auth.get("file") or "n/a", 34),
                "status": status_badge(auth),
                "plan": str(backend.get("plan_type") or jwt.get("plan_type") or "n/a"),
                "sub_until": str(jwt.get("subscription_active_until") or "n/a")[5:16].replace("T", " ")
                    if jwt.get("subscription_active_until")
                    else "n/a",
                "primary": truncate_text(compact_window(backend.get("primary_window")), 38),
                "weekly": truncate_text(compact_window(backend.get("secondary_window")), 38),
                "credits": truncate_text(compact_credits(backend.get("credits") or {}), 24),
                "warn": str(len(warnings)),
            })

    if summary_rows:
        print("Summary")
        print_table(summary_rows, [
            ("instance", "Instance"),
            ("file", "Auth File"),
            ("status", "Status"),
            ("plan", "Plan"),
            ("sub_until", "Sub Until"),
            ("primary", "Primary Window"),
            ("weekly", "Weekly Window"),
            ("credits", "Credits"),
            ("warn", "Warn"),
        ])
        print()

    for container in report["containers"]:
        print(f"[{container['name']}]")
        print(f"  config   : {container['config_path']}")
        print(f"  auth_dir : {container['auth_dir']}")
        if container.get("warning"):
            print(f"  warning  : {container['warning']}")
        if not container["auths"]:
            print("  no matching auth files found")
            print()
            continue

        for auth in container["auths"]:
            backend = auth.get("backend") or {}
            jwt = auth.get("jwt") or {}
            print(f"  {'-' * 71}")
            print(f"  - {auth['file']}")
            print(
                f"    status={status_badge(auth)} provider={auth['provider']} "
                f"email={auth.get('email') or jwt.get('email') or 'n/a'}"
            )
            print(
                f"    plan(jwt/backend)={jwt.get('plan_type') or 'n/a'}/{backend.get('plan_type') or 'n/a'} "
                f"allowed={backend.get('allowed') if backend.get('allowed') is not None else 'n/a'} "
                f"limit_reached={backend.get('limit_reached') if backend.get('limit_reached') is not None else 'n/a'} "
                f"http={backend.get('http_status') if backend.get('http_status') is not None else 'n/a'}"
            )
            print(
                f"    subscription={jwt.get('subscription_active_start') or 'n/a'}  ->  "
                f"{jwt.get('subscription_active_until') or 'n/a'}"
            )
            print(
                f"    local_token_expires_at={auth.get('local_token_expires_at') or 'n/a'}  "
                f"id_token_expires_at={jwt.get('id_token_expires_at') or 'n/a'}"
            )
            print(
                f"    account_id={auth.get('account_id') or jwt.get('account_id') or 'n/a'}  "
                f"last_refresh={auth.get('last_refresh') or 'n/a'}  disabled={auth.get('disabled')}"
            )

            if backend.get("reason"):
                print(f"    backend_reason={backend['reason']}")
            else:
                print(f"    primary_window  : {compact_window(backend.get('primary_window'))}")
                print(f"    secondary_window: {compact_window(backend.get('secondary_window'))}")

                credits = backend.get("credits") or {}
                print(f"    credits         : {compact_credits(credits)}")

                additional = backend.get("additional_rate_limits") or []
                if additional:
                    for item in additional:
                        print(
                            f"    additional_limit: {item.get('limit_name') or 'unnamed'} "
                            f"(allowed={item.get('allowed')}, limit_reached={item.get('limit_reached')})"
                        )
                        for idx, window in enumerate(item.get("windows") or [], start=1):
                            print(f"      window_{idx}: {compact_window(window)}")

                if backend.get("promo_message"):
                    print(f"    promo_message   : {backend['promo_message']}")

                if backend.get("error"):
                    print(f"    backend_error   : {backend['error']}")

            for warning in auth.get("warnings") or []:
                print(f"    warning         : {warning}")

            print()


containers = [
    line.strip()
    for line in run("docker", "ps", "--format", "{{.Names}}").splitlines()
    if line.strip().startswith("cliproxy-")
]

selected = normalize_instance_names(INSTANCE, containers)
if not selected:
    print(f"No cliproxy containers matched INSTANCE={INSTANCE!r}", file=sys.stderr)
    sys.exit(1)

report = {
    "generated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
    "instance_filter": INSTANCE,
    "containers": [],
}

for container_name in selected:
    config_path = run(
        "docker",
        "inspect",
        container_name,
        "--format",
        "{{range .Mounts}}{{if eq .Destination \"/CLIProxyAPI/config.yaml\"}}{{.Source}}{{end}}{{end}}",
    )

    auth_dir = parse_auth_dir(config_path)
    container_entry = {
        "name": container_name,
        "config_path": config_path,
        "auth_dir": auth_dir,
        "auths": [],
    }

    if not auth_dir or not os.path.isdir(auth_dir):
        container_entry["warning"] = "auth-dir is missing or does not exist"
        report["containers"].append(container_entry)
        continue

    auth_files = [
        os.path.join(auth_dir, name)
        for name in sorted(os.listdir(auth_dir))
        if name.endswith(".json")
    ]

    for auth_path in auth_files:
        try:
            auth_summary = analyze_auth(auth_path)
        except Exception as exc:
            auth_summary = {
                "file": os.path.basename(auth_path),
                "path": auth_path,
                "provider": "unknown",
                "email": None,
                "disabled": None,
                "account_id": None,
                "local_token_expires_at": None,
                "last_refresh": None,
                "jwt": {},
                "backend": {
                    "status": "error",
                    "http_status": None,
                    "request_ok": False,
                    "error": repr(exc),
                },
                "warnings": ["failed to parse auth file"],
            }

        if not INCLUDE_NON_CODEX and auth_summary.get("provider") != "codex":
            continue
        container_entry["auths"].append(auth_summary)

    report["containers"].append(container_entry)

if JSON_OUTPUT:
    print(json.dumps(report, ensure_ascii=False, indent=2))
else:
    print_report(report)
PY
'@

$remoteScript = $remoteScript.Replace("__INSTANCE__", $bashInstance)
$remoteScript = $remoteScript.Replace("__INCLUDE_NON_CODEX__", $bashIncludeNonCodex)
$remoteScript = $remoteScript.Replace("__JSON_OUTPUT__", $bashJson)

$tempScriptPath = Join-Path $env:TEMP ("llm-proxy-ecs-codex-auth-report-" + [guid]::NewGuid().ToString("N") + ".sh")

try {
    Write-Utf8NoBomFile -Path $tempScriptPath -Content $remoteScript

    $invokeArgs = @(
        "-ExecutionPolicy", "Bypass",
        "-File", $invokeEcsCommand,
        "-Target", $Target,
        "-User", $User,
        "-LocalScriptFile", $tempScriptPath
    )

    if ($ServerHost) {
        $invokeArgs += @("-ServerHost", $ServerHost)
    }
    if ($KeyFile) {
        $invokeArgs += @("-KeyFile", $KeyFile)
    }

    & powershell @invokeArgs
    exit $LASTEXITCODE
} finally {
    if (Test-Path $tempScriptPath) {
        Remove-Item $tempScriptPath -Force -ErrorAction SilentlyContinue
    }
}

