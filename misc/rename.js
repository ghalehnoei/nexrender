const fs    = require('fs')
const path  = require('path')
const bin   = path.join(__dirname, '..', 'bin')

// TODO: maybe add binary versions?

// Rename mappings: [source pattern, target prefix]
// This ensures all packages always use "nexrender-" prefix
const renameMappings = [
    { pattern: /^server-linux$/, target: 'nexrender-server-linux' },
    { pattern: /^server-win\.exe$/, target: 'nexrender-server-win64.exe' },
    { pattern: /^server-macos$/, target: 'nexrender-server-macos' },
    { pattern: /^worker-macos$/, target: 'nexrender-worker-macos' },
    { pattern: /^worker-win\.exe$/, target: 'nexrender-worker-win64.exe' },
    { pattern: /^cli-macos$/, target: 'nexrender-cli-macos' },
    { pattern: /^cli-win\.exe$/, target: 'nexrender-cli-win64.exe' },
];

// Function to rename files, ensuring nexrender- prefix
function renameFile(source, target) {
    const sourcePath = path.join(bin, source);
    const targetPath = path.join(bin, target);
    
    if (fs.existsSync(sourcePath)) {
        // Check if target already exists (e.g., already has prefix)
        if (source !== target && !fs.existsSync(targetPath)) {
            fs.renameSync(sourcePath, targetPath);
            console.log(`Renamed: ${source} -> ${target}`);
        }
    }
}

// Apply all renames from mappings
renameMappings.forEach(({ pattern, target }) => {
    const files = fs.readdirSync(bin);
    files.forEach(file => {
        // Skip if already has nexrender- prefix
        if (file.startsWith('nexrender-')) {
            return;
        }
        
        // Check if file matches the pattern
        if (pattern.test(file)) {
            renameFile(file, target);
        }
    });
});
