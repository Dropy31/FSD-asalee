
const fs = require('fs');
const path = 'src/renderer/renderer.js';

try {
    let content = fs.readFileSync(path);
    // Remove null bytes
    let cleanContent = content.filter(b => b !== 0);
    fs.writeFileSync(path, cleanContent);
    console.log('Repaired ' + path);
} catch (e) {
    console.error(e);
}
