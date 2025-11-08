# Running Nexrender Worker as Windows Service

This guide explains how to run the nexrender worker as a Windows service.

## Method 1: Using NSSM (Non-Sucking Service Manager) - RECOMMENDED

NSSM is the easiest and most reliable way to run Node.js applications as Windows services.

### Step 1: Download NSSM

1. Download NSSM from: https://nssm.cc/download
2. Extract the ZIP file
3. Copy the appropriate executable (32-bit or 64-bit) to a permanent location (e.g., `C:\nssm\`)

### Step 2: Install the Service

Open **PowerShell as Administrator** and run:

```powershell
# Navigate to NSSM directory
cd C:\nssm\

# Install the service
.\nssm.exe install NexrenderWorker "node" "C:\path\to\nexrender-worker\packages\nexrender-worker\src\bin.js --host=http://localhost:3000 --name=worker1 --max-concurrent-jobs=5"

# Or use the built binary
.\nssm.exe install NexrenderWorker "C:\path\to\nexrender-worker\bin\nexrender-worker-win64.exe" "--host=http://localhost:3000 --name=worker1 --max-concurrent-jobs=5"

# Set service description
.\nssm.exe set NexrenderWorker Description "Nexrender Worker - Processes After Effects rendering jobs"

# Set startup type (Automatic, Manual, or Disabled)
.\nssm.exe set NexrenderWorker Start SERVICE_AUTO_START

# Set service to restart on failure
.\nssm.exe set NexrenderWorker AppRestartDelay 5000
.\nssm.exe set NexrenderWorker AppExit Default Restart
```

### Step 3: Configure Service

Configure additional settings:

```powershell
# Set working directory
.\nssm.exe set NexrenderWorker AppDirectory "C:\path\to\nexrender-worker"

# Set environment variables
.\nssm.exe set NexrenderWorker AppEnvironmentExtra "NODE_ENV=production"

# Configure logging
.\nssm.exe set NexrenderWorker AppStdout "C:\path\to\nexrender-worker\logs\worker-stdout.log"
.\nssm.exe set NexrenderWorker AppStderr "C:\path\to\nexrender-worker\logs\worker-stderr.log"
```

### Step 4: Start the Service

```powershell
# Start the service
.\nssm.exe start NexrenderWorker

# Check service status
.\nssm.exe status NexrenderWorker

# View logs
type "C:\path\to\nexrender-worker\logs\worker-stdout.log"
```

### Step 5: Manage the Service

```powershell
# Stop the service
.\nssm.exe stop NexrenderWorker

# Restart the service
.\nssm.exe restart NexrenderWorker

# Uninstall the service
.\nssm.exe remove NexrenderWorker confirm
```

## Method 2: Using Windows Task Scheduler

### Step 1: Open Task Scheduler

1. Press `Win + R`, type `taskschd.msc`, and press Enter
2. Click "Create Basic Task" in the right pane

### Step 2: Configure the Task

1. **General Tab:**
   - Name: `NexrenderWorker`
   - Description: `Nexrender Worker Service`
   - Check "Run whether user is logged on or not"
   - Check "Run with highest privileges"

2. **Triggers Tab:**
   - Click "New"
   - Begin the task: "At startup"
   - Click OK

3. **Actions Tab:**
   - Click "New"
   - Action: "Start a program"
   - Program/script: `C:\path\to\node.exe` or `C:\path\to\nexrender-worker-win64.exe`
   - Add arguments: `--host=http://localhost:3000 --name=worker1 --max-concurrent-jobs=5`
   - Start in: `C:\path\to\nexrender-worker`

4. **Conditions Tab:**
   - Uncheck "Start the task only if the computer is on AC power"

5. **Settings Tab:**
   - Check "Allow task to be run on demand"
   - Check "If the running task does not end when requested, force it to stop"
   - Configure "If the task fails, restart every: 1 minute"

## Method 3: Using node-windows Package

### Step 1: Install node-windows

```bash
npm install -g node-windows
```

### Step 2: Create Service Script

Create a file `install-service.js`:

```javascript
const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'NexrenderWorker',
  description: 'Nexrender Worker - Processes After Effects rendering jobs',
  script: path.join(__dirname, 'packages', 'nexrender-worker', 'src', 'bin.js'),
  nodeOptions: [
    '--host=http://localhost:3000',
    '--name=worker1',
    '--max-concurrent-jobs=5'
  ]
});

// Listen for the "install" event
svc.on('install', () => {
  console.log('Service installed successfully');
  svc.start();
});

svc.on('start', () => {
  console.log('Service started');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

// Install the service
svc.install();
```

### Step 3: Run as Administrator

```bash
# Run as Administrator
node install-service.js
```

### Step 4: Uninstall

```javascript
const Service = require('node-windows').Service;
const svc = new Service({
  name: 'NexrenderWorker'
});

svc.on('uninstall', () => {
  console.log('Service uninstalled');
});

svc.uninstall();
```

## Method 4: Using WinSW (Windows Service Wrapper)

### Step 1: Download WinSW

Download from: https://github.com/winsw/winsw/releases

### Step 2: Create Service Configuration

Create `nexrender-worker.xml`:

```xml
<service>
  <id>NexrenderWorker</id>
  <name>Nexrender Worker</name>
  <description>Nexrender Worker - Processes After Effects rendering jobs</description>
  <executable>node</executable>
  <arguments>packages\nexrender-worker\src\bin.js --host=http://localhost:3000 --name=worker1 --max-concurrent-jobs=5</arguments>
  <workingdirectory>C:\path\to\nexrender-worker</workingdirectory>
  <logpath>C:\path\to\nexrender-worker\logs</logpath>
  <logmode>rotate</logmode>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="5 sec"/>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="reboot"/>
</service>
```

### Step 3: Install

```powershell
# Rename winsw.exe to nexrender-worker.exe
# Run as Administrator
.\nexrender-worker.exe install
.\nexrender-worker.exe start
```

## Recommended Configuration

For production use with the binary:

```powershell
# Using NSSM with the built binary
.\nssm.exe install NexrenderWorker "C:\path\to\nexrender-worker\bin\nexrender-worker-win64.exe" "--host=http://localhost:3000 --secret=myapisecret --name=worker1 --max-concurrent-jobs=5 --status-service --status-port=3100"

# Set restart on failure
.\nssm.exe set NexrenderWorker AppExit Default Restart

# Set logging
.\nssm.exe set NexrenderWorker AppStdout "C:\nexrender\logs\worker-stdout.log"
.\nssm.exe set NexrenderWorker AppStderr "C:\nexrender\logs\worker-stderr.log"
```

## Managing the Service

You can also use Windows Services Manager:

1. Press `Win + R`, type `services.msc`, and press Enter
2. Find "NexrenderWorker" service
3. Right-click to Start, Stop, Restart, or view Properties

## Troubleshooting

1. **Service won't start:**
   - Check logs in the configured log directory
   - Verify the path to Node.js or the binary
   - Check Windows Event Viewer for errors

2. **Service stops unexpectedly:**
   - Configure automatic restart (NSSM AppExit Default Restart)
   - Check logs for errors
   - Verify network connectivity to nexrender server

3. **Permissions issues:**
   - Ensure service runs with appropriate user account
   - Check file/folder permissions

4. **After Effects not found:**
   - Ensure Adobe After Effects is installed
   - Run the worker once manually to install the patch (requires admin)

