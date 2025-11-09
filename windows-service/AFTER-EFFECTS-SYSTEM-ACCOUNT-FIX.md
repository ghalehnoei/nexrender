# Fixing After Effects Issues with SYSTEM Account

## Overview

When running the Nexrender Worker service as SYSTEM (LocalSystem) account, After Effects may encounter several issues due to the different profile paths and permissions. This guide provides solutions for these problems.

## Common Issues

### 1. User Preferences Not Found
After Effects stores user preferences in AppData folders, which SYSTEM account doesn't have by default.

**Locations:**
- Local: `C:\Users\<username>\AppData\Local\Adobe\After Effects`
- Roaming: `C:\Users\<username>\AppData\Roaming\Adobe\After Effects`

### 2. Font Installation Issues
Fonts installed to user directories may not be visible to After Effects when running as SYSTEM.

### 3. Missing Profile Directories
SYSTEM account profile may not have all necessary directories created.

## Solution: Automated Fix Script

A PowerShell script is provided to automatically fix these issues:

```powershell
# Run as Administrator
.\fix-after-effects-system-account.ps1
```

### Basic Usage

```powershell
# Fix basic configuration (creates directories)
.\fix-after-effects-system-account.ps1
```

### Advanced Usage

```powershell
# Fix configuration and copy preferences from a user account
.\fix-after-effects-system-account.ps1 -CopyPreferences -SourceUser "username"

# Specify After Effects installation path
.\fix-after-effects-system-account.ps1 -AfterEffectsPath "C:\Program Files\Adobe\After Effects 2024\Support Files"

```

## Manual Fix Steps

If you prefer to fix issues manually:

### Step 1: Create SYSTEM Profile Directories

```powershell
# Run as Administrator
$SystemProfile = "C:\Windows\System32\config\systemprofile"
$SystemDocuments = Join-Path $SystemProfile "Documents"
$SystemAdobe = Join-Path $SystemDocuments "Adobe"
$SystemAppData = Join-Path $SystemProfile "AppData"
$SystemAppDataLocal = Join-Path $SystemAppData "Local"
$SystemAppDataRoaming = Join-Path $SystemAppData "Roaming"

New-Item -ItemType Directory -Path $SystemDocuments -Force
New-Item -ItemType Directory -Path $SystemAdobe -Force
New-Item -ItemType Directory -Path $SystemAppData -Force
New-Item -ItemType Directory -Path $SystemAppDataLocal -Force
New-Item -ItemType Directory -Path $SystemAppDataRoaming -Force
```

### Step 2: Copy After Effects Preferences (Optional)

If you have a working user account with After Effects configured:

```powershell
$SourceUser = "username"  # Replace with actual username
$SourceUserProfile = "C:\Users\$SourceUser"
$SourceAppDataLocal = Join-Path $SourceUserProfile "AppData\Local"
$SourceAppDataRoaming = Join-Path $SourceUserProfile "AppData\Roaming"

$SystemAppDataLocal = "C:\Windows\System32\config\systemprofile\AppData\Local"
$SystemAppDataRoaming = "C:\Windows\System32\config\systemprofile\AppData\Roaming"

# Copy local preferences
$AEPrefsLocal = Join-Path $SourceAppDataLocal "Adobe\After Effects"
$TargetAEPrefsLocal = Join-Path $SystemAppDataLocal "Adobe\After Effects"
if (Test-Path $AEPrefsLocal) {
    Copy-Item -Path $AEPrefsLocal -Destination $TargetAEPrefsLocal -Recurse -Force
}

# Copy roaming preferences
$AEPrefsRoaming = Join-Path $SourceAppDataRoaming "Adobe\After Effects"
$TargetAEPrefsRoaming = Join-Path $SystemAppDataRoaming "Adobe\After Effects"
if (Test-Path $AEPrefsRoaming) {
    Copy-Item -Path $AEPrefsRoaming -Destination $TargetAEPrefsRoaming -Recurse -Force
}
```

### Step 4: Install After Effects Patch

The Nexrender patch must be installed once. Run the worker manually with admin privileges:

```powershell
# Stop the service temporarily
Stop-Service -Name NexrenderWorker

# Run worker manually once (this will install the patch)
cd "C:\Users\ghalenoei.m\Documents\Nexrender-worker"
.\bin\nexrender-worker-win64.exe --host=http://localhost:3000 --name=worker1 --concurrency=1

# After patch is installed, press Ctrl+C and restart the service
Start-Service -Name NexrenderWorker
```

## Font Installation Considerations

The `nexrender-action-fonts` package already handles SYSTEM account by:

1. Installing fonts to system directory (`C:\Windows\Fonts`)
2. Registering fonts in system registry (HKLM)
3. Installing to user directory as fallback

However, when running as SYSTEM account:
- Fonts installed to system directory will be available
- Fonts installed to user directory may not be visible to After Effects
- Ensure the service has write permissions to `C:\Windows\Fonts`

## Verification

After applying fixes, verify the configuration:

### 1. Check Profile Directories

```powershell
Test-Path "C:\Windows\System32\config\systemprofile\Documents"
Test-Path "C:\Windows\System32\config\systemprofile\AppData\Local"
Test-Path "C:\Windows\System32\config\systemprofile\AppData\Roaming"
```

All should return `True`.

### 2. Check Service Account

```powershell
# Using NSSM
C:\nssm\nssm.exe get NexrenderWorker ObjectName

# Should return: LocalSystem
```

### 3. Test Rendering

Submit a test job to the worker and check logs:

```powershell
Get-Content "C:\Users\ghalenoei.m\Documents\Nexrender-worker\logs\worker-stdout.log" -Tail 50
```

## Troubleshooting

### Issue: After Effects Preferences Not Loading

**Solution:**
1. Copy preferences from a working user account
2. Ensure AppData directories exist in SYSTEM profile
3. Check that preferences files have correct permissions

### Issue: Fonts Not Available

**Solution:**
1. Ensure fonts are installed to system directory (`C:\Windows\Fonts`)
2. Verify fonts are registered in system registry (HKLM)
3. Check that After Effects can access system fonts directory

### Issue: Patch Not Installed

**Solution:**
1. Run worker manually once with admin privileges
2. The patch will be installed automatically
3. Verify patch by checking `commandLineRenderer.jsx` for "nexrender-patch" string

### Issue: Permission Denied Errors

**Solution:**
1. Ensure script is run as Administrator
2. Grant SYSTEM account full control to its profile directories
3. Check Windows Event Viewer for detailed error messages

## Best Practices

1. **Run the fix script before starting the service** - This ensures all directories and files are in place
2. **Copy preferences from a working account** - If you have After Effects configured for a user account, copy those preferences
3. **Test with a simple job first** - Verify everything works before processing production jobs
4. **Monitor logs regularly** - Check for any After Effects errors in worker logs
5. **Keep patch up to date** - If you update After Effects, you may need to reinstall the patch

## Alternative: Use User Account Instead

If you continue to experience issues with SYSTEM account, consider using a dedicated user account instead:

```powershell
# Create a dedicated service account (optional)
$ServiceUser = ".\NexrenderService"  # Local account
# Or use domain account: "DOMAIN\ServiceAccount"

# Configure service to run as that account
C:\nssm\nssm.exe set NexrenderWorker ObjectName $ServiceUser
```

This approach:
- ✅ Avoids SYSTEM profile issues
- ✅ Provides better isolation
- ✅ Easier to manage permissions
- ⚠️ Requires password management
- ⚠️ Account must be logged in or have "Log on as a service" right

## Summary

The main issues with SYSTEM account and After Effects are:

1. **Missing profile directories** - Fixed by creating them
2. **Missing preferences** - Fixed by copying from user account (optional)
3. **Patch installation** - Requires running worker once with admin privileges

Use the provided `fix-after-effects-system-account.ps1` script to automate these fixes.


