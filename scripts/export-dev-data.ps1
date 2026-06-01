param(
    [string]$ComposeFile = "docker-compose.dev.yml",
    [string]$OutputDir = "dev-data",
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

$null = Get-PostgresContainerId

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$sqlPath = Join-Path $OutputDir "llm_delegate.sql"
$metaPath = Join-Path $OutputDir "export-info.json"
$exportedAt = [DateTimeOffset]::Now.ToString("o")

docker compose -f $ComposeFile exec -T postgres pg_dump `
    -U $PgUser `
    -d $Database `
    --no-owner `
    --no-privileges `
    --clean `
    --if-exists | Set-Content -Path $sqlPath -Encoding utf8

$metadata = [ordered]@{
    exportedAt = $exportedAt
    composeFile = $ComposeFile
    database = $Database
    postgresUser = $PgUser
    sqlFile = "llm_delegate.sql"
    note = "Redis session data is not included. Re-login after import if needed."
}

$metadata | ConvertTo-Json | Set-Content -Path $metaPath -Encoding utf8

Write-Output "Export completed."
Write-Output "SQL: $sqlPath"
Write-Output "META: $metaPath"
Write-Output "You can now commit the dev-data directory to Git."
