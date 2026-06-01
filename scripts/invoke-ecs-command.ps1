param(
    [ValidateSet("ecs2")]
    [string]$Target = "ecs2",
    [string]$ServerHost = "",
    [string]$User = "root",
    [string]$KeyFile = "",
    [string]$RemoteCommand = "",
    [string]$LocalScriptFile = "",
    [ValidateSet("bash", "sh")]
    [string]$Shell = "bash",
    [switch]$KeepRemoteScript
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

function Assert-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
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

function Resolve-LocalScriptFile {
    param([string]$ConfiguredPath)

    $explicitPath = Join-Path $projectRoot $ConfiguredPath
    if (Test-Path $explicitPath) {
        return (Resolve-Path $explicitPath).Path
    }

    if (Test-Path $ConfiguredPath) {
        return (Resolve-Path $ConfiguredPath).Path
    }

    throw "Local script file not found: $ConfiguredPath"
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

    $tempPath = Join-Path $env:TEMP ("llm-delegate-ecs-script-" + [guid]::NewGuid().ToString("N") + ".sh")
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempPath, $text, $utf8NoBom)
    return $tempPath
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

if (-not $ServerHost) {
    $ServerHost = Get-DefaultServerHost -SelectedTarget $Target
}

if ([string]::IsNullOrWhiteSpace($RemoteCommand) -and [string]::IsNullOrWhiteSpace($LocalScriptFile)) {
    throw "Specify either -RemoteCommand or -LocalScriptFile."
}

if (-not [string]::IsNullOrWhiteSpace($RemoteCommand) -and -not [string]::IsNullOrWhiteSpace($LocalScriptFile)) {
    throw "Use either -RemoteCommand or -LocalScriptFile, not both."
}

$remoteTarget = "$User@$ServerHost"
$sshKeyFilePath = $null
$normalizedScriptPath = $null

try {
    Assert-Command "ssh"
    Assert-Command "scp"

    $projectKeyFilePath = Resolve-SshKeyFile -ConfiguredKeyFile $KeyFile -SelectedTarget $Target
    $sshKeyFilePath = New-RestrictedSshKeyCopy -SourcePath $projectKeyFilePath

    if (-not [string]::IsNullOrWhiteSpace($RemoteCommand)) {
        Invoke-Checked -Script {
            & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget $RemoteCommand
        } -ErrorMessage "SSH command failed: $RemoteCommand"
        exit $LASTEXITCODE
    }

    $resolvedScriptPath = Resolve-LocalScriptFile -ConfiguredPath $LocalScriptFile
    $normalizedScriptPath = New-NormalizedScriptCopy -SourcePath $resolvedScriptPath
    $remoteScriptPath = "/tmp/llm-delegate-ecs-" + [guid]::NewGuid().ToString("N") + ".sh"

    try {
        Invoke-Checked -Script {
            & scp -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $normalizedScriptPath "${remoteTarget}:${remoteScriptPath}"
        } -ErrorMessage "SCP failed: $resolvedScriptPath -> ${remoteTarget}:${remoteScriptPath}"

        Invoke-Checked -Script {
            & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget "chmod 700 '$remoteScriptPath' && $Shell '$remoteScriptPath'"
        } -ErrorMessage "Remote script execution failed: $remoteScriptPath"
    } finally {
        if (-not $KeepRemoteScript) {
            & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget "rm -f '$remoteScriptPath'" | Out-Null
        }
    }
} finally {
    if ($normalizedScriptPath -and (Test-Path $normalizedScriptPath)) {
        Remove-Item $normalizedScriptPath -Force -ErrorAction SilentlyContinue
    }
    if ($sshKeyFilePath -and (Test-Path $sshKeyFilePath)) {
        Remove-Item $sshKeyFilePath -Force -ErrorAction SilentlyContinue
    }
}

