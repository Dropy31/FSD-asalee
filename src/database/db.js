const Database = require('better-sqlite3');
const path = require('path');
const cryptoHelper = require('../main/crypto');
const { app } = require('electron');

let db;

function initDatabase(customPath) {
    let dbPath;
    if (customPath) {
        dbPath = path.join(customPath, 'diabetes.db');
    } else {
        // Ensure we are in a valid Electron environment or fallback for testing
        const userDataPath = app ? app.getPath('userData') : __dirname;
        dbPath = path.join(userDataPath, 'diabetes.db');
    }

    // Open database (creates it if it doesn't exist)
    db = new Database(dbPath);

    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');

    // Create table
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE,
            encrypted_data TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        )
    `;
    db.exec(createTableQuery);

    // Create table for ETP Sessions
    const createEtpTableQuery = `
        CREATE TABLE IF NOT EXISTS etp_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            custom_id TEXT UNIQUE,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            mode TEXT,
            educational_objectives TEXT,
            prerequisites TEXT,
            content TEXT,
            supports TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    `;
    db.exec(createEtpTableQuery);

    // Migration: Add custom_id if it doesn't exist
    try {
        console.log('Migrating etp_sessions: Checking custom_id...');

        // 1. Add Column (without UNIQUE constraint which is not supported in ALTER TABLE ADD COLUMN)
        try {
            db.exec('ALTER TABLE etp_sessions ADD COLUMN custom_id TEXT');
            console.log('custom_id column added.');
        } catch (e) {
            if (!e.message.includes('duplicate column name')) throw e;
            console.log('custom_id column already exists.');
        }

        // 2. Add Unique Index
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_etp_sessions_custom_id ON etp_sessions(custom_id)');
        console.log('Unique index ensured.');

        // 3. Backfill existing rows
        db.exec("UPDATE etp_sessions SET custom_id = CAST(id AS TEXT) WHERE custom_id IS NULL");

    } catch (err) {
        console.error('Error migrating etp_sessions:', err);
    }

    // Migration: Add educational_objectives if it doesn't exist
    try {
        console.log('Migrating etp_sessions: Checking educational_objectives...');
        try {
            db.exec('ALTER TABLE etp_sessions ADD COLUMN educational_objectives TEXT');
            console.log('educational_objectives column added.');
        } catch (e) {
            if (!e.message.includes('duplicate column name')) throw e;
            console.log('educational_objectives column already exists.');
        }
    } catch (err) {
        console.error('Error adding educational_objectives:', err);
    }


    console.log(`Database initialized at: ${dbPath}`);
}

// --- Patient Operations ---

function createPatient(patientData) {
    if (!db) throw new Error('Database not initialized');

    const uuid = cryptoHelper.encrypt(Date.now().toString()).iv; // Simple unique ID for now, better to use UUID lib
    const now = new Date().toISOString();

    // Encrypt the entire patient object
    // We add the ID to the object before encrypting so it's part of the record
    const patientWithMeta = { ...patientData, created_at: now, updated_at: now };
    const encrypted = cryptoHelper.encrypt(JSON.stringify(patientWithMeta));

    // Store as JSON string of the encrypted object { iv, encryptedData }
    const encryptedString = JSON.stringify(encrypted);

    const stmt = db.prepare(`
        INSERT INTO patients (uuid, encrypted_data, created_at, updated_at)
        VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(uuid, encryptedString, now, now);
    return info.lastInsertRowid;
}

function getAllPatients() {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM patients ORDER BY updated_at DESC');
    const rows = stmt.all();

    return rows.map(row => {
        try {
            const encryptedObj = JSON.parse(row.encrypted_data);
            const decryptedJson = cryptoHelper.decrypt(encryptedObj);
            const patient = JSON.parse(decryptedJson);
            // Attach the DB ID to the object for reference
            patient.db_id = row.id;
            return patient;
        } catch (err) {
            console.error(`Failed to decrypt patient ${row.id}:`, err);
            return null;
        }
    }).filter(p => p !== null);
}

function getPatientById(id) {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM patients WHERE id = ?');
    const row = stmt.get(id);

    if (!row) return null;

    try {
        const encryptedObj = JSON.parse(row.encrypted_data);
        const decryptedJson = cryptoHelper.decrypt(encryptedObj);
        const patient = JSON.parse(decryptedJson);
        patient.db_id = row.id;
        return patient;
    } catch (err) {
        console.error(`Failed to decrypt patient ${id}:`, err);
        return null;
    }
}

function updatePatient(id, patientData) {
    if (!db) throw new Error('Database not initialized');

    const current = getPatientById(id);
    if (!current) return false;

    const now = new Date().toISOString();

    // Merge existing data with updates
    const updatedPatient = { ...current, ...patientData, updated_at: now };
    // Remove internal db_id before encrypting
    delete updatedPatient.db_id;

    const encrypted = cryptoHelper.encrypt(JSON.stringify(updatedPatient));
    const encryptedString = JSON.stringify(encrypted);

    const stmt = db.prepare(`
        UPDATE patients 
        SET encrypted_data = ?, updated_at = ?
        WHERE id = ?
    `);

    const info = stmt.run(encryptedString, now, id);
    return info.changes > 0;
}

function deletePatient(id) {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare('DELETE FROM patients WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
}

// --- ETP Session Operations ---


function createSession(sessionData) {
    if (!db) throw new Error('Database not initialized');

    // Validate required fields
    if (!sessionData.title || !sessionData.category) {
        throw new Error('Title and Category are required');
    }

    const { title, category, mode, educational_objectives, prerequisites, content, supports, custom_id } = sessionData;
    const now = new Date().toISOString();

    // Check for duplicate custom_id
    if (custom_id) {
        const existing = db.prepare('SELECT id FROM etp_sessions WHERE custom_id = ?').get(custom_id);
        if (existing) {
            throw new Error(`L'identifiant "${custom_id}" est déjà utilisé.`);
        }
    }

    const stmt = db.prepare(`
        INSERT INTO etp_sessions (custom_id, title, category, mode, educational_objectives, prerequisites, content, supports, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(custom_id, title, category, mode, educational_objectives, prerequisites, content, supports, now, now);
    return { id: result.lastInsertRowid, ...sessionData, created_at: now, updated_at: now };
}

function getAllSessions() {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare('SELECT * FROM etp_sessions ORDER BY custom_id ASC, title ASC');
    const rows = stmt.all();
    return rows;
}

function updateSession(id, sessionData) {
    if (!db) throw new Error('Database not initialized');

    const { title, category, mode, educational_objectives, prerequisites, content, supports, custom_id } = sessionData;
    const now = new Date().toISOString();

    // Check for duplicate custom_id (excluding self)
    if (custom_id) {
        const existing = db.prepare('SELECT id FROM etp_sessions WHERE custom_id = ? AND id != ?').get(custom_id, id);
        if (existing) {
            throw new Error(`L'identifiant "${custom_id}" est déjà utilisé.`);
        }
    }

    const stmt = db.prepare(`
        UPDATE etp_sessions
        SET custom_id = ?, title = ?, category = ?, mode = ?, educational_objectives = ?, prerequisites = ?, content = ?, supports = ?, updated_at = ?
        WHERE id = ?
    `);

    stmt.run(custom_id, title, category, mode, educational_objectives, prerequisites, content, supports, now, id);
    return { id, ...sessionData, updated_at: now };
}

function deleteSession(id) {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare('DELETE FROM etp_sessions WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
}

function deleteAllEtpSessions() {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare('DELETE FROM etp_sessions');
    const info = stmt.run();
    return info.changes;
}

module.exports = {
    initDatabase,
    createPatient,
    getAllPatients,
    getPatientById,
    updatePatient,
    deletePatient,
    // ETP
    createSession,
    getAllSessions,
    updateSession,
    deleteSession,
    deleteAllEtpSessions
};
