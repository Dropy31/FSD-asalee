
const fs = require('fs');

const src = 'src/renderer/renderer.js';
const dest = 'src/renderer/renderer_clean.js';

try {
    const buf = fs.readFileSync(src);
    // Convert to string using utf8, ignoring errors? 
    // Or filter nulls first then stringify.
    const cleanBuf = Buffer.from(buf.filter(b => b !== 0));
    const str = cleanBuf.toString('utf8');

    fs.writeFileSync(dest, str, 'utf-8');
    console.log('Wrote clean file to ' + dest);
} catch (e) {
    console.error(e);
}
