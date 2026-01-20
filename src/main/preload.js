const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Database API
    getPatients: () => ipcRenderer.invoke('db:get-patients'),
    createPatient: (data) => ipcRenderer.invoke('db:create-patient', data),
    getPatient: (id) => ipcRenderer.invoke('db:get-patient', id),
    updatePatient: (id, data) => ipcRenderer.invoke('db:update-patient', id, data),
    deletePatient: (id) => ipcRenderer.invoke('db:delete-patient', id),
    log: (msg) => ipcRenderer.send('test-log', msg),

    // ETP
    getEtpSessions: () => ipcRenderer.invoke('db:get-sessions'),
    createEtpSession: (data) => ipcRenderer.invoke('db:create-session', data),
    updateEtpSession: (id, data) => ipcRenderer.invoke('db:update-session', id, data),
    deleteEtpSession: (id) => ipcRenderer.invoke('db:delete-session', id),
    // Medications
    getMedications: () => ipcRenderer.invoke('db:get-medications'),
    createMedication: (data) => ipcRenderer.invoke('db:create-medication', data),
    updateMedication: (id, data) => ipcRenderer.invoke('db:update-medication', id, data),
    deleteMedication: (id) => ipcRenderer.invoke('db:delete-medication', id),
    // Auth API
    getAuthStatus: () => ipcRenderer.invoke('auth:status'),
    login: (password) => ipcRenderer.invoke('auth:login', password),
    register: (password) => ipcRenderer.invoke('auth:register', password),
    migrate: (password) => ipcRenderer.invoke('auth:migrate', password),
    reset: () => ipcRenderer.invoke('auth:reset')
});
