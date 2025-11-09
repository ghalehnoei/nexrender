# Windows Service Installation - Requirements Checklist

## ✅ What You Already Have

1. ✅ **Nexrender Worker Binary**
   - Location: `C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe`
   - Status: ✅ Built and ready

2. ✅ **Installation Scripts**
   - `install-worker-service.ps1` - Full featured installation script
   - `install-service-quick.ps1` - Quick installation script (new)
   - `uninstall-worker-service.ps1` - Uninstallation script

## 📥 What You Need to Download

### 1. NSSM (Non-Sucking Service Manager) - REQUIRED

**Download Link:** https://nssm.cc/download

**Steps:**
1. Download the latest release (ZIP file)
2. Extract the ZIP file
3. Copy `win64\nssm.exe` to `C:\nssm\nssm.exe`
   - Create the `C:\nssm\` folder if it doesn't exist

**Alternative:** You can place `nssm.exe` in any location and specify the path when running the installation script.

## 🔧 Configuration Information Needed

Before installing, you'll need to know:

1. **Nexrender Server URL**
   - Example: `http://localhost:3000`
   - Or: `http://your-server-ip:3000`
   - Or: `http://nexrender.company.com:3000`

2. **API Secret** (if your server requires authentication)
   - Check your nexrender server configuration
   - Optional if server doesn't require authentication

3. **Worker Name**
   - A unique identifier for this worker
   - Example: `worker1`, `production-worker-01`, etc.

4. **Max Concurrent Jobs** (optional, default: 5)
   - How many rendering jobs to process simultaneously
   - Recommended: 1-10 depending on your system

5. **Status Port** (optional, default: 3100)
   - Port for the worker status service
   - Must be available and not in use

## 🚀 Quick Start Installation

### Option 1: Using Quick Installation Script (Recommended)

1. **Download NSSM** (see above)

2. **Open PowerShell as Administrator**
   - Right-click PowerShell → "Run as Administrator"

3. **Run the installation script:**
   ```powershell
   cd "C:\Users\ghalenoei.m\Documents\Nexrender-worker"
   .\install-service-quick.ps1 -ServerHost "http://localhost:3000" -WorkerName "worker1"
   ```

4. **For production with secret:**
   ```powershell
   .\install-service-quick.ps1 `
       -ServerHost "http://your-server:3000" `
       -Secret "your-api-secret" `
       -WorkerName "production-worker" `
       -MaxConcurrentJobs 8
   ```

### Option 2: Using Full Installation Script

```powershell
cd "C:\Users\ghalenoei.m\Documents\Nexrender-worker"

.\install-worker-service.ps1 `
    -UseBinary `
    -BinaryPath "C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe" `
    -ServerHost "http://localhost:3000" `
    -WorkerName "worker1" `
    -MaxConcurrentJobs 5 `
    -StatusPort 3100
```

## 📋 Pre-Installation Checklist

- [ ] NSSM downloaded and extracted
- [ ] `nssm.exe` copied to `C:\nssm\` (or known location)
- [ ] Nexrender server URL known
- [ ] API secret (if required) available
- [ ] Worker name decided
- [ ] PowerShell opened as Administrator
- [ ] After Effects installed (required for rendering)
- [ ] Sufficient disk space available

## 🔍 Verification Steps

After installation:

1. **Check service status:**
   ```powershell
   Get-Service -Name NexrenderWorker
   ```

2. **View logs:**
   ```powershell
   Get-Content "C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\worker-stdout.log" -Tail 50
   ```

3. **Check Windows Services:**
   - Press `Win + R`
   - Type `services.msc`
   - Find "NexrenderWorker" service
   - Verify it's running

## 🆘 Troubleshooting

### NSSM Not Found
- Ensure NSSM is downloaded and extracted
- Verify path: `C:\nssm\nssm.exe`
- Or specify custom path: `-NSSMPath "C:\path\to\nssm.exe"`

### Service Won't Start
- Check logs in `logs\` folder
- Verify server URL is correct and accessible
- Check Windows Event Viewer for errors

### Permission Denied
- Ensure PowerShell is running as Administrator
- Right-click PowerShell → "Run as Administrator"

### After Effects Not Found
- Ensure Adobe After Effects is installed
- Worker needs After Effects to render jobs

## 📚 Additional Resources

- Full installation guide: `INSTALL-SERVICE.md`
- Windows service guide: `windows-service-guide.md`
- Uninstall script: `uninstall-worker-service.ps1`

