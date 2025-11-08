# Fix existing Nexrender Worker service to run as current user
# Run this script as Administrator

param(
    [string]$ServiceName = "NexrenderWorker",
    [string]$NSSMPath = "C:\nssm\nssm.exe"
)

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

# Check if service exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $existingService) {
    Write-Host "Service '$ServiceName' does not exist" -ForegroundColor Yellow
    exit 1
}

Write-Host "Fixing service '$ServiceName' to run as current user..." -ForegroundColor Green

# Stop the service if it's running
if ($existingService.Status -eq "Running") {
    Write-Host "Stopping service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
}

# Configure service to run as current user
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host "Setting service to run as: $CurrentUser" -ForegroundColor Cyan

if (Test-Path $NSSMPath) {
    & $NSSMPath set $ServiceName ObjectName $CurrentUser
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Service configured successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "You can now start the service with:" -ForegroundColor Yellow
        Write-Host "  Start-Service -Name $ServiceName" -ForegroundColor Cyan
    } else {
        Write-Host "ERROR: Failed to configure service" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "ERROR: NSSM not found at $NSSMPath" -ForegroundColor Red
    Write-Host "Please specify the correct path using -NSSMPath parameter" -ForegroundColor Yellow
    exit 1
}

