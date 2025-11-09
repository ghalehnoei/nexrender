# Windows Service Installation Guide

This folder contains all scripts and documentation for installing and managing the Nexrender Worker as a Windows service.

## Quick Start

1. **Download NSSM** from https://nssm.cc/download and extract to `C:\nssm\`
2. **Navigate to this folder** and run the installation script (as Administrator):
   ```powershell
   cd windows-service
   .\install-service-quick.ps1 -ServerHost "http://localhost:3000" -WorkerName "worker1"
   ```

## Documentation

### Installation Guides
- **[INSTALL-SERVICE.md](INSTALL-SERVICE.md)** - Complete installation guide using provided scripts (recommended for most users)
- **[SERVICE-REQUIREMENTS.md](SERVICE-REQUIREMENTS.md)** - Quick start checklist and prerequisites
- **[windows-service-guide.md](windows-service-guide.md)** - Comprehensive guide with multiple installation methods (NSSM, Task Scheduler, node-windows, WinSW)

### SYSTEM Account Configuration
- **[SYSTEM-ACCOUNT-GUIDE.md](SYSTEM-ACCOUNT-GUIDE.md)** - Guide for running service as SYSTEM account
- **[AFTER-EFFECTS-SYSTEM-ACCOUNT-FIX.md](AFTER-EFFECTS-SYSTEM-ACCOUNT-FIX.md)** - Fixing After Effects issues with SYSTEM account
- **[MANUAL-FIX-SYSTEM-ACCOUNT.md](MANUAL-FIX-SYSTEM-ACCOUNT.md)** - Manual steps for SYSTEM account configuration

## Scripts

### Installation Scripts
- **install-service-quick.ps1** - Quick installation script (recommended for most users)
- **install-worker-service.ps1** - Full-featured installation script with all options
- **install-worker-service-system.ps1** - Installation script configured for SYSTEM account

### Maintenance Scripts
- **fix-service-user.ps1** - Fix service to run as current user account
- **fix-after-effects-system-account.ps1** - Fix After Effects configuration for SYSTEM account
- **uninstall-worker-service.ps1** - Uninstall the service

## Installation Methods

### Method 1: Quick Installation (Recommended)
```powershell
cd windows-service
.\install-service-quick.ps1 -ServerHost "http://localhost:3000" -WorkerName "worker1"
```

### Method 2: Full Installation
```powershell
cd windows-service
.\install-worker-service.ps1 `
    -UseBinary `
    -BinaryPath "..\bin\nexrender-worker-win64.exe" `
    -ServerHost "http://localhost:3000" `
    -WorkerName "worker1" `
    -MaxConcurrentJobs 5
```

### Method 3: SYSTEM Account Installation
```powershell
cd windows-service
.\install-worker-service-system.ps1 `
    -UseBinary `
    -BinaryPath "..\bin\nexrender-worker-win64.exe" `
    -ServerHost "http://localhost:3000" `
    -WorkerName "worker1"
```

## Service Management

### Start/Stop Service
```powershell
Start-Service -Name NexrenderWorker
Stop-Service -Name NexrenderWorker
Restart-Service -Name NexrenderWorker
```

### Check Service Status
```powershell
Get-Service -Name NexrenderWorker
```

### View Logs
```powershell
Get-Content "..\logs\worker-stdout.log" -Tail 50 -Wait
```

**Note:** All paths in scripts are relative to the project root. When running scripts from the `windows-service` folder, use `..\` to reference parent directory files.

## Troubleshooting

### Service Won't Start
- Check logs in `..\logs\` folder
- Verify server URL is correct and accessible
- Check Windows Event Viewer for errors
- Ensure After Effects is installed

### After Effects Issues with SYSTEM Account
- Run `.\fix-after-effects-system-account.ps1` to configure After Effects
- See [AFTER-EFFECTS-SYSTEM-ACCOUNT-FIX.md](AFTER-EFFECTS-SYSTEM-ACCOUNT-FIX.md) for detailed troubleshooting

### Change Service Account
- To user account: `.\fix-service-user.ps1`
- To SYSTEM account: Use NSSM directly or reinstall with `install-worker-service-system.ps1`

## Uninstallation

```powershell
.\uninstall-worker-service.ps1
```

Or manually:
```powershell
Stop-Service -Name NexrenderWorker
C:\nssm\nssm.exe remove NexrenderWorker confirm
```

