# Fix After Effects Configuration for SYSTEM Account
# This script configures After Effects to work properly when the worker runs as SYSTEM account
# Run this script as Administrator

param(
    [string]$ServiceName = "NexrenderWorker",
    [string]$AfterEffectsPath = "",
    [switch]$CopyPreferences = $false,
    [string]$SourceUser = ""
)

$ErrorActionPreference = "Continue"

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "After Effects SYSTEM Account Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# SYSTEM account profile paths
$SystemProfile = "C:\Windows\System32\config\systemprofile"
$SystemDocuments = Join-Path $SystemProfile "Documents"
$SystemAdobe = Join-Path $SystemDocuments "Adobe"
$SystemAppData = Join-Path $SystemProfile "AppData"
$SystemAppDataLocal = Join-Path $SystemAppData "Local"
$SystemAppDataRoaming = Join-Path $SystemAppData "Roaming"

Write-Host "Step 1: Creating SYSTEM profile directories..." -ForegroundColor Green

# Create necessary directories
$directories = @(
    $SystemDocuments,
    $SystemAdobe,
    $SystemAppData,
    $SystemAppDataLocal,
    $SystemAppDataRoaming
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        Write-Host "  Creating: $dir" -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    } else {
        Write-Host "  Exists: $dir" -ForegroundColor Green
    }
}

Write-Host ""

# Step 2: Find After Effects installation
Write-Host "Step 2: Locating After Effects installation..." -ForegroundColor Green

if ($AfterEffectsPath -and (Test-Path $AfterEffectsPath)) {
    $AEPath = $AfterEffectsPath
    Write-Host "  Using provided path: $AEPath" -ForegroundColor Cyan
} else {
    # Try to auto-detect After Effects
    $AEPaths = @(
        "C:\Program Files\Adobe\After Effects 2025\Support Files",
        "C:\Program Files\Adobe\After Effects 2024\Support Files",
        "C:\Program Files\Adobe\After Effects 2023\Support Files",
        "C:\Program Files\Adobe\After Effects 2022\Support Files",
        "C:\Program Files\Adobe\After Effects 2021\Support Files",
        "C:\Program Files\Adobe\After Effects 2020\Support Files",
        "C:\Program Files\Adobe\Adobe After Effects CC 2020\Support Files",
        "C:\Program Files\Adobe\Adobe After Effects CC 2019\Support Files",
        "C:\Program Files\Adobe\Adobe After Effects CC 2018\Support Files"
    )
    
    $AEPath = $null
    foreach ($path in $AEPaths) {
        if (Test-Path $path) {
            $AEPath = $path
            Write-Host "  Found: $AEPath" -ForegroundColor Cyan
            break
        }
    }
    
    if (-not $AEPath) {
        Write-Host "  WARNING: Could not auto-detect After Effects installation" -ForegroundColor Yellow
        Write-Host "  Please specify path using -AfterEffectsPath parameter" -ForegroundColor Yellow
    }
}

Write-Host ""

# Step 3: Copy preferences (optional)
if ($CopyPreferences -and $SourceUser) {
    Write-Host "Step 3: Copying After Effects preferences from user account..." -ForegroundColor Green
    
    $SourceUserProfile = "C:\Users\$SourceUser"
    $SourceAppDataLocal = Join-Path $SourceUserProfile "AppData\Local"
    $SourceAppDataRoaming = Join-Path $SourceUserProfile "AppData\Roaming"
    
    $AEPrefsLocal = Join-Path $SourceAppDataLocal "Adobe\After Effects"
    $AEPrefsRoaming = Join-Path $SourceAppDataRoaming "Adobe\After Effects"
    
    $TargetAEPrefsLocal = Join-Path $SystemAppDataLocal "Adobe\After Effects"
    $TargetAEPrefsRoaming = Join-Path $SystemAppDataRoaming "Adobe\After Effects"
    
    if (Test-Path $AEPrefsLocal) {
        Write-Host "  Copying local preferences..." -ForegroundColor Yellow
        if (Test-Path $TargetAEPrefsLocal) {
            Remove-Item -Path $TargetAEPrefsLocal -Recurse -Force
        }
        Copy-Item -Path $AEPrefsLocal -Destination $TargetAEPrefsLocal -Recurse -Force
        Write-Host "  ✓ Local preferences copied" -ForegroundColor Green
    }
    
    if (Test-Path $AEPrefsRoaming) {
        Write-Host "  Copying roaming preferences..." -ForegroundColor Yellow
        if (Test-Path $TargetAEPrefsRoaming) {
            Remove-Item -Path $TargetAEPrefsRoaming -Recurse -Force
        }
        Copy-Item -Path $AEPrefsRoaming -Destination $TargetAEPrefsRoaming -Recurse -Force
        Write-Host "  ✓ Roaming preferences copied" -ForegroundColor Green
    }
} elseif ($CopyPreferences) {
    Write-Host "Step 3: Skipping preference copy (-SourceUser not specified)" -ForegroundColor Yellow
} else {
    Write-Host "Step 3: Skipping preference copy (use -CopyPreferences -SourceUser 'username' to enable)" -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Set permissions
Write-Host "Step 4: Setting permissions on SYSTEM profile directories..." -ForegroundColor Green

try {
    # Grant SYSTEM account full control to its own profile directories
    $acl = Get-Acl $SystemProfile
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $SystemProfile -AclObject $acl
    Write-Host "  ✓ Permissions set on SYSTEM profile" -ForegroundColor Green
}
catch {
    Write-Host "  ⚠ Could not set permissions: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Verify patch installation
if ($AEPath) {
    Write-Host "Step 5: Checking After Effects patch status..." -ForegroundColor Green
    $PatchScript = Join-Path $AEPath "Scripts\Startup\commandLineRenderer.jsx"
    $scriptPathExists = Test-Path $PatchScript
    if ($scriptPathExists) {
        $patchContent = Get-Content $PatchScript -Raw -ErrorAction SilentlyContinue
        $isPatched = $patchContent -match "nexrender-patch"
        if ($isPatched) {
            Write-Host "  ✓ Nexrender patch is installed" -ForegroundColor Green
        }
        if (-not $isPatched -and $patchContent) {
            Write-Host "  ⚠ Nexrender patch is NOT installed" -ForegroundColor Yellow
            Write-Host "  Run the worker once manually with admin privileges to install the patch" -ForegroundColor Yellow
        }
    }
    if (-not $scriptPathExists) {
        Write-Host "  ⚠ Could not find patch script at: $PatchScript" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuration Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - SYSTEM profile directories created" -ForegroundColor White
if ($CopyPreferences -and $SourceUser) {
    Write-Host "  - Preferences copied from user: $SourceUser" -ForegroundColor White
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Ensure the service is configured to run as SYSTEM account" -ForegroundColor White
Write-Host "  2. Restart the service: Restart-Service -Name $ServiceName" -ForegroundColor White
Write-Host "  3. Check logs for any remaining issues" -ForegroundColor White
Write-Host ""
Write-Host "If After Effects still has issues:" -ForegroundColor Yellow
Write-Host "  - Run the worker manually once with admin privileges to install the patch" -ForegroundColor White
Write-Host "  - Copy preferences from a working user account using:" -ForegroundColor White
Write-Host "    .\fix-after-effects-system-account.ps1 -CopyPreferences -SourceUser 'username'" -ForegroundColor Cyan

