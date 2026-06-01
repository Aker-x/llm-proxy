param(
    [ValidateSet("ecs2")]
    [string]$Target = "ecs2",
    [string]$ServerHost = "",
    [string]$User = "root",
    [string]$KeyFile = "",
    [string]$RemoteCommand
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

function Get-DefaultServerHost {
    param([string]$SelectedTarget)

    return "43.106.12.39"
}

function Get-SshKeyCandidates {
    return @(
        (Join-Path $projectRoot "deploy/ssh/id_rsa"),
        (Join-Path $HOME ".ssh/id_rsa_sg"),
        (Join-Path $HOME ".ssh/id_rsa")
    )
}

# Auto-detect server host from target
if (-not $ServerHost) {
    $ServerHost = Get-DefaultServerHost -SelectedTarget $Target
}

$remoteTarget = "$User@$ServerHost"
$sshKeyFilePath = $null

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

try {
    Assert-Command "ssh"
    $projectKeyFilePath = Resolve-SshKeyFile -ConfiguredKeyFile $KeyFile -SelectedTarget $Target
    $sshKeyFilePath = New-RestrictedSshKeyCopy -SourcePath $projectKeyFilePath
    if ($RemoteCommand) {
        & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget $RemoteCommand
    } else {
        & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget
    }
    exit $LASTEXITCODE
} finally {
    if ($sshKeyFilePath -and (Test-Path $sshKeyFilePath)) {
        Remove-Item $sshKeyFilePath -Force -ErrorAction SilentlyContinue
    }
}

