param(
    [string]$ComposeFile = "docker-compose.dev.yml",
    [string]$InputSql = "dev-data/llm_delegate.sql",
    [string]$Database = "llm_delegate",
    [string]$PgUser = "postgres"
)

$ErrorActionPreference = "Stop"

function Get-PostgresContainerId {
    $containerId = docker compose -f $ComposeFile ps -q postgres
    if (-not $containerId) {
        throw "PostgreSQL container is not running. Start it with: docker compose -f $ComposeFile up -d"
    }

    return $containerId.Trim()
}

if (-not (Test-Path $InputSql)) {
    throw "SQL file not found: $InputSql"
}

$containerId = Get-PostgresContainerId
$resolvedSqlPath = (Resolve-Path $InputSql).Path
$targetPath = "/tmp/llm_delegate.sql"
$sanitizedSqlPath = Join-Path ([System.IO.Path]::GetTempPath()) ("llm_delegate-import-" + [Guid]::NewGuid().ToString("N") + ".sql")

try {
    $sqlContent = Get-Content -Path $resolvedSqlPath -Raw
    $sqlContent = $sqlContent -replace '(?m)^\\restrict\b.*\r?\n?', ''
    $sqlContent = $sqlContent -replace '(?m)^\\unrestrict\b.*\r?\n?', ''
    Set-Content -Path $sanitizedSqlPath -Value $sqlContent -Encoding utf8

    docker cp $sanitizedSqlPath "${containerId}:${targetPath}"
    docker compose -f $ComposeFile exec -T postgres sh -lc "psql -v ON_ERROR_STOP=1 -U '$PgUser' -d '$Database' -f '$targetPath'"
} finally {
    if (Test-Path $sanitizedSqlPath) {
        Remove-Item $sanitizedSqlPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Output "Import completed."
Write-Output "Imported from: $resolvedSqlPath"
Write-Output "If the app is already running, refresh the page or restart the app to pick up the restored data."
