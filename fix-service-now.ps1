# Quick fix script for Nexrender Worker service
# Run as Administrator

Write-Host "Fixing Nexrender Worker service..." -ForegroundColor Green

# Stop the service
Write-Host "Stopping service..." -ForegroundColor Yellow
Stop-Service -Name NexrenderWorker -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Get current user
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host "Setting service to run as: $CurrentUser" -ForegroundColor Cyan

# Configure service to run as current user
C:\nssm\nssm.exe set NexrenderWorker ObjectName $CurrentUser

if ($LASTEXITCODE -eq 0) {
    Write-Host "Service configured successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Starting service..." -ForegroundColor Yellow
    Start-Service -Name NexrenderWorker
    Start-Sleep -Seconds 3
    
    $service = Get-Service -Name NexrenderWorker
    if ($service.Status -eq "Running") {
        Write-Host "Service is now running!" -ForegroundColor Green
    } else {
        Write-Host "Service status: $($service.Status)" -ForegroundColor Yellow
        Write-Host "Check logs at: C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\" -ForegroundColor Cyan
    }
} else {
    Write-Host "ERROR: Failed to configure service" -ForegroundColor Red
}

