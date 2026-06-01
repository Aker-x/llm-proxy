param(
    [ValidateSet("ecs2")]
    [string]$Target = "ecs2",
    [string]$ServerHost = "",
    [string]$User = "root",
    [string]$KeyFile = "",
    [string]$DeployDir = "",
    [string]$EnvFile = ".env.deploy",
    [string]$BuildComposeFile = "docker-compose.deploy.yml",
    [string]$DeployComposeFile = "docker-compose.deploy-image.yml",
    [string]$ImageTar = "llm-delegate.tar",
    [string]$TemplateFile = "deploy/nginx/default.conf.template",
    [string]$LinuxStartScript = "scripts/start-multi-instance.sh",
    [switch]$SkipBuild,
    [switch]$SkipUpload,
    [switch]$SkipRemoteDeploy,
    [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

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

# Auto-detect server host from target
if (-not $ServerHost) {
    $ServerHost = Get-DefaultServerHost -SelectedTarget $Target
}
if (-not $DeployDir) {
    $DeployDir = Get-DefaultDeployDir -SelectedTarget $Target
}
$envFilePath = Join-Path $projectRoot $EnvFile
$buildComposePath = Join-Path $projectRoot $BuildComposeFile
$deployComposePath = Join-Path $projectRoot $DeployComposeFile
$imageTarPath = Join-Path $projectRoot $ImageTar
$templateFilePath = Join-Path $projectRoot $TemplateFile
$linuxStartScriptPath = Join-Path $projectRoot $LinuxStartScript
$remoteTarget = "$User@$ServerHost"
$remoteUrl = "http://$ServerHost/"
$sshKeyFilePath = $null

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
    Copy-Item $SourcePath $tempPath -Force

    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, "Read", "Allow")
    $acl.SetOwner($currentUser)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule($rule)
    Set-Acl -Path $tempPath -AclObject $acl

    return $tempPath
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
    param([string]$Command)

    Invoke-Checked -Script {
        & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget $Command
    } -ErrorMessage "SSH command failed: $Command"
}

function Invoke-Scp {
    param(
        [string]$LocalPath,
        [string]$RemotePath
    )

    Invoke-Checked -Script {
        & scp -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $LocalPath "${remoteTarget}:${RemotePath}"
    } -ErrorMessage "SCP failed: $LocalPath -> ${remoteTarget}:${RemotePath}"
}

function Get-FileSha256 {
    param([string]$Path)

    return (Get-FileHash $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Invoke-SshHttpHealthCheck {
    param(
        [string]$Url,
        [int]$Attempts = 10,
        [int]$DelaySeconds = 3
    )

    $remoteCommand = "for i in `$(seq 1 $Attempts); do curl -fsS -o /dev/null -I --max-time 10 $Url && exit 0; sleep $DelaySeconds; done; exit 1"
    Invoke-Ssh $remoteCommand
}

function Invoke-LocalHttpHealthCheck {
    param(
        [string]$Url,
        [int]$Attempts = 10,
        [int]$DelaySeconds = 3
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        & curl.exe -fsS -o NUL -I --max-time 15 $Url
        if ($LASTEXITCODE -eq 0) {
            return
        }

        if ($attempt -lt $Attempts) {
            Start-Sleep -Seconds $DelaySeconds
        }
    }

    throw "Public health check failed after $Attempts attempts: $Url"
}

Push-Location $projectRoot

try {
    Write-Step "Checking required commands"
    Assert-Command "docker"
    Assert-Command "ssh"
    Assert-Command "scp"

    Assert-PathExists -Path $envFilePath -Label "Env file"
    Assert-PathExists -Path $buildComposePath -Label "Build compose file"
    Assert-PathExists -Path $deployComposePath -Label "Deploy compose file"
    Assert-PathExists -Path $templateFilePath -Label "Nginx template"
    Assert-PathExists -Path $linuxStartScriptPath -Label "Linux start script"
    $projectKeyFilePath = Resolve-SshKeyFile -ConfiguredKeyFile $KeyFile -SelectedTarget $Target
    $sshKeyFilePath = New-RestrictedSshKeyCopy -SourcePath $projectKeyFilePath

    Write-Step "Checking remote SSH access"
    Invoke-Ssh "echo connected && hostname"

    if (-not $SkipBuild) {
        Write-Step "Building app image"
        Invoke-Checked -Script {
            & docker compose --env-file $envFilePath -f $buildComposePath build --no-cache migrate
        } -ErrorMessage "docker compose build failed."

        Write-Step "Exporting image tar"
        Invoke-Checked -Script {
            & docker save -o $imageTarPath llm-delegate:latest
        } -ErrorMessage "docker save failed."
    } else {
        Write-Step "Skipping local image build"
    }

    Assert-PathExists -Path $imageTarPath -Label "Image tar"
    $localTarSha = Get-FileSha256 -Path $imageTarPath

    if (-not $SkipUpload) {
        Write-Step "Preparing remote deployment directory"
        Invoke-Ssh "mkdir -p $DeployDir/deploy/nginx $DeployDir/scripts"

        Write-Step "Uploading deployment files"
        Invoke-Scp -LocalPath $envFilePath -RemotePath "$DeployDir/.env.deploy"
        Invoke-Scp -LocalPath $deployComposePath -RemotePath "$DeployDir/docker-compose.deploy-image.yml"
        Invoke-Scp -LocalPath $templateFilePath -RemotePath "$DeployDir/deploy/nginx/default.conf.template"
        Invoke-Scp -LocalPath $linuxStartScriptPath -RemotePath "$DeployDir/scripts/start-multi-instance.sh"
        Invoke-Scp -LocalPath $imageTarPath -RemotePath "$DeployDir/$ImageTar"
    } else {
        Write-Step "Skipping file upload"
    }

    Write-Step "Verifying uploaded image tar"
    $remoteTarShaOutput = & ssh -i $sshKeyFilePath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new $remoteTarget "sha256sum $DeployDir/$ImageTar"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to read remote tar checksum."
    }

    $remoteTarSha = (($remoteTarShaOutput | Select-Object -First 1) -split '\s+')[0].ToLowerInvariant()
    if ($remoteTarSha -ne $localTarSha) {
        throw "Remote tar checksum mismatch. local=$localTarSha remote=$remoteTarSha"
    }

    if (-not $SkipRemoteDeploy) {
        Write-Step "Restarting stack on ECS"
        Invoke-Ssh "cd $DeployDir && chmod +x scripts/start-multi-instance.sh && MODE=deploy ./scripts/start-multi-instance.sh"
    } else {
        Write-Step "Skipping remote deployment"
    }

    if (-not $SkipHealthCheck) {
        Write-Step "Checking containers on ECS"
        Invoke-Ssh "docker compose --env-file $DeployDir/.env.deploy -f $DeployDir/docker-compose.deploy-image.yml ps"

        Write-Step "Checking service from ECS"
        Invoke-SshHttpHealthCheck -Url "http://127.0.0.1/"

        Write-Step "Checking public endpoint"
        Invoke-LocalHttpHealthCheck -Url $remoteUrl
    } else {
        Write-Step "Skipping health checks"
    }

    Write-Step "Deployment completed"
    Write-Output "Remote URL: $remoteUrl"
    Write-Output "Remote host: $remoteTarget"
    Write-Output "SSH key: $projectKeyFilePath"
    Write-Output "Deploy dir: $DeployDir"
} finally {
    if ($sshKeyFilePath -and (Test-Path $sshKeyFilePath)) {
        Remove-Item $sshKeyFilePath -Force -ErrorAction SilentlyContinue
    }
    Pop-Location
}

