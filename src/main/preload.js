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
    // Templates
    getTemplates: () => ipcRenderer.invoke('db:get-templates'),
    createTemplate: (data) => ipcRenderer.invoke('db:create-template', data),
    updateTemplate: (id, data) => ipcRenderer.invoke('db:update-template', id, data),
    deleteTemplate: (id) => ipcRenderer.invoke('db:delete-template', id),
    // Macros
    getMacros: () => ipcRenderer.invoke('db:get-macros'),
    createMacro: (data) => ipcRenderer.invoke('db:create-macro', data),
    updateMacro: (id, data) => ipcRenderer.invoke('db:update-macro', id, data),
    deleteMacro: (id) => ipcRenderer.invoke('db:delete-macro', id),
    // Groups
    dbCreateGroup: (data) => ipcRenderer.invoke('db:create-group', data),
    dbGetGroups: () => ipcRenderer.invoke('db:get-groups'),
    dbUpdateGroup: (id, data) => ipcRenderer.invoke('db:update-group', id, data),
    dbDeleteGroup: (id) => ipcRenderer.invoke('db:delete-group', id),
    dbAddPatientToGroup: (groupId, patientId) => ipcRenderer.invoke('db:add-patient-to-group', groupId, patientId),
    dbRemovePatientFromGroup: (groupId, patientId) => ipcRenderer.invoke('db:remove-patient-from-group', groupId, patientId),
    dbGetGroupPatients: (groupId) => ipcRenderer.invoke('db:get-group-patients', groupId),

    // Alias for consistency with groups-manager.js
    dbGetSessions: () => ipcRenderer.invoke('db:get-sessions'),
    dbGetAllSessions: () => ipcRenderer.invoke('db:get-sessions'),

    // Auth API
    getAuthStatus: () => ipcRenderer.invoke('auth:status'),
    login: (password) => ipcRenderer.invoke('auth:login', password),
    register: (password) => ipcRenderer.invoke('auth:register', password),
    migrate: (password) => ipcRenderer.invoke('auth:migrate', password),
    reset: () => ipcRenderer.invoke('auth:reset')
});
