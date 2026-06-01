# CLIProxy Auth Health Check

This document describes a safe way to verify whether every CLIProxy auth file on the ECS host is still valid, and whether each multi-auth pool is still rotating as expected.

The current helper script is:

- [`scripts/check-cliproxy-auth-health.ps1`](../scripts/check-cliproxy-auth-health.ps1)

## Why This Check Exists

In the current ECS2 deployment, there may be multiple numbered `cliproxy-*` instances, and each instance may contain multiple OAuth auth files under an auth directory such as:

- `/root/.cli-proxy-api-1`
- `/root/.cli-proxy-api-2`

Some auth files may continue to exist on disk after the upstream token has already been invalidated. A file can therefore look "present" but still fail real inference requests.

This is why checking only file existence is not enough.

## Key Principle

Use a real inference request to judge auth validity.

Do not use only `GET /v1/models` as the validity signal.

`GET /v1/models` confirms that the temporary probe instance is reachable, but it does not prove that the underlying OAuth token can still complete a real upstream request.

The authoritative check is:

1. Start a temporary probe container on the ECS host with exactly one auth file mounted.
2. Call `POST /v1/responses` with a minimal prompt.
3. Treat `200` plus the expected reply as success.
4. Treat `401`, `token_invalidated`, `Invalid API key`, or similar upstream auth errors as failure.

## What The Script Does

[`scripts/check-cliproxy-auth-health.ps1`](../scripts/check-cliproxy-auth-health.ps1) runs from the local Windows machine and reuses the repository SSH helper.

It does the following on the ECS host:

1. Discovers all running `cliproxy-*` containers by default.
2. For each discovered instance:
   - reads the running image and mounted config path from Docker
   - reads the configured auth directory and first API key from the instance config
3. For each selected auth file in that instance:
   - copies only that file into a temporary auth directory
   - starts a temporary probe container using the same CLIProxy image
   - runs `GET /v1/models` as a readiness check
   - prefers a compatible probe model from that auth file's advertised model list
   - falls back to provider-specific probe models when `/v1/models` is empty or delayed
   - runs `POST /v1/responses` with an `input` message array, so mixed providers such as Codex and Claude can both be validated correctly
4. Records:
   - HTTP status
   - selected probe model
   - response text
   - `safety_identifier`
   - upstream error code and message, if present
5. Optionally starts a second temporary probe with all selected auth files for that instance and issues multiple requests to observe round-robin behavior.

The production `cliproxy-1` / `cliproxy-2` containers are not modified or restarted during the check.

## Why ECS-Side Probing Is Preferred

Testing from the local development machine may be misleading when the network path to the ECS public IP is filtered or intercepted before the request reaches CLIProxy.

We already observed cases where:

- local direct access to `http://43.106.12.39:8318` returned an empty `403`
- the CLIProxy application logs did not show the request
- the same request succeeded when executed from the ECS host itself

Because of that, this script performs the authoritative probe on the ECS host.

## Usage

Run from the `llm-proxy` project root on Windows PowerShell.

By default the script checks ECS2. Check every discovered `cliproxy-*` instance and every auth file:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1
```

Check ECS2 instead:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1 -Target ecs2
```

Check only instance 1:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1 -Instance 1
```

Check only instance 2:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1 -Instance 2
```

Check only selected auth files for one instance:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1 `
  -Instance 1 `
  -AuthFiles codex-liuzhenyu08034@outlook.com-pro.json,codex-liuzhenyu08035@outlook.com-pro.json
```

Skip round-robin verification:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1 `
  -Instance 1 `
  -SkipRoundRobin
```

Increase the number of round-robin probe requests:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1 `
  -RoundRobinRequests 8
```

## Output Interpretation

Each single-auth probe prints a result line similar to:

```text
RESULT file=codex-xxx.json status=OK http=200 safety_id=user-... text=pong
```

or:

```text
RESULT file=codex-xxx.json status=FAILED http=401 error_code=token_invalidated error_message=Your authentication token has been invalidated. Please try signing in again.
```

or:

```text
RESULT file=claude-xxx.json status=INCONCLUSIVE http=502 error_code=internal_server_error error_message=unknown provider for model ...
```

or:

```text
RESULT file=codex-xxx.json status=FAILED http=429 error_code=usage_limit_reached error_message=The usage limit has been reached
```

or:

```text
RESULT file=codex-xxx.json status=FAILED http=429 error_code=model_cooldown error_message=All credentials for model gpt-5.5 are cooling down via provider codex
```

Interpretation:

- `status=OK`
  - The auth file completed a real upstream inference request.
- `status=FAILED http=401 error_code=token_invalidated`
  - The auth file is present but no longer usable.
- `status=FAILED http=401` with invalid API key style errors
  - The auth file or downstream API key path is invalid.
- `status=INCONCLUSIVE`
  - The script could not prove the auth was invalid, but also could not complete a stable provider/model probe.
  - This usually means you should retry, or run a narrower per-instance/per-provider probe.
- `error_code=usage_limit_reached`
  - The auth is reachable, but its current plan/quota is exhausted.
  - This is a capacity problem, not the same as an invalid or missing auth file.
- `error_code=model_cooldown`
  - The provider can see the auth, but every credential for that model is currently cooling down.
  - Treat this as a temporary availability problem for that model, not an auth parse failure.
- `error_message=unknown provider for model ...`
  - Usually means the probe selected a model that is not currently routable for that auth/config combination.
  - Treat this as inconclusive first, then retry with a narrower model or per-instance probe.
- `status=FAILED http=403`
  - Check whether the response came from CLIProxy or from a network layer in front of it.
- `status=FAILED http=5xx`
  - Treat as transport/runtime failure first, then inspect logs.

## Round-Robin Verification

When more than one auth file is selected for a given instance, the script can also verify that instance's current pool behavior.

For mixed-provider auth directories, the script only performs round-robin verification when the selected auth files share the same probe model. If different auth files expose different provider-specific models, round-robin is reported as inconclusive instead of forcing a false failure.

If one instance mixes providers in the same auth directory, validate round-robin on a provider-specific subset instead of forcing all files into the same pool.

Example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-cliproxy-auth-health.ps1 `
  -Instance 1 `
  -AuthFiles codex-a.json,codex-b.json,codex-c.json
```

It does this by:

1. learning the `safety_identifier` returned by each auth file during isolated single-auth probes
2. starting a second probe container with all selected auth files loaded together
3. issuing multiple `POST /v1/responses` requests
4. checking whether the observed `safety_identifier` sequence cycles across more than one auth

Example of a healthy two-auth result:

```text
ROUND_ROBIN req=1 status=200 safety_id=user-a mapped_file=file-a.json text=pong
ROUND_ROBIN req=2 status=200 safety_id=user-b mapped_file=file-b.json text=pong
ROUND_ROBIN req=3 status=200 safety_id=user-a mapped_file=file-a.json text=pong
ROUND_ROBIN req=4 status=200 safety_id=user-b mapped_file=file-b.json text=pong
ROUND_ROBIN status=OK unique_safety_ids=2
```

If the script cannot distinguish two auth files because they return the same `safety_identifier`, it reports round-robin as inconclusive instead of forcing a false failure.

## Suggested Maintenance Workflow

Use this workflow whenever a new auth is added or an old auth is suspected to be stale:

1. Run the health-check script with its default behavior to cover all `cliproxy-*` instances.
2. Remove auth files that return `token_invalidated` or equivalent auth failures.
3. If a result is `usage_limit_reached` or `model_cooldown`, replace that auth, wait for reset, or validate a different model before treating it as broken.
4. Re-run the script to confirm the remaining pools are healthy.
5. Re-check round-robin after any cleanup.

## Current Environment Notes

This helper is written for the current ECS deployment pattern:

- Default target: `ecs2`
- ECS2 host: `43.106.12.39`
- ECS2 host: `43.106.12.39`
- Containers:
  - `cliproxy-1`
  - `cliproxy-2`
- Typical config mounts:
  - `/root/cliproxy-config-1.yaml`
  - `/root/cliproxy-config-2.yaml`

The script intentionally discovers these details from the running containers instead of hardcoding every path.

Recent real-world note:

- As of 2026-05-03, the active instances are numbered rather than public/private: `cliproxy-1` and `cliproxy-2`.
- Historical public/private labels should not be used for future documentation or operational commands.
- ECS2 and ECS2 may run the same application code while keeping different CLIProxy auth/config data. Always choose `-Target ecs2` or `-Target ecs2` deliberately before interpreting health-check results.

