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
    deleteEtpSession: (id) => ipcRenderer.invoke('db:delete-session', id)
});
