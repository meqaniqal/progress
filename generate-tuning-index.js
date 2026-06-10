import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libraryPath = path.join(__dirname, 'tuning_library');
const outputPath = path.join(libraryPath, 'index.json');

function scanDirectory(dir) {
    const results = {};
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            // Recurse into subdirectories as categories
            const categoryName = item;
            const files = fs.readdirSync(fullPath)
                .filter(f => f.toLowerCase().endsWith('.scl') || f.toLowerCase().endsWith('.tun'))
                .map(f => ({
                    name: f.replace(/\.(scl|tun)$/i, ''),
                    filename: f,
                    path: `tuning_library/${categoryName}/${f}`
                }));
            
            if (files.length > 0) {
                results[categoryName] = files;
            }
        }
    }
    
    // Also scan files in the root of tuning_library (if any)
    const rootFiles = items
        .filter(f => f.toLowerCase().endsWith('.scl') || f.toLowerCase().endsWith('.tun'))
        .map(f => ({
            name: f.replace(/\.(scl|tun)$/i, ''),
            filename: f,
            path: `tuning_library/${f}`
        }));
        
    if (rootFiles.length > 0) {
        results['General'] = rootFiles;
    }
    
    return results;
}

try {
    const indexData = scanDirectory(libraryPath);
    fs.writeFileSync(outputPath, JSON.stringify(indexData, null, 2), 'utf-8');
    console.log(`✅ Static tuning index generated successfully at: ${outputPath}`);
} catch (error) {
    console.error('❌ Error generating tuning index:', error.message);
}
