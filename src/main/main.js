const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('../database/db');

function createWindow() {
    // Initialize Database
    db.initDatabase();

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    // mainWindow.loadFile(path.join(__dirname, '../tests/test.html'));
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
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

ipcMain.on('test-log', (event, msg) => {
    console.log('[TEST]', msg);
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
