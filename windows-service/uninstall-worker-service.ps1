# PowerShell script to uninstall Nexrender Worker Windows Service
# Run this script as Administrator

param(
    [string]$NSSMPath = "C:\nssm\nssm.exe",
    [string]$ServiceName = "NexrenderWorker"
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
    exit 0
}

Write-Host "Stopping service '$ServiceName'..." -ForegroundColor Yellow
Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue

Write-Host "Uninstalling service '$ServiceName'..." -ForegroundColor Yellow

# Check if NSSM exists
if (Test-Path $NSSMPath) {
    & $NSSMPath remove $ServiceName confirm
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Service uninstalled successfully!" -ForegroundColor Green
    } else {
        Write-Host "Failed to uninstall service using NSSM. Trying alternative method..." -ForegroundColor Yellow
        
        # Alternative: Use sc.exe
        sc.exe delete $ServiceName
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Service uninstalled successfully!" -ForegroundColor Green
        } else {
            Write-Host "ERROR: Failed to uninstall service" -ForegroundColor Red
            exit 1
        }
    }
} else {
    # Use sc.exe if NSSM not found
    sc.exe delete $ServiceName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Service uninstalled successfully!" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Failed to uninstall service" -ForegroundColor Red
        exit 1
    }
}

