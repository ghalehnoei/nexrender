# PowerShell script to install Nexrender Worker as Windows Service using NSSM
# Run this script as Administrator

param(
    [string]$NSSMPath = "C:\nssm\nssm.exe",
    [string]$WorkerPath = "",
    [string]$ServiceName = "NexrenderWorker",
    [string]$ServerHost = "http://localhost:3000",
    [string]$Secret = "",
    [string]$WorkerName = "worker1",
    [int]$MaxConcurrentJobs = 5,
    [int]$StatusPort = 3100,
    [switch]$UseBinary = $false,
    [string]$BinaryPath = ""
)

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

# Determine worker executable
if ($UseBinary -and $BinaryPath) {
    $WorkerExecutable = $BinaryPath
    $WorkerArgs = "--host=$ServerHost --name=$WorkerName --concurrency=$MaxConcurrentJobs --status-port=$StatusPort"
    if ($Secret) {
        $WorkerArgs += " --secret=$Secret"
    }
} else {
    if (-not $WorkerPath) {
        # Try to find worker path
        $WorkerPath = Join-Path $PSScriptRoot "packages\nexrender-worker\src\bin.js"
        if (-not (Test-Path $WorkerPath)) {
            Write-Host "ERROR: Worker path not found. Please specify -WorkerPath" -ForegroundColor Red
            exit 1
        }
    }
    $WorkerExecutable = "node"
    $WorkerArgs = "`"$WorkerPath`" --host=$ServerHost --name=$WorkerName --concurrency=$MaxConcurrentJobs --status-port=$StatusPort"
    if ($Secret) {
        $WorkerArgs += " --secret=$Secret"
    }
}

# Check if NSSM exists
if (-not (Test-Path $NSSMPath)) {
    Write-Host "ERROR: NSSM not found at $NSSMPath" -ForegroundColor Red
    Write-Host "Please download NSSM from https://nssm.cc/download and extract it" -ForegroundColor Yellow
    Write-Host "Or specify the path using -NSSMPath parameter" -ForegroundColor Yellow
    exit 1
}

# Check if service already exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Service '$ServiceName' already exists. Stopping it first..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    & $NSSMPath remove $ServiceName confirm
    Start-Sleep -Seconds 2
}

Write-Host "Installing Nexrender Worker as Windows Service..." -ForegroundColor Green
Write-Host "Service Name: $ServiceName" -ForegroundColor Cyan
Write-Host "Executable: $WorkerExecutable" -ForegroundColor Cyan
Write-Host "Arguments: $WorkerArgs" -ForegroundColor Cyan

# Install the service
& $NSSMPath install $ServiceName $WorkerExecutable $WorkerArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install service" -ForegroundColor Red
    exit 1
}

# Set service description
& $NSSMPath set $ServiceName Description "Nexrender Worker - Processes After Effects rendering jobs"

# Set startup type to Automatic
& $NSSMPath set $ServiceName Start SERVICE_AUTO_START

# Set restart on failure
& $NSSMPath set $ServiceName AppRestartDelay 5000
& $NSSMPath set $ServiceName AppExit Default Restart

# Set working directory
$WorkingDirectory = Split-Path -Parent $WorkerExecutable
if (-not $UseBinary) {
    $WorkingDirectory = $PSScriptRoot
}
& $NSSMPath set $ServiceName AppDirectory $WorkingDirectory

# Configure service to run as current user (to avoid SYSTEM profile issues)
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& $NSSMPath set $ServiceName ObjectName $CurrentUser

# Configure logging
$LogPath = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
}
& $NSSMPath set $ServiceName AppStdout (Join-Path $LogPath "worker-stdout.log")
& $NSSMPath set $ServiceName AppStderr (Join-Path $LogPath "worker-stderr.log")

Write-Host "`nService installed successfully!" -ForegroundColor Green
Write-Host "`nTo start the service, run:" -ForegroundColor Yellow
Write-Host "  Start-Service -Name $ServiceName" -ForegroundColor Cyan
Write-Host "`nOr use:" -ForegroundColor Yellow
Write-Host "  & '$NSSMPath' start $ServiceName" -ForegroundColor Cyan
Write-Host "`nTo view logs:" -ForegroundColor Yellow
Write-Host "  Get-Content '$LogPath\worker-stdout.log' -Wait" -ForegroundColor Cyan

