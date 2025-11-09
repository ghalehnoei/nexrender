# Quick Installation Script for Nexrender Worker as Windows Service
# This script will download NSSM if needed and install the service

param(
    [string]$ServerHost = "http://localhost:3000",
    [string]$Secret = "",
    [string]$WorkerName = "worker1",
    [int]$MaxConcurrentJobs = 5,
    [int]$StatusPort = 3100,
    [string]$ServiceName = "NexrenderWorker",
    [string]$NSSMPath = "C:\nssm\nssm.exe"
)

$ErrorActionPreference = "Stop"

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkerBinary = Join-Path $ScriptDir "bin\nexrender-worker-win64.exe"

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Check if worker binary exists
if (-not (Test-Path $WorkerBinary)) {
    Write-Host "ERROR: Worker binary not found at: $WorkerBinary" -ForegroundColor Red
    Write-Host "Please build the packages first using: npm run pkg" -ForegroundColor Yellow
    exit 1
}

# Check if NSSM exists, if not, offer to download
if (-not (Test-Path $NSSMPath)) {
    Write-Host "NSSM not found at $NSSMPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "NSSM (Non-Sucking Service Manager) is required to install the service." -ForegroundColor Cyan
    Write-Host "Please download it from: https://nssm.cc/download" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "After downloading:" -ForegroundColor Yellow
    Write-Host "1. Extract the ZIP file" -ForegroundColor White
    Write-Host "2. Copy win64\nssm.exe to C:\nssm\nssm.exe" -ForegroundColor White
    Write-Host "3. Run this script again" -ForegroundColor White
    Write-Host ""
    
    $download = Read-Host "Would you like to open the download page? (Y/N)"
    if ($download -eq "Y" -or $download -eq "y") {
        Start-Process "https://nssm.cc/download"
    }
    
    exit 1
}

Write-Host "Installing Nexrender Worker as Windows Service..." -ForegroundColor Green
Write-Host ""

# Build worker arguments
$WorkerArgs = "--host=$ServerHost --name=$WorkerName --concurrency=$MaxConcurrentJobs --status-port=$StatusPort"
if ($Secret) {
    $WorkerArgs += " --secret=$Secret"
}

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Service Name: $ServiceName" -ForegroundColor White
Write-Host "  Worker Binary: $WorkerBinary" -ForegroundColor White
Write-Host "  Server Host: $ServerHost" -ForegroundColor White
Write-Host "  Worker Name: $WorkerName" -ForegroundColor White
Write-Host "  Max Concurrent Jobs: $MaxConcurrentJobs" -ForegroundColor White
Write-Host "  Status Port: $StatusPort" -ForegroundColor White
if ($Secret) {
    Write-Host "  Secret: [CONFIGURED]" -ForegroundColor White
} else {
    Write-Host "  Secret: [NOT SET]" -ForegroundColor Yellow
}
Write-Host ""

# Check if service already exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Service '$ServiceName' already exists." -ForegroundColor Yellow
    $remove = Read-Host "Remove existing service? (Y/N)"
    if ($remove -eq "Y" -or $remove -eq "y") {
        Write-Host "Stopping and removing existing service..." -ForegroundColor Yellow
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        & $NSSMPath remove $ServiceName confirm
        Start-Sleep -Seconds 2
    } else {
        Write-Host "Installation cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Install the service
Write-Host "Installing service..." -ForegroundColor Green
& $NSSMPath install $ServiceName $WorkerBinary $WorkerArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install service" -ForegroundColor Red
    exit 1
}

# Configure service settings
Write-Host "Configuring service settings..." -ForegroundColor Green

# Set service description
& $NSSMPath set $ServiceName Description "Nexrender Worker - Processes After Effects rendering jobs"

# Set startup type to Automatic
& $NSSMPath set $ServiceName Start SERVICE_AUTO_START

# Set restart on failure
& $NSSMPath set $ServiceName AppRestartDelay 5000
& $NSSMPath set $ServiceName AppExit Default Restart

# Set working directory
& $NSSMPath set $ServiceName AppDirectory $ScriptDir

# Configure service to run as current user (to avoid SYSTEM profile issues)
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& $NSSMPath set $ServiceName ObjectName $CurrentUser

# Configure logging
$LogPath = Join-Path $ScriptDir "logs"
if (-not (Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
}
& $NSSMPath set $ServiceName AppStdout (Join-Path $LogPath "worker-stdout.log")
& $NSSMPath set $ServiceName AppStderr (Join-Path $LogPath "worker-stderr.log")

Write-Host ""
Write-Host "Service installed successfully!" -ForegroundColor Green
Write-Host ""

# Ask if user wants to start the service
$start = Read-Host "Would you like to start the service now? (Y/N)"
if ($start -eq "Y" -or $start -eq "y") {
    Write-Host "Starting service..." -ForegroundColor Green
    try {
        Start-Service -Name $ServiceName -ErrorAction Stop
        Start-Sleep -Seconds 3
        
        $service = Get-Service -Name $ServiceName
        if ($service.Status -eq "Running") {
            Write-Host "Service is now running!" -ForegroundColor Green
        } else {
            Write-Host "Service status: $($service.Status)" -ForegroundColor Yellow
            Write-Host "Check logs for details: $LogPath" -ForegroundColor Yellow
            if (Test-Path (Join-Path $LogPath "worker-stderr.log")) {
                Write-Host ""
                Write-Host "Last few error log entries:" -ForegroundColor Cyan
                Get-Content (Join-Path $LogPath "worker-stderr.log") -Tail 5
            }
        }
    } catch {
        Write-Host "ERROR: Failed to start service: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "The service may need to be configured to run as your user account." -ForegroundColor Yellow
        Write-Host "Run this command to fix it:" -ForegroundColor Yellow
        Write-Host "  C:\nssm\nssm.exe set $ServiceName ObjectName `"$CurrentUser`"" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Or run the fix script:" -ForegroundColor Yellow
        Write-Host "  .\fix-service-user.ps1" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  Start service:   Start-Service -Name $ServiceName" -ForegroundColor White
Write-Host "  Stop service:    Stop-Service -Name $ServiceName" -ForegroundColor White
Write-Host "  Restart service: Restart-Service -Name $ServiceName" -ForegroundColor White
Write-Host "  View logs:       Get-Content '$LogPath\worker-stdout.log' -Wait" -ForegroundColor White
Write-Host "  Uninstall:       .\uninstall-worker-service.ps1" -ForegroundColor White

