# Running Nexrender Worker as SYSTEM Account

## Overview

Yes, it is **technically possible** to run the Nexrender Worker service as the SYSTEM (LocalSystem) account. However, there are important considerations and potential issues to be aware of.

## How to Configure as SYSTEM Account

### Option 1: Using the Provided Script

A script is provided specifically for SYSTEM account installation:

```powershell
# Run as Administrator
.\install-worker-service-system.ps1 `
    -UseBinary `
    -BinaryPath "C:\Users\ghalenoei.m\Documents\Nexrender-worker\bin\nexrender-worker-win64.exe" `
    -ServerHost "http://localhost:3000" `
    -WorkerName "worker1" `
    -MaxConcurrentJobs 5
```

### Option 2: Manual Configuration with NSSM

If you already have the service installed, you can change it to run as SYSTEM:

```powershell
# Stop the service first
Stop-Service -Name NexrenderWorker

# Set to run as SYSTEM (LocalSystem)
C:\nssm\nssm.exe set NexrenderWorker ObjectName "LocalSystem"

# Start the service
Start-Service -Name NexrenderWorker
```

### Option 3: During Initial Installation

When installing with NSSM, you can specify SYSTEM account:

```powershell
# Install service
C:\nssm\nssm.exe install NexrenderWorker "C:\path\to\nexrender-worker-win64.exe" "--host=http://localhost:3000 --name=worker1"

# Set to run as SYSTEM
C:\nssm\nssm.exe set NexrenderWorker ObjectName "LocalSystem"
```

## Important Considerations

### ✅ Advantages of SYSTEM Account

1. **No Password Management**: SYSTEM account doesn't require password configuration
2. **Highest Privileges**: Full system access for administrative operations
3. **Survives User Logout**: Service continues running even when no user is logged in
4. **System-Wide Font Installation**: Fonts installed to system directory are available to all users

### ⚠️ Potential Issues with SYSTEM Account

1. **Profile Path Differences**
   - SYSTEM account uses: `C:\Windows\System32\config\systemprofile`
   - User account uses: `C:\Users\<username>\AppData\Local`
   - This can affect font installation, temp files, and user-specific settings

2. **After Effects User Preferences**
   - After Effects may not find user-specific preferences
   - Some settings might default to system-wide configuration

3. **Font Installation**
   - The font action (`nexrender-action-fonts`) tries to handle this by:
     - Installing to system fonts directory (`C:\Windows\Fonts`)
     - Registering in system registry (HKLM)
   - However, user-specific font paths may not work correctly

4. **Network Drive Access**
   - SYSTEM account may have different network drive mappings
   - UNC paths should work, but mapped drives may not

5. **File Permissions**
   - Files created by SYSTEM account may have different ownership
   - May require additional permissions configuration

6. **Environment Variables**
   - SYSTEM account has different environment variables
   - User-specific paths (like `%USERPROFILE%`) won't resolve correctly

## Current Default Configuration

The default installation scripts configure the service to run as the **current user account** to avoid these SYSTEM profile issues. This is generally recommended because:

- After Effects works better with user profiles
- Font installation to user directories works correctly
- User preferences and settings are accessible
- Network drives mapped to the user account are available

## When to Use SYSTEM Account

Consider using SYSTEM account if:

- You need the service to run regardless of user login status
- You want system-wide font installation
- You're running in a server environment without interactive users
- You need maximum system privileges for certain operations

## Troubleshooting SYSTEM Account Issues

### Quick Fix: Use the Automated Script

**Recommended**: Run the automated fix script to resolve most After Effects issues:

```powershell
# Run as Administrator
.\fix-after-effects-system-account.ps1
```

This script will:
- Create necessary SYSTEM profile directories
- Optionally copy preferences from a user account
- Set proper permissions

See `AFTER-EFFECTS-SYSTEM-ACCOUNT-FIX.md` for detailed information.

### Issue: Fonts Not Available to After Effects

**Solution**: The font action already tries to install to system fonts directory. Ensure the service has write permissions to `C:\Windows\Fonts` and registry access to `HKLM\Software\Microsoft\Windows NT\CurrentVersion\Fonts`.

### Issue: After Effects Can't Find Preferences

**Solution**: 
1. Run `.\fix-after-effects-system-account.ps1 -CopyPreferences -SourceUser "username"` to copy preferences from a working user account
2. Or manually copy preferences to `C:\Windows\System32\config\systemprofile\AppData\Local\Adobe\After Effects` and `C:\Windows\System32\config\systemprofile\AppData\Roaming\Adobe\After Effects`

### Issue: Network Drives Not Accessible

**Solution**: Use UNC paths (`\\server\share`) instead of mapped drive letters, as SYSTEM account doesn't have user drive mappings.

### Issue: Temp Files in Wrong Location

**Solution**: Explicitly set the `--workpath` parameter to a location accessible by SYSTEM account, such as `C:\nexrender\work` or a shared network location.

## Changing Back to User Account

If you need to switch back to a user account:

```powershell
# Stop the service
Stop-Service -Name NexrenderWorker

# Set to run as current user
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
C:\nssm\nssm.exe set NexrenderWorker ObjectName $CurrentUser

# Or use the fix script
.\fix-service-user.ps1

# Start the service
Start-Service -Name NexrenderWorker
```

## Verification

To check which account the service is running as:

```powershell
# Using NSSM
C:\nssm\nssm.exe get NexrenderWorker ObjectName

# Using PowerShell
Get-WmiObject Win32_Service -Filter "Name='NexrenderWorker'" | Select-Object Name, StartName
```

## Recommendation

**For most use cases, running as a user account is recommended** because:
- Better compatibility with After Effects
- Proper font installation to user directories
- Access to user-specific settings and preferences
- Easier troubleshooting

**Use SYSTEM account only if you have specific requirements** that necessitate it, such as:
- Server environments without interactive users
- Need for system-wide font installation
- Requirements for maximum system privileges

