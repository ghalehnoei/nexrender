# Manual Fix for After Effects with SYSTEM Account

If the automated script is not working, follow these manual steps to configure After Effects for SYSTEM account.

## Step 1: Create SYSTEM Profile Directories

Open **PowerShell as Administrator** and run:

```powershell
# Create SYSTEM profile directories
$SystemProfile = "C:\Windows\System32\config\systemprofile"
$SystemDocuments = Join-Path $SystemProfile "Documents"
$SystemAdobe = Join-Path $SystemDocuments "Adobe"
$SystemAppData = Join-Path $SystemProfile "AppData"
$SystemAppDataLocal = Join-Path $SystemAppData "Local"
$SystemAppDataRoaming = Join-Path $SystemAppData "Roaming"

# Create directories
New-Item -ItemType Directory -Path $SystemDocuments -Force
New-Item -ItemType Directory -Path $SystemAdobe -Force
New-Item -ItemType Directory -Path $SystemAppData -Force
New-Item -ItemType Directory -Path $SystemAppDataLocal -Force
New-Item -ItemType Directory -Path $SystemAppDataRoaming -Force
```

## Step 2: Set Permissions (Optional but Recommended)

Grant SYSTEM account full control to its profile:

```powershell
$SystemProfile = "C:\Windows\System32\config\systemprofile"
$acl = Get-Acl $SystemProfile
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
$acl.SetAccessRule($accessRule)
Set-Acl -Path $SystemProfile -AclObject $acl
```

## Step 3: Copy After Effects Preferences (Optional)

If you have After Effects configured for a user account and want to copy those settings:

```powershell
# Replace "username" with your actual username
$SourceUser = "username"
$SourceUserProfile = "C:\Users\$SourceUser"
$SourceAppDataLocal = Join-Path $SourceUserProfile "AppData\Local"
$SourceAppDataRoaming = Join-Path $SourceUserProfile "AppData\Roaming"

$SystemAppDataLocal = "C:\Windows\System32\config\systemprofile\AppData\Local"
$SystemAppDataRoaming = "C:\Windows\System32\config\systemprofile\AppData\Roaming"

# Copy local preferences
$AEPrefsLocal = Join-Path $SourceAppDataLocal "Adobe\After Effects"
$TargetAEPrefsLocal = Join-Path $SystemAppDataLocal "Adobe\After Effects"
if (Test-Path $AEPrefsLocal) {
    if (Test-Path $TargetAEPrefsLocal) {
        Remove-Item -Path $TargetAEPrefsLocal -Recurse -Force
    }
    Copy-Item -Path $AEPrefsLocal -Destination $TargetAEPrefsLocal -Recurse -Force
}

# Copy roaming preferences
$AEPrefsRoaming = Join-Path $SourceAppDataRoaming "Adobe\After Effects"
$TargetAEPrefsRoaming = Join-Path $SystemAppDataRoaming "Adobe\After Effects"
if (Test-Path $AEPrefsRoaming) {
    if (Test-Path $TargetAEPrefsRoaming) {
        Remove-Item -Path $TargetAEPrefsRoaming -Recurse -Force
    }
    Copy-Item -Path $AEPrefsRoaming -Destination $TargetAEPrefsRoaming -Recurse -Force
}
```

## Step 4: Install Nexrender Patch

The Nexrender patch must be installed once. Run the worker manually with admin privileges:

```powershell
# Stop the service temporarily
Stop-Service -Name NexrenderWorker

# Run worker manually once (this installs the patch)
cd "C:\Users\ghalenoei.m\Documents\Nexrender-worker"
.\bin\nexrender-worker-win64.exe --host=http://localhost:3000 --name=worker1 --concurrency=1

# After you see the patch installation message, press Ctrl+C
# Then restart the service
Start-Service -Name NexrenderWorker
```

## Step 5: Verify Configuration

Check that everything is in place:

```powershell
# Check directories
Test-Path "C:\Windows\System32\config\systemprofile\Documents"
Test-Path "C:\Windows\System32\config\systemprofile\AppData\Local"
Test-Path "C:\Windows\System32\config\systemprofile\AppData\Roaming"

# Check service account
C:\nssm\nssm.exe get NexrenderWorker ObjectName
# Should return: LocalSystem
```

## Complete Manual Command Sequence

Here's everything in one sequence you can copy and paste (run as Administrator):

```powershell
# Step 1: Create directories
$SystemProfile = "C:\Windows\System32\config\systemprofile"
$SystemDocuments = Join-Path $SystemProfile "Documents"
$SystemAdobe = Join-Path $SystemDocuments "Adobe"
$SystemAppData = Join-Path $SystemProfile "AppData"
$SystemAppDataLocal = Join-Path $SystemAppData "Local"
$SystemAppDataRoaming = Join-Path $SystemAppData "Roaming"

New-Item -ItemType Directory -Path $SystemDocuments -Force | Out-Null
New-Item -ItemType Directory -Path $SystemAdobe -Force | Out-Null
New-Item -ItemType Directory -Path $SystemAppData -Force | Out-Null
New-Item -ItemType Directory -Path $SystemAppDataLocal -Force | Out-Null
New-Item -ItemType Directory -Path $SystemAppDataRoaming -Force | Out-Null

Write-Host "Directories created" -ForegroundColor Green

# Step 2: Set permissions
try {
    $acl = Get-Acl $SystemProfile
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $SystemProfile -AclObject $acl
    Write-Host "Permissions set" -ForegroundColor Green
} catch {
    Write-Host "Could not set permissions: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Configuration complete!" -ForegroundColor Green
Write-Host "Next: Install the Nexrender patch by running the worker manually once" -ForegroundColor Yellow
```

## Troubleshooting

### After Effects Still Can't Find Settings
- Copy preferences from a working user account (Step 4)
- Ensure AppData directories exist
- Check Windows Event Viewer for detailed errors

### Patch Not Installing
- Run worker manually with admin privileges
- Check that After Effects is installed
- Verify path to After Effects is correct

### Service Won't Start
- Check logs: `Get-Content "C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\worker-stderr.log"`
- Verify service is configured as SYSTEM: `C:\nssm\nssm.exe get NexrenderWorker ObjectName`
- Ensure all directories and files were created successfully

## Alternative: Use User Account Instead

If SYSTEM account continues to cause issues, consider using a dedicated user account:

```powershell
# Set service to run as current user
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
C:\nssm\nssm.exe set NexrenderWorker ObjectName $CurrentUser

# Or use a dedicated service account
C:\nssm\nssm.exe set NexrenderWorker ObjectName "DOMAIN\ServiceAccount"
```

This avoids SYSTEM profile issues entirely.


