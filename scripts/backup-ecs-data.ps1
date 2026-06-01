param(
    [ValidateSet("ecs2")]
    [string]$Target = "ecs2",
    [string]$ServerHost = "",
    [string]$User = "root",
    [string]$KeyFile = "",
    [string]$DeployDir = "",
    [string]$OutputDir = "backups/ecs",
    [string]$RemoteEnvFile = ".env.deploy",
    [string]$RemoteComposeFile = "docker-compose.deploy-image.yml",
    [switch]$KeepRemoteBackup
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$remoteHelperSourcePath = Join-Path $PSScriptRoot "backup-ecs-data.remote.sh"

function Get-DefaultServerHost {
    param([string]$SelectedTarget)

    return "43.106.12.39"
}

function Get-DefaultDeployDir {
    return "/root/llm-delegate"
}

function Get-SshKeyCandidates {
    return @(
        (Join-Path $projectRoot "deploy/ssh/id_rsa"),
        (Join-Path $HOME ".ssh/id_rsa_sg"),
        (Join-Path $HOME ".ssh/id_rsa")
    )
}

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

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Label
    )

    if (-not (Test-Path $Path)) {
        throw "$Label not found: $Path"
    }
}

function Resolve-SshKeyFile {
    param(
        [string]$ConfiguredKeyFile,
        [string]$SelectedTarget
    )

    if ($ConfiguredKeyFile) {
        $explicitPath = Join-Path $projectRoot $ConfiguredKeyFile
        if (Test-Path $explicitPath) {
            return $explicitPath
        }

        if (Test-Path $ConfiguredKeyFile) {
            return (Resolve-Path $ConfiguredKeyFile).Path
        }

        throw "Configured SSH key file not found: $ConfiguredKeyFile"
    }

    $candidates = Get-SshKeyCandidates -SelectedTarget $SelectedTarget
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "No SSH key file found for target '$SelectedTarget'. Pass -KeyFile explicitly or add one of: $($candidates -join ', ')"
}

function New-RestrictedSshKeyCopy {
    param([string]$SourcePath)

    $tempPath = Join-Path $env:TEMP ("llm-delegate-ecs-id_rsa-" + [guid]::NewGuid().ToString("N"))
    $content = [System.IO.File]::ReadAllText($SourcePath) -replace "`r`n", "`n" -replace "`r", "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempPath, $content, $utf8NoBom)

    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, "Read", "Allow")
    $acl.SetOwner($currentUser)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule($rule)
    Set-Acl -Path $tempPath -AclObject $acl

    return $tempPath
}

function New-NormalizedScriptCopy {
    param([string]$SourcePath)

    $text = [System.IO.File]::ReadAllText($SourcePath)
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {
        $text = $text.Substring(1)
    }
    $text = $text -replace "`r`n", "`n"
    $text = $text -replace "`r", "`n"

    $tempPath = Join-Path $env:TEMP ("llm-delegate-ecs-backup-" + [guid]::NewGuid().ToString("N") + ".sh")
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempPath, $text, $utf8NoBom)
    return $tempPath
}

function Resolve-OutputRoot {
    param([string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Path))
}

function Quote-PosixLiteral {
    param([string]$Value)

    return "'" + ($Value -replace "'", "'""'""'") + "'"
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Script,
        [string]$ErrorMessage
    )

    & $Script
    if ($LASTEXITCODE -ne 0) {
        throw $ErrorMessage
    }
}

function Invoke-Ssh {
    param(
        [string]$RemoteTarget,
        [string]$SshKeyPath,
        [string]$Command
    )

    Invoke-Checked -Script {
        & ssh -i $SshKeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $RemoteTarget $Command
    } -ErrorMessage "SSH command failed: $Command"
}

function Invoke-ScpUpload {
    param(
        [string]$RemoteTarget,
        [string]$SshKeyPath,
        [string]$LocalPath,
        [string]$RemotePath
    )

    Invoke-Checked -Script {
        & scp -i $SshKeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $LocalPath "${RemoteTarget}:${RemotePath}"
    } -ErrorMessage "SCP upload failed: $LocalPath -> ${RemoteTarget}:${RemotePath}"
}

function Invoke-ScpDownloadDirectory {
    param(
        [string]$RemoteTarget,
        [string]$SshKeyPath,
        [string]$RemotePath,
        [string]$LocalPath
    )

    Invoke-Checked -Script {
        & scp -r -i $SshKeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "${RemoteTarget}:${RemotePath}/." $LocalPath
    } -ErrorMessage "SCP download failed: ${RemoteTarget}:${RemotePath} -> $LocalPath"
}

function New-BackupMetadata {
    param(
        [string]$LocalBackupDir,
        [string]$TargetName,
        [string]$RemoteHost,
        [string]$RemoteUser,
        [string]$RemoteDeployDir,
        [string]$RemoteEnvFileName,
        [string]$RemoteComposeFileName
    )

    $files = Get-ChildItem -Path $LocalBackupDir -Recurse -File | Sort-Object FullName | ForEach-Object {
        [ordered]@{
            path = $_.FullName.Substring($LocalBackupDir.Length).TrimStart('\').Replace('\', '/')
            sizeBytes = $_.Length
            lastWriteTimeUtc = $_.LastWriteTimeUtc.ToString("o")
        }
    }

    return [ordered]@{
        backedUpAt = [DateTimeOffset]::Now.ToString("o")
        target = $TargetName
        serverHost = $RemoteHost
        user = $RemoteUser
        deployDir = $RemoteDeployDir
        remoteEnvFile = $RemoteEnvFileName
        remoteComposeFile = $RemoteComposeFileName
        localBackupDir = $LocalBackupDir
        scope = @(
            "postgres logical dump",
            "postgres globals dump",
            "redis rdb snapshot",
            "redis /data archive",
            "ecs deploy env and compose files",
            "compose metadata"
        )
        files = $files
    }
}

if (-not $ServerHost) {
    $ServerHost = Get-DefaultServerHost -SelectedTarget $Target
}

if (-not $DeployDir) {
    $DeployDir = Get-DefaultDeployDir -SelectedTarget $Target
}

$backupLabel = [DateTimeOffset]::Now.ToString("yyyyMMdd-HHmmss")
$outputRoot = Resolve-OutputRoot -Path $OutputDir
$localTargetRoot = Join-Path $outputRoot $Target
$localBackupDir = Join-Path $localTargetRoot $backupLabel
$remoteTarget = "$User@$ServerHost"
$remoteBackupDir = "/tmp/llm-delegate-ecs-backup-$Target-$backupLabel-" + [guid]::NewGuid().ToString("N")
$remoteScriptPath = "/tmp/llm-delegate-ecs-backup-" + [guid]::NewGuid().ToString("N") + ".sh"
$sshKeyFilePath = $null
$normalizedHelperPath = $null

try {
    Write-Step "Checking required commands"
    Assert-Command "ssh"
    Assert-Command "scp"
    Assert-PathExists -Path $remoteHelperSourcePath -Label "Remote helper script"

    $projectKeyFilePath = Resolve-SshKeyFile -ConfiguredKeyFile $KeyFile -SelectedTarget $Target
    $sshKeyFilePath = New-RestrictedSshKeyCopy -SourcePath $projectKeyFilePath
    $normalizedHelperPath = New-NormalizedScriptCopy -SourcePath $remoteHelperSourcePath

    Write-Step "Checking remote SSH access"
    Invoke-Ssh -RemoteTarget $remoteTarget -SshKeyPath $sshKeyFilePath -Command "echo connected && hostname"

    Write-Step "Preparing local backup directory"
    New-Item -ItemType Directory -Force -Path $localBackupDir | Out-Null

    Write-Step "Uploading remote backup helper"
    Invoke-ScpUpload -RemoteTarget $remoteTarget -SshKeyPath $sshKeyFilePath -LocalPath $normalizedHelperPath -RemotePath $remoteScriptPath

    Write-Step "Creating backup on ECS"
    $remoteCommand = @(
        "mkdir -p $(Quote-PosixLiteral $remoteBackupDir)",
        "chmod 700 $(Quote-PosixLiteral $remoteScriptPath)",
        "bash $(Quote-PosixLiteral $remoteScriptPath) $(Quote-PosixLiteral $DeployDir) $(Quote-PosixLiteral $remoteBackupDir) $(Quote-PosixLiteral $RemoteEnvFile) $(Quote-PosixLiteral $RemoteComposeFile)"
    ) -join " && "
    Invoke-Ssh -RemoteTarget $remoteTarget -SshKeyPath $sshKeyFilePath -Command $remoteCommand

    Write-Step "Downloading backup to local machine"
    Invoke-ScpDownloadDirectory -RemoteTarget $remoteTarget -SshKeyPath $sshKeyFilePath -RemotePath $remoteBackupDir -LocalPath $localBackupDir

    $expectedFiles = @(
        (Join-Path $localBackupDir "postgres\globals.sql"),
        (Join-Path $localBackupDir "redis\redis.rdb"),
        (Join-Path $localBackupDir "deploy\$RemoteEnvFile"),
        (Join-Path $localBackupDir "meta\docker-compose-ps.txt")
    )
    foreach ($expectedFile in $expectedFiles) {
        Assert-PathExists -Path $expectedFile -Label "Downloaded backup file"
    }

    Write-Step "Writing local backup metadata"
    $metadataPath = Join-Path $localBackupDir "backup-info.json"
    $metadata = New-BackupMetadata `
        -LocalBackupDir $localBackupDir `
        -TargetName $Target `
        -RemoteHost $ServerHost `
        -RemoteUser $User `
        -RemoteDeployDir $DeployDir `
        -RemoteEnvFileName $RemoteEnvFile `
        -RemoteComposeFileName $RemoteComposeFile
    $metadata | ConvertTo-Json -Depth 6 | Set-Content -Path $metadataPath -Encoding utf8

    Write-Step "Backup completed"
    Write-Output "Local backup: $localBackupDir"
    Write-Output "Remote host: $remoteTarget"
    Write-Output "Deploy dir: $DeployDir"
} finally {
    if ($sshKeyFilePath -and (Test-Path $sshKeyFilePath)) {
        $cleanupParts = @()
        if ($remoteScriptPath) {
            $cleanupParts += "rm -f $(Quote-PosixLiteral $remoteScriptPath)"
        }
        if ($remoteBackupDir -and -not $KeepRemoteBackup) {
            $cleanupParts += "rm -rf $(Quote-PosixLiteral $remoteBackupDir)"
        }

        if ($cleanupParts.Count -gt 0) {
            & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget ($cleanupParts -join " && ") | Out-Null
        }
    }

    if ($normalizedHelperPath -and (Test-Path $normalizedHelperPath)) {
        Remove-Item $normalizedHelperPath -Force -ErrorAction SilentlyContinue
    }

    if ($sshKeyFilePath -and (Test-Path $sshKeyFilePath)) {
        Remove-Item $sshKeyFilePath -Force -ErrorAction SilentlyContinue
    }
}

