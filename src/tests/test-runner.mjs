import { app } from 'electron';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

app.whenReady().then(() => {
    console.log('--- Electron Test Runner Started ---');
    try {
        require('./test-db.js');
    } catch (err) {
        console.error('Test Execution Failed:', err);
    }
    console.log('--- Electron Test Runner Finished ---');
    app.quit();
});
