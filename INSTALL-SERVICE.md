# Installing Nexrender Worker as Windows Service

## Prerequisites

1. **NSSM (Non-Sucking Service Manager)** - Required for service installation
   - Download from: https://nssm.cc/download
   - Extract the ZIP file
   - Copy `nssm.exe` (64-bit version) to `C:\nssm\` (or any location you prefer)

2. **Built Worker Binary** - Already available at:
   - `C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe`

3. **Administrator Rights** - Required to install Windows services

## Quick Installation (Using Provided Script)

### Step 1: Download and Setup NSSM

1. Download NSSM from: https://nssm.cc/download
2. Extract the ZIP file
3. Copy `win64\nssm.exe` to `C:\nssm\nssm.exe` (create the folder if it doesn't exist)

### Step 2: Run Installation Script

Open **PowerShell as Administrator** and run:

```powershell
cd "C:\Users\ghalenoei.m\Documents\Nexrender-worker"

# Basic installation with default settings
.\install-worker-service.ps1 -UseBinary -BinaryPath "C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe" -Host "http://localhost:3000" -WorkerName "worker1"
```

### Step 3: Configure (Optional Parameters)

For production use with custom settings:

```powershell
.\install-worker-service.ps1 `
    -UseBinary `
    -BinaryPath "C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe" `
    -Host "http://your-server:3000" `
    -Secret "your-api-secret" `
    -WorkerName "production-worker" `
    -MaxConcurrentJobs 10 `
    -StatusPort 3100 `
    -ServiceName "NexrenderWorker"
```

### Step 4: Start the Service

```powershell
Start-Service -Name NexrenderWorker
```

## Manual Installation (Using NSSM Directly)

If you prefer to install manually:

```powershell
# Navigate to NSSM directory
cd C:\nssm

# Install the service
.\nssm.exe install NexrenderWorker "C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe" "--host=http://localhost:3000 --name=worker1 --max-concurrent-jobs=5 --status-service --status-port=3100"

# Set service description
.\nssm.exe set NexrenderWorker Description "Nexrender Worker - Processes After Effects rendering jobs"

# Set startup type to Automatic
.\nssm.exe set NexrenderWorker Start SERVICE_AUTO_START

# Set restart on failure
.\nssm.exe set NexrenderWorker AppRestartDelay 5000
.\nssm.exe set NexrenderWorker AppExit Default Restart

# Set working directory
.\nssm.exe set NexrenderWorker AppDirectory "C:\Users\ghalenoei.m\Documents\Nexrender-worker"

# Configure logging
.\nssm.exe set NexrenderWorker AppStdout "C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\worker-stdout.log"
.\nssm.exe set NexrenderWorker AppStderr "C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\worker-stderr.log"

# Start the service
.\nssm.exe start NexrenderWorker
```

## Configuration Parameters

### Required Parameters:
- `--host`: Nexrender server URL (e.g., `http://localhost:3000`)
- `--name`: Worker name identifier

### Optional Parameters:
- `--secret`: API secret for authentication
- `--max-concurrent-jobs`: Maximum concurrent rendering jobs (default: 5)
- `--status-service`: Enable status service
- `--status-port`: Port for status service (default: 3100)
- `--workpath`: Working directory for jobs
- `--binary`: Path to After Effects renderer binary
- `--cache`: Enable caching
- `--cache-path`: Path for cache storage
- `--debug`: Enable debug logging

## Managing the Service

### Using PowerShell:
```powershell
# Start service
Start-Service -Name NexrenderWorker

# Stop service
Stop-Service -Name NexrenderWorker

# Restart service
Restart-Service -Name NexrenderWorker

# Check status
Get-Service -Name NexrenderWorker

# View logs
Get-Content "C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\worker-stdout.log" -Wait
```

### Using NSSM:
```powershell
cd C:\nssm

# Start
.\nssm.exe start NexrenderWorker

# Stop
.\nssm.exe stop NexrenderWorker

# Restart
.\nssm.exe restart NexrenderWorker

# Status
.\nssm.exe status NexrenderWorker
```

### Using Windows Services Manager:
1. Press `Win + R`, type `services.msc`, press Enter
2. Find "NexrenderWorker" service
3. Right-click to Start, Stop, Restart, or view Properties

## Uninstalling the Service

### Using the provided script:
```powershell
.\uninstall-worker-service.ps1
```

### Using NSSM:
```powershell
cd C:\nssm
.\nssm.exe stop NexrenderWorker
.\nssm.exe remove NexrenderWorker confirm
```

## Troubleshooting

1. **Service won't start:**
   - Check logs: `C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\worker-stderr.log`
   - Verify the server URL is accessible
   - Check Windows Event Viewer for errors

2. **Service stops unexpectedly:**
   - Check logs for errors
   - Verify After Effects is installed
   - Ensure sufficient disk space and memory

3. **Can't connect to server:**
   - Verify `--host` parameter is correct
   - Check firewall settings
   - Verify server is running

4. **Permission issues:**
   - Ensure service runs with appropriate user account
   - Check file/folder permissions
   - Run installation script as Administrator

## Example Production Configuration

```powershell
.\install-worker-service.ps1 `
    -UseBinary `
    -BinaryPath "C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe" `
    -Host "http://nexrender-server.company.com:3000" `
    -Secret "your-secure-api-secret-here" `
    -WorkerName "worker-prod-01" `
    -MaxConcurrentJobs 8 `
    -StatusPort 3100 `
    -ServiceName "NexrenderWorkerProd"
```

