const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { name } = require("./package.json");

const NX_ENABLE_FONT_REMOVAL = process.env.NX_ENABLE_FONT_REMOVAL || false;
const NX_FONT_REMOVAL_RETRIES = process.env.NX_FONT_REMOVAL_RETRIES || 30;

// Helper function to get user's LocalAppData path, even when running as a service
const getUserLocalAppData = () => {
    // First try environment variable (works in normal execution)
    if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
    }
    
    // If running as service, construct from user profile
    // Get the user's home directory
    const homedir = os.homedir();
    
    // Construct LocalAppData path
    // For Windows: %USERPROFILE%\AppData\Local
    if (process.platform === "win32") {
        const localAppData = path.join(homedir, "AppData", "Local");
        if (fs.existsSync(localAppData)) {
            return localAppData;
        }
    }
    
    // Fallback: try to get from registry or use homedir
    try {
        // Try to get from registry
        const result = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v "Local AppData"', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = result.match(/Local AppData\s+REG_SZ\s+(.+)/);
        if (match && match[1]) {
            return match[1].trim();
        }
    } catch (e) {
        // Registry query failed, use fallback
    }
    
    // Final fallback: construct from homedir
    return path.join(homedir, "AppData", "Local");
};

const installMac = async (settings, job, fontpath) => {
    const fontdir = path.join(process.env.HOME, "Library", "Fonts");
    const fontdest = path.join(fontdir, path.basename(fontpath));

    if (!fs.existsSync(fontdir)) {
        fs.mkdirSync(fontdir, { recursive: true });
    }

    if (fs.existsSync(fontdest)) {
        settings.logger.log(`[action-fonts] Font ${fontdest} already exists, skipping.`);
        return 0;
    }

    settings.logger.log(`[action-fonts] Installing font ${fontpath} to ${fontdest}...`);
    fs.copyFileSync(fontpath, fontdest);

    return 1;
};

const installWin = async (settings, job, fontpath) => {
    const fontname = path.basename(fontpath);
    const fontdisplayname = path.basename(fontpath, path.extname(fontpath));
    let installed = false;
    
    // Try to install to system fonts directory first (for service context)
    // This requires admin rights but ensures After Effects can see the font
    const systemFontDir = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
    const systemFontDest = path.join(systemFontDir, fontname);
    
    if (fs.existsSync(systemFontDir)) {
        try {
            if (!fs.existsSync(systemFontDest)) {
                settings.logger.log(`[action-fonts] Installing font to system directory: ${systemFontDest}...`);
                fs.copyFileSync(fontpath, systemFontDest);
                installed = true;
                
                // Register in system registry (HKLM)
                try {
                    const systemReg = `reg add "HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "${fontdisplayname} (TrueType)" /t REG_SZ /d "${fontname}" /f`;
                    execSync(systemReg);
                    settings.logger.log(`[action-fonts] Registered font in system registry`);
                } catch (e) {
                    settings.logger.log(`[action-fonts] Warning: Could not register in system registry (may need admin): ${e.message}`);
                }
            } else {
                settings.logger.log(`[action-fonts] Font ${systemFontDest} already exists in system directory, skipping.`);
                installed = true;
            }
        } catch (e) {
            settings.logger.log(`[action-fonts] Could not install to system directory (may need admin): ${e.message}`);
            settings.logger.log(`[action-fonts] Falling back to user directory...`);
        }
    }
    
    // Also install to user directory (for compatibility and non-service contexts)
    const localAppData = getUserLocalAppData();
    const userFontDir = path.join(localAppData, "Microsoft", "Windows", "Fonts");
    const userFontDest = path.join(userFontDir, fontname);
    
    if (!fs.existsSync(userFontDir)) {
        fs.mkdirSync(userFontDir, { recursive: true });
    }

    if (fs.existsSync(userFontDest)) {
        if (!installed) {
            settings.logger.log(`[action-fonts] Font ${userFontDest} already exists in user directory.`);
            installed = true;
        }
    } else {
        settings.logger.log(`[action-fonts] Installing font to user directory: ${userFontDest}...`);
        fs.copyFileSync(fontpath, userFontDest);
        installed = true;
    }

    // Register in user registry (HKCU)
    try {
        const userReg = `reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "${fontdisplayname} (TrueType)" /t REG_SZ /d "${userFontDest}" /f`;
        settings.logger.log(`[action-fonts] Adding font to user registry...`);
        execSync(userReg);
    } catch (e) {
        settings.logger.log(`[action-fonts] Error adding font to user registry: ${e.message}`);
    }

    return installed ? 1 : 0;
};

const notifyWin = async (settings, job) => {
    // Multiple notification methods to ensure fonts are visible to After Effects
    const methods = [
        // Method 1: UpdatePerUserSystemParameters (for user fonts)
        () => {
            const script = path.join(job.workpath, "notify.vbs");
            const content = `
                Set objShell = CreateObject("WScript.Shell")
                objShell.Run "RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters", 0, False
            `;
            fs.writeFileSync(script, content, "utf8");
            execSync(`cscript //nologo ${script}`, { timeout: 5000 });
        },
        // Method 2: Direct DLL call
        () => {
            execSync('RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters', { timeout: 5000 });
        },
        // Method 3: Broadcast font change message (for system fonts)
        () => {
            try {
                execSync('RUNDLL32.EXE gdi32.dll,AddFontResourceW', { timeout: 5000 });
            } catch (e) {
                // This might fail, that's okay
            }
        }
    ];

    let success = false;
    for (const method of methods) {
        try {
            method();
            success = true;
            break;
        } catch (e) {
            // Try next method
            continue;
        }
    }

    if (settings && settings.logger) {
        if (success) {
            settings.logger.log(`[action-fonts] Notified Windows of font changes`);
        } else {
            settings.logger.log(`[action-fonts] Warning: Could not notify Windows of font changes. Fonts are installed but After Effects may need to be restarted to see them.`);
        }
    }
}

const uninstallWin = async (settings, job, fontpath) => {
    // Get user's LocalAppData path (works even when running as service)
    const localAppData = getUserLocalAppData();
    const fontdir = path.join(localAppData, "Microsoft", "Windows", "Fonts");
    const fontdest = path.join(fontdir, path.basename(fontpath));

    settings.logger.log(`[action-fonts] Uninstalling font ${fontdest}...`);

    /* remove from registry */
    const fontdisplayname = path.basename(fontpath, path.extname(fontpath));
    const fontreg = `reg delete "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "${fontdisplayname} (TrueType)" /f`;

    try {
        execSync(fontreg);
    } catch (e) {
        settings.logger.log(`[action-fonts] Error removing font ${fontdest} from registry: ${e.message}`);
    }

    let retries = 0;
    while (retries < NX_FONT_REMOVAL_RETRIES) {
        if (fs.existsSync(fontdest)) {
            break;
        }
        retries++;

        settings.logger.log(`[action-fonts] Font ${fontdest} still exists, retrying... (${retries}/${NX_FONT_REMOVAL_RETRIES})`);

        try {
            fs.unlinkSync(fontdest);
        } catch (e) {
            settings.logger.log(`[action-fonts] Error removing font ${fontdest}: ${e.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return 1;
}

const uninstallMac = async (settings, job, fontpath) => {
    const fontdir = path.join(process.env.HOME, "Library", "Fonts");
    const fontdest = path.join(fontdir, path.basename(fontpath));

    settings.logger.log(`[action-fonts] Uninstalling font ${fontdest}...`);

    try {
        if (fs.existsSync(fontdest)) {
            fs.unlinkSync(fontdest);
        }
    } catch (e) {
        settings.logger.log(`[action-fonts] Error removing font ${fontdest}: ${e.message}`);
    }
}

module.exports = async (job, settings, params, type) => {
    if (type != "prerender" && type != "postrender") {
        throw new Error(
            `Action ${name} can be only run in prerender or postrender mode, you provided: ${type}.`,
        );
    }

    /* add this action to postrender if it's not already there, to clean up the fonts after the render */
    if (type == "prerender") {
        job.actions.postrender.push({
            module: __filename,
        });

        let fontsAdded = 0;

        /* iterate over assets, and install all assets which are fonts */
        for (const asset of job.assets) {
            if (asset.type !== "static") {
                continue;
            }

            if (!asset.src.match(/\.(ttf)$/) && !asset.src.match(/\.otf$/)) {
                continue;
            }

            if (!asset.name) {
                throw new Error(`Asset ${asset.src} has to be named using the "name" property that would contain the font name as it is used to be then used in the After Effects project.`);
            }

            if (process.platform === "darwin") {
                fontsAdded += await installMac(settings, job, asset.dest);
            } else if (process.platform === "win32") {
                fontsAdded += await installWin(settings, job, asset.dest);
            } else {
                throw new Error(`Platform ${process.platform} is not supported.`);
            }
        }

        if (fontsAdded > 0 && process.platform === "win32") {
            await notifyWin(settings, job);
        }
    } else if (type == "postrender") {
        for (const asset of job.assets) {
            if (asset.type !== "static") {
                continue;
            }

            if (!asset.src.match(/\.(ttf)$/) && !asset.src.match(/\.otf$/)) {
                continue;
            }

            if (!NX_ENABLE_FONT_REMOVAL) {
                continue;
            }

            if (process.platform === "darwin") {
                await uninstallMac(settings, job, asset.dest);
            } else if (process.platform === "win32") {
                await uninstallWin(settings, job, asset.dest);
            }
        }
    }

    return job;
};
