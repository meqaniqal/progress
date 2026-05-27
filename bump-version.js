const fs = require('fs');
const path = require('path');

// Path to your index.html file
const indexPath = path.join(__dirname, 'index.html');

try {
    // Read the current index.html
    let html = fs.readFileSync(indexPath, 'utf8');
    
    // Create a new version string based on the current timestamp
    const newVersion = Date.now();
    
    // Regex to find any href="...css?v=X" or src="...js?v=X" and replace the number
    // Matches '.css?v=' or '.js?v=' followed by any numbers/dots
    const updatedHtml = html.replace(/(\.(?:css|js)\?v=)[0-9.]+/g, `$1${newVersion}`);
    
    // Write the changes back to index.html
    fs.writeFileSync(indexPath, updatedHtml);
    
    console.log(`✅ Successfully bumped cache versions in index.html to: ${newVersion}`);
} catch (error) {
    console.error("❌ Error bumping version:", error.message);
}