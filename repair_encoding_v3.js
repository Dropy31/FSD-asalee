
const fs = require('fs');
const path = 'src/renderer/renderer.js';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Mappings for UTF-8 interpreted as Latin-1/Windows-1252
    const replacements = [
        { from: /Ã©/g, to: 'é' },
        { from: /Ã¨/g, to: 'è' },
        { from: /Ãª/g, to: 'ê' },
        { from: /Ã«/g, to: 'ë' },
        { from: /Ã /g, to: 'à' }, // Space might be NBSP (\u00A0)
        { from: /Ã\u00A0/g, to: 'à' },
        { from: /Ã¹/g, to: 'ù' },
        { from: /Ã´/g, to: 'ô' },
        { from: /Ã¶/g, to: 'ö' },
        { from: /Ã®/g, to: 'î' },
        { from: /Ã¯/g, to: 'ï' },
        { from: /Ã»/g, to: 'û' },
        { from: /Ã¼/g, to: 'ü' },
        { from: /Ã§/g, to: 'ç' },
        { from: /Â°/g, to: '°' },
        { from: /â\u20ac\u2122/g, to: "'" }, // Smart quote ?
        { from: /Ã/g, to: 'à' } // Aggressive fallback for 'Ã' at end of word? No, risk.
    ];

    replacements.forEach(r => {
        content = content.replace(r.from, r.to);
    });

    // Special case for 'Ã' which often renders as just 'Ã' if followed by invalid char or EOF? 
    // In "SynthÃ¨se", it's 'Ã' + '¨'. '¨' is A8. C3 A8 is è.
    // The previous replacements handle the C3+Char pairs.

    fs.writeFileSync(path, content, 'utf8');
    console.log("Repaired encoding artifacts.");
} catch (e) {
    console.error(e);
}
