const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('../database/db');
const auth = require('./auth');

let mainWindow = null;
let loginWindow = null;

function createLoginWindow() {
    loginWindow = new BrowserWindow({
        width: 450,
        height: 550,
        resizable: false,
        frame: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    loginWindow.loadFile(path.join(__dirname, '../renderer/login.html'));
    loginWindow.webContents.openDevTools();

    loginWindow.on('closed', () => {
        loginWindow = null;
    });
}

function createMainWindow() {
    // Initialize Database (Tables)
    // Note: The KEY must be set via auth.login() BEFORE calling any db operations that use crypto.
    // db.initDatabase() creates tables but doesn't encrypt/decrypt content yet, so it's safe.
    db.initDatabase();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createLoginWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createLoginWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- Auth IPC Handlers ---

ipcMain.handle('auth:status', () => {
    return auth.getAuthStatus();
});

ipcMain.handle('auth:register', (event, password) => {
    try {
        const success = auth.register(password);
        if (success) {
            launchAppAfterAuth();
        }
        return success;
    } catch (err) {
        throw new Error(err.message);
    }
});

ipcMain.handle('auth:migrate', (event, password) => {
    try {
        const success = auth.migrate(password);
        if (success) {
            launchAppAfterAuth();
        }
        return success;
    } catch (err) {
        throw new Error(err.message);
    }
});

ipcMain.handle('auth:login', (event, password) => {
    try {
        const success = auth.login(password);
        if (success) {
            launchAppAfterAuth();
        }
        return success;
    } catch (err) {
        // Return false or throw? preload expects promise rejection for error message
        throw new Error(err.message);
    }
});

ipcMain.handle('auth:reset', (event) => {
    try {
        const success = auth.reset();
        return success; // Returns true/false, renderer will then reload
    } catch (err) {
        throw new Error(err.message);
    }
});

function launchAppAfterAuth() {
    if (loginWindow) {
        loginWindow.close();
    }
    createMainWindow();
}

// --- App IPC Handlers (Existing) ---

ipcMain.handle('get-app-version', () => app.getVersion());

// Database IPC Handlers
ipcMain.handle('db:get-patients', () => {
    return db.getAllPatients();
});

ipcMain.handle('db:create-patient', (event, patientData) => {
    return db.createPatient(patientData);
});

ipcMain.handle('db:get-patient', (event, id) => {
    return db.getPatientById(id);
});

ipcMain.handle('db:update-patient', (event, id, patientData) => {
    return db.updatePatient(id, patientData);
});

ipcMain.handle('db:delete-patient', (event, id) => {
    return db.deletePatient(id);
});

// ETP Sessions IPC Handlers
ipcMain.handle('db:get-sessions', () => {
    return db.getAllSessions();
});

ipcMain.handle('db:create-session', (event, sessionData) => {
    return db.createSession(sessionData);
});

ipcMain.handle('db:update-session', (event, id, sessionData) => {
    return db.updateSession(id, sessionData);
});

ipcMain.handle('db:delete-session', (event, id) => {
    return db.deleteSession(id);
});

// Medications IPC Handlers
ipcMain.handle('db:get-medications', () => {
    return db.getAllMedications();
});

ipcMain.handle('db:create-medication', (event, data) => {
    return db.createMedication(data);
});

ipcMain.handle('db:update-medication', (event, id, data) => {
    return db.updateMedication(id, data);
});

ipcMain.handle('db:delete-medication', (event, id) => {
    return db.deleteMedication(id);
});
