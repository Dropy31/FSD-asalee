
const fs = require('fs');
const path = 'src/renderer/renderer.js';

try {
    // Read as binary buffer
    const buffer = fs.readFileSync(path);

    // Create new buffer excluding null bytes
    const cleanBuffer = Buffer.from(buffer.filter(b => b !== 0));

    // Write back
    fs.writeFileSync(path, cleanBuffer);
    console.log(`Repaired ${path}. Original size: ${buffer.length}, New size: ${cleanBuffer.length}`);
} catch (e) {
    console.error(e);
}
