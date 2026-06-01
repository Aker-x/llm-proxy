param(
    [ValidateSet("dev", "deploy")]
    [string]$Mode = "dev",
    [string]$EnvFile = ".env.deploy",
    [string]$DevComposeFile = "docker-compose.deploy.yml",
    [string]$DeployComposeFile = "docker-compose.deploy-image.yml",
    [string]$InputSql = "dev-data/llm_delegate.sql",
    [string]$Database = "llm_delegate",
    [string]$PgUser = "postgres",
    [string]$ImageTar = "llm-delegate.tar",
    [switch]$SkipImportDevData,
    [switch]$SkipImageLoad
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = if ($Mode -eq "deploy") { $DeployComposeFile } else { $DevComposeFile }
$composeFilePath = Join-Path $projectRoot $composeFile
$envFilePath = Join-Path $projectRoot $EnvFile
$imageTarPath = Join-Path $projectRoot $ImageTar
$stackServices = @("migrate", "app-1", "app-2", "app-3", "nginx")

function Write-Step {
    param([string]$Message)

    Write-Output ""
    Write-Output "==> $Message"
}

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Test-DockerReady {
    try {
        & docker info *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Ensure-DockerReady {
    if (Test-DockerReady) {
        return
    }

    $dockerDesktopPaths = @(
        "C:\Program Files\Docker\Docker\Docker Desktop.exe",
        (Join-Path $env:LocalAppData "Docker\Docker Desktop.exe")
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($dockerDesktopPaths.Count -gt 0) {
        Write-Step "Starting Docker Desktop"
        try {
            & cmd /c start "" "`"$($dockerDesktopPaths[0])`""
        } catch {
            Write-Output "Automatic Docker Desktop launch failed. You may need to start it manually."
        }
    }

    Write-Step "Waiting for Docker daemon"
    $deadline = (Get-Date).AddMinutes(3)
    do {
        Start-Sleep -Seconds 5
        if (Test-DockerReady) {
            return
        }
    } while ((Get-Date) -lt $deadline)

    throw "Docker daemon is not ready. Start Docker Desktop and retry."
}

function Invoke-Compose {
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$ComposeArgs
    )

    & docker compose --env-file $envFilePath -f $composeFilePath @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed: docker compose --env-file $envFilePath -f $composeFilePath $($ComposeArgs -join ' ')"
    }
}

function Get-ComposeContainerId {
    param([string]$ServiceName)

    $containerId = (& docker compose --env-file $envFilePath -f $composeFilePath ps -a -q $ServiceName).Trim()
    if (-not $containerId) {
        throw "Container not found for service: $ServiceName"
    }

    return $containerId
}

function Wait-ForServiceState {
    param(
        [string]$ServiceName,
        [string[]]$AcceptedStates,
        [int]$TimeoutSeconds = 120
    )

    $containerId = Get-ComposeContainerId -ServiceName $ServiceName
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    do {
        $state = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $containerId).Trim()
        if ($AcceptedStates -contains $state) {
            return
        }

        Start-Sleep -Seconds 3
    } while ((Get-Date) -lt $deadline)

    & docker compose --env-file $envFilePath -f $composeFilePath ps
    throw "Service did not reach state [$($AcceptedStates -join ', ')]: $ServiceName"
}

function Assert-ServiceExitedSuccessfully {
    param([string]$ServiceName)

    $containerId = Get-ComposeContainerId -ServiceName $ServiceName
    $exitCode = (& docker inspect --format "{{.State.ExitCode}}" $containerId).Trim()
    if ($exitCode -ne "0") {
        & docker compose --env-file $envFilePath -f $composeFilePath logs --tail 50 $ServiceName
        throw "Service exited with failure: $ServiceName (exit code $exitCode)"
    }
}

function Invoke-ImportDevData {
    if ($SkipImportDevData) {
        Write-Step "Skipping development data import"
        return
    }

    $resolvedSqlPath = Join-Path $projectRoot $InputSql
    if (-not (Test-Path $resolvedSqlPath)) {
        Write-Step "Development data dump not found, skipping import"
        return
    }

    Write-Step "Importing development data"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "import-dev-data.ps1") `
        -ComposeFile $composeFilePath `
        -InputSql $InputSql `
        -Database $Database `
        -PgUser $PgUser

    if ($LASTEXITCODE -ne 0) {
        throw "Development data import failed."
    }
}

function Invoke-ImageLoadIfNeeded {
    if ($SkipImageLoad) {
        Write-Step "Skipping image load"
        return
    }

    if (-not (Test-Path $imageTarPath)) {
        Write-Step "Image tar not found, skipping docker load"
        return
    }

    Write-Step "Loading app image tar"
    & docker load -i $imageTarPath
    if ($LASTEXITCODE -ne 0) {
        throw "docker load failed."
    }
}

function Get-EnvValue {
    param(
        [string]$Key,
        [string]$Fallback
    )

    if (-not (Test-Path $envFilePath)) {
        return $Fallback
    }

    $line = Get-Content $envFilePath | Where-Object {
        $_ -match "^\s*$([Regex]::Escape($Key))="
    } | Select-Object -First 1

    if (-not $line) {
        return $Fallback
    }

    return ($line -replace "^\s*$([Regex]::Escape($Key))=", "").Trim()
}

function Show-StartupSummary {
    $publicPort = Get-EnvValue -Key "PORT" -Fallback "3000"

    Write-Output ""
    Write-Output "Multi-instance stack is ready."
    Write-Output "Application URL: http://127.0.0.1:$publicPort"
    Write-Output "Active app instances: app-1, app-2, app-3"
    Write-Output "Compose file: $composeFile"
}

Push-Location $projectRoot

try {
    Write-Step "Checking required commands"
    Assert-Command "docker"
    Assert-Command "powershell"

    if (-not (Test-Path $envFilePath)) {
        throw "Env file not found: $EnvFile"
    }

    if (-not (Test-Path $composeFilePath)) {
        throw "Compose file not found: $composeFile"
    }

    Write-Step "Checking Docker runtime"
    Write-Output ("Docker: " + (docker --version))
    Ensure-DockerReady

    if ($Mode -eq "dev") {
        Write-Step "Resetting previous development containers"
        Invoke-Compose down --remove-orphans

        Write-Step "Starting PostgreSQL and Redis"
        Invoke-Compose up -d postgres redis
        Wait-ForServiceState -ServiceName "postgres" -AcceptedStates @("healthy", "running")
        Wait-ForServiceState -ServiceName "redis" -AcceptedStates @("healthy", "running")

        Invoke-ImportDevData

        Write-Step "Building application image"
        Invoke-Compose build migrate

        Write-Step "Starting multi-instance development stack"
        Invoke-Compose up -d --force-recreate --no-build @stackServices
    } else {
        Invoke-ImageLoadIfNeeded

        Write-Step "Starting PostgreSQL and Redis"
        Invoke-Compose up -d postgres redis
        Wait-ForServiceState -ServiceName "postgres" -AcceptedStates @("healthy", "running")
        Wait-ForServiceState -ServiceName "redis" -AcceptedStates @("healthy", "running")

        Write-Step "Starting multi-instance deployment stack"
        Invoke-Compose up -d --force-recreate --no-build @stackServices
    }

    Wait-ForServiceState -ServiceName "migrate" -AcceptedStates @("exited")
    Assert-ServiceExitedSuccessfully -ServiceName "migrate"
    Wait-ForServiceState -ServiceName "app-1" -AcceptedStates @("running")
    Wait-ForServiceState -ServiceName "app-2" -AcceptedStates @("running")
    Wait-ForServiceState -ServiceName "app-3" -AcceptedStates @("running")
    Wait-ForServiceState -ServiceName "nginx" -AcceptedStates @("running")

    Write-Step "Startup completed"
    Show-StartupSummary
} finally {
    Pop-Location
}
