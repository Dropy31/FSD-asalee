
/**
 * Patient Manager Module
 * Handles CRUD operations and state management for patients.
 */

let currentPatient = null;
const listeners = [];

export const patientManager = {
    // --- State Management ---
    get currentPatient() {
        return currentPatient;
    },

    set currentPatient(val) {
        currentPatient = val;
        this.notifyListeners();
    },

    subscribe(listener) {
        listeners.push(listener);
    },

    notifyListeners() {
        listeners.forEach(fn => fn(currentPatient));
    },

    // --- CRUD Operations ---

    async getAll() {
        try {
            return await window.electronAPI.getPatients();
        } catch (error) {
            console.error('PatientManager: Error fetching all patients', error);
            throw error;
        }
    },

    async getById(id) {
        try {
            const p = await window.electronAPI.getPatient(id);
            if (p) {
                // Ensure protocol object exists
                if (!p.protocols) p.protocols = {};
                // Ensure risk objects exist
                if (!p.riskProfile) p.riskProfile = {};
            }
            return p;
        } catch (error) {
            console.error(`PatientManager: Error fetching patient ${id}`, error);
            throw error;
        }
    },

    async create(data) {
        try {
            const id = await window.electronAPI.createPatient(data);
            return id;
        } catch (error) {
            console.error('PatientManager: Error creating patient', error);
            throw error;
        }
    },

    async update(id, data) {
        try {
            const success = await window.electronAPI.updatePatient(id, data);
            if (success && currentPatient && currentPatient.db_id === id) {
                // Update local state if we are modifying the active patient
                currentPatient = { ...currentPatient, ...data };
                this.notifyListeners();
            }
            return success;
        } catch (error) {
            console.error(`PatientManager: Error updating patient ${id}`, error);
            throw error;
        }
    },

    async delete(id) {
        try {
            const success = await window.electronAPI.deletePatient(id);
            if (success && currentPatient && currentPatient.db_id === id) {
                currentPatient = null;
                this.notifyListeners();
            }
            return success;
        } catch (error) {
            console.error(`PatientManager: Error deleting patient ${id}`, error);
            throw error;
        }
    },

    /**
     * Checks if a patient is currently active and matches the given ID.
     * Useful for checking if we are deleting the open file.
     */
    isActive(id) {
        return currentPatient && currentPatient.db_id == id; // Loose equality for safety
    }
};
