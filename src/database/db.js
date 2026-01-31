const { randomUUID: uuidv4 } = require('crypto');
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

    // Create table for Medications (Livret Pharmaceutique)
    // Updated Schema 2026-01-16
    const createMedicationsQuery = `
        CREATE TABLE IF NOT EXISTS medications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dci TEXT NOT NULL,
            commercial_name TEXT,
            class TEXT,
            route TEXT,
            dosages TEXT, -- stored as comma-separated string
            created_at TEXT,
            updated_at TEXT
        )
    `;
    db.exec(createMedicationsQuery);

    // Create table for Document Templates
    // Added is_system column 2026-01-29
    const createTemplatesTableQuery = `
        CREATE TABLE IF NOT EXISTS document_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            content TEXT,
            is_system BOOLEAN DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
    `;
    db.exec(createTemplatesTableQuery);

    // Create table for Custom Macros
    const createMacrosTableQuery = `
        CREATE TABLE IF NOT EXISTS custom_macros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL,
            category TEXT NOT NULL,
            type TEXT NOT NULL, -- 'value' | 'text' | 'script'
            value_path TEXT,
            template_text TEXT,
            is_system BOOLEAN DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        )
    `;
    db.exec(createMacrosTableQuery);

    // --- MIGRATIONS ---

    // Migration v2: Check if 'dci' column exists
    try {
        const test = db.prepare('SELECT dci FROM medications LIMIT 1').get();
    } catch (e) {
        console.log('Migrating medications table: Recreating for new schema...');
        db.exec('DROP TABLE IF EXISTS medications');
        db.exec(createMedicationsQuery);
    }

    // Migration: Add custom_id to etp_sessions
    try {
        db.prepare('SELECT custom_id FROM etp_sessions LIMIT 1').get();
    } catch (e) {
        console.log('Migrating etp_sessions: adding custom_id...');
        db.exec('ALTER TABLE etp_sessions ADD COLUMN custom_id TEXT');
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_etp_sessions_custom_id ON etp_sessions(custom_id)');
        db.exec("UPDATE etp_sessions SET custom_id = CAST(id AS TEXT) WHERE custom_id IS NULL");
    }

    // Migration: Add educational_objectives to etp_sessions
    try {
        db.prepare('SELECT educational_objectives FROM etp_sessions LIMIT 1').get();
    } catch (e) {
        console.log('Migrating etp_sessions: adding educational_objectives...');
        db.exec('ALTER TABLE etp_sessions ADD COLUMN educational_objectives TEXT');
    }

    // Migration: Add is_system to document_templates
    try {
        db.prepare('SELECT is_system FROM document_templates LIMIT 1').get();
    } catch (e) {
        console.log('Migrating document_templates: adding is_system...');
        db.exec('ALTER TABLE document_templates ADD COLUMN is_system BOOLEAN DEFAULT 0');
    }

    // Migration: Add policies/protocols to existing patients (Data Migration)
    try {
        const patients = db.prepare('SELECT id, encrypted_data FROM patients').all();
        let migratedCount = 0;
        const updateStmt = db.prepare('UPDATE patients SET encrypted_data = ?, updated_at = ? WHERE id = ?');

        patients.forEach(row => {
            try {
                const encryptedObj = JSON.parse(row.encrypted_data);
                const decryptedJson = cryptoHelper.decrypt(encryptedObj);
                const p = JSON.parse(decryptedJson);

                if (!p.protocols) {
                    // Default to DT2 for existing patients
                    // Use diagnosisYear if valid, else today
                    let date = new Date().toISOString().split('T')[0];
                    if (p.diagnosisYear && /^\d{4}$/.test(p.diagnosisYear)) {
                        date = `${p.diagnosisYear}-01-01`;
                    }

                    p.protocols = {
                        dt2: date
                    };

                    // Re-encrypt
                    const reEncrypted = cryptoHelper.encrypt(JSON.stringify(p));
                    const now = new Date().toISOString();
                    updateStmt.run(JSON.stringify(reEncrypted), now, row.id);
                    migratedCount++;
                }
            } catch (err) {
                console.error(`Failed to migrate patient ${row.id} protocols:`, err);
            }
        });
        if (migratedCount > 0) console.log(`Migrated ${migratedCount} patients to include default protocols.`);

    } catch (e) {
        console.error("Error/Check during patient protocol migration:", e);
    }


    // --- SEEDING ---

    // Inspect Templates for seeding
    // We want to FORCE seed System templates if they don't exist
    // Strategy: Delete all existing SYSTEM templates and re-insert them to ensure updates
    try {
        // Only delete IS_SYSTEM=1, keep user templates
        // If the column was just added, everything is 0, so nothing deleted. That's fine.
        // But if we want to "claim" the default templates as system, we might need a one-time migration.
        // For simplicity, we will just insert the new system ones. If duplicates exist by name, we might have issue.
        // Let's rely on 'seedDefaultTemplates' to checking names or clearing system ones.

        // Use a transaction for safe seeding
        const seedTransaction = db.transaction(() => {
            // Remove old system templates to re-seed fresh versions
            db.prepare('DELETE FROM document_templates WHERE is_system = 1').run();
            seedDefaultTemplates();
        });
        seedTransaction();

    } catch (e) {
        console.error('Error in template seeding logic:', e);
    }

    // Seeding: Macros
    try {
        const count = db.prepare('SELECT COUNT(*) as count FROM custom_macros').get();
        if (count.count === 0) {
            seedDefaultMacros();
        } else {
            // Force Refactor Migration for System Macros
            console.log("Refactor Migration: Resetting System Macros...");
            db.prepare('DELETE FROM custom_macros WHERE is_system = 1').run();
            seedDefaultMacros();
        }
    } catch (e) {
        console.error('Error seeding macros:', e);
    }

    console.log(`Database initialized at: ${dbPath}`);
}

// --- Patient Operations ---

function createPatient(patientData) {
    if (!db) throw new Error('Database not initialized');

    const uuid = uuidv4(); // Use standard UUID v4
    const now = new Date().toISOString();

    // Encrypt the entire patient object
    // We add the ID to the object for reference, but the primary key is the UUID column + internal ID
    const patientWithMeta = { ...patientData, uuid, created_at: now, updated_at: now };
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

// --- Medications Operations ---

function createMedication(data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO medications (dci, commercial_name, class, route, dosages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(data.dci, data.commercial_name, data.class, data.route, data.dosages, now, now);
    return { id: result.lastInsertRowid, ...data };
}

function getAllMedications() {
    if (!db) throw new Error('Database not initialized');
    return db.prepare('SELECT * FROM medications ORDER BY dci ASC').all();
}

function updateMedication(id, data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE medications SET dci = ?, commercial_name = ?, class = ?, route = ?, dosages = ?, updated_at = ? WHERE id = ?');
    stmt.run(data.dci, data.commercial_name, data.class, data.route, data.dosages, now, id);
    return { id, ...data };
}

function deleteMedication(id) {
    if (!db) throw new Error('Database not initialized');
    return db.prepare('DELETE FROM medications WHERE id = ?').run(id).changes > 0;
}

// --- Template Operations ---

function createTemplate(data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();

    // Default is_system to 0 if not provided (user created)
    const isSystem = data.is_system ? 1 : 0;

    const stmt = db.prepare('INSERT INTO document_templates (name, category, content, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const result = stmt.run(data.name, data.category, data.content, isSystem, now, now);
    return { id: result.lastInsertRowid, ...data, is_system: isSystem, created_at: now, updated_at: now };
}

function getAllTemplates() {
    if (!db) throw new Error('Database not initialized');
    return db.prepare('SELECT * FROM document_templates ORDER BY category ASC, name ASC').all();
}

function updateTemplate(id, data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();

    // Only update content/name/cat. Prevent toggling is_system via update typically.
    const stmt = db.prepare('UPDATE document_templates SET name = ?, category = ?, content = ?, updated_at = ? WHERE id = ?');
    stmt.run(data.name, data.category, data.content, now, id);
    return { id, ...data, updated_at: now };
}

function deleteTemplate(id) {
    if (!db) throw new Error('Database not initialized');
    // Security: Check if system? Actually renderer prevents this, but DB safety is good.
    // However, for now we assume renderer handles permission.
    return db.prepare('DELETE FROM document_templates WHERE id = ?').run(id).changes > 0;
}

function seedDefaultTemplates() {
    console.log("Seeding system templates...");
    const now = new Date().toISOString();

    // Helper to generate minimal content
    const baseContent = `Patient {{patient_lastname}} {{patient_firstname}}
Né(e) le {{patient_birthdate}} ({{patient_age}} ans)

[Corps du courrier à compléter]

Cordialement,
{{user_signature}}`;

    const systemTemplates = [
        // 1. Synthèse Protocols
        { name: "Protocole: Diabète de type 2", category: "synthese", is_system: true, content: baseContent },
        { name: "Protocole: HRCV", category: "synthese", is_system: true, content: baseContent },
        { name: "Protocole: Sevrage Tabac", category: "synthese", is_system: true, content: baseContent },
        { name: "Protocole: Asthme", category: "synthese", is_system: true, content: baseContent },
        { name: "Protocole: BPCO", category: "synthese", is_system: true, content: baseContent },
        { name: "Protocole: Dépistage Troubles Cognitifs", category: "synthese", is_system: true, content: baseContent },

        // 2. Adressage Specialists
        { name: "Adressage Endocrinologue", category: "courrier", is_system: true, content: baseContent },
        { name: "Adressage Cardiologue", category: "courrier", is_system: true, content: baseContent },
        { name: "Adressage Pneumologue", category: "courrier", is_system: true, content: baseContent },
        { name: "Adressage Néphrologue", category: "courrier", is_system: true, content: baseContent },
        { name: "Adressage Gériatre", category: "courrier", is_system: true, content: baseContent },
        { name: "Adressage Ophtalmologue", category: "courrier", is_system: true, content: baseContent },
        { name: "Adressage Podologue", category: "courrier", is_system: true, content: baseContent },

        // 3. Communication Interne
        { name: "Synthèse IDE (Prise en charge)", category: "interne", is_system: true, content: baseContent },
        { name: "Adressage IDE (Inclusion)", category: "interne", is_system: true, content: baseContent },
    ];

    const stmt = db.prepare('INSERT INTO document_templates (name, category, content, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((templates) => {
        for (const t of templates) {
            stmt.run(t.name, t.category, t.content, t.is_system ? 1 : 0, now, now);
        }
    });

    insertMany(systemTemplates);
    console.log("System templates seeded.");
}

// --- Macro Operations ---

function createMacro(data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO custom_macros (code, label, category, type, value_path, template_text, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(data.code, data.label, data.category, data.type, data.value_path, data.template_text, data.is_system ? 1 : 0, now, now);
    return { id: result.lastInsertRowid, ...data, created_at: now, updated_at: now };
}

function getAllMacros() {
    if (!db) throw new Error('Database not initialized');
    return db.prepare('SELECT * FROM custom_macros ORDER BY category ASC, label ASC').all();
}

function updateMacro(id, data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE custom_macros SET code = ?, label = ?, category = ?, type = ?, value_path = ?, template_text = ?, updated_at = ? WHERE id = ?');
    stmt.run(data.code, data.label, data.category, data.type, data.value_path, data.template_text, now, id);
    return { id, ...data, updated_at: now };
}

function deleteMacro(id) {
    if (!db) throw new Error('Database not initialized');
    return db.prepare('DELETE FROM custom_macros WHERE id = ?').run(id).changes > 0;
}

function seedDefaultMacros() {
    console.log("Seeding default macros with new categories...");
    const now = new Date().toISOString();

    // Derived from summary_engine.js MACRO_REGISTRY
    const defaults = [
        // Identity
        { code: 'patient_lastname', label: 'Nom', category: 'Identité', type: 'value', value_path: 'patient_lastname', is_system: true },
        { code: 'patient_firstname', label: 'Prénom', category: 'Identité', type: 'value', value_path: 'patient_firstname', is_system: true },
        { code: 'patient_age', label: 'Age', category: 'Identité', type: 'value', value_path: 'patient_age', is_system: true },
        { code: 'patient_gender', label: 'Sexe', category: 'Identité', type: 'value', value_path: 'patient_gender', is_system: true },
        { code: 'patient_civility', label: 'Civilité', category: 'Identité', type: 'value', value_path: 'patient_civility', is_system: true },
        { code: 'diagnosis_duration', label: 'Ancienneté Diabète', category: 'Identité', type: 'value', value_path: 'diabetes_duration', is_system: true },
        { code: 'patient_birthdate', label: 'Date de Naissance', category: 'Identité', type: 'value', value_path: 'patient_birthdate', is_system: true },
        { code: 'patient_doctor', label: 'Médecin Traitant', category: 'Identité', type: 'value', value_path: 'patient_doctor', is_system: true },

        // Profil (Combined Profil + Textes Médicaux that behave like history)
        { code: 'history_hta', label: 'HTA', category: 'Profil', type: 'qualitatif', value_path: 'history_hta', is_system: true },
        { code: 'history_dyslip', label: 'Dyslipidémie', category: 'Profil', type: 'qualitatif', value_path: 'history_dyslip', is_system: true },
        { code: 'history_smoke', label: 'Tabagisme', category: 'Profil', type: 'qualitatif', value_path: 'history_smoke', is_system: true },
        { code: 'history_family_cv', label: 'Hérédité CV', category: 'Profil', type: 'qualitatif', value_path: 'history_family_cv', is_system: true },
        { code: 'history_avc', label: 'AVC/AIT (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_avc', is_system: true },
        { code: 'history_coronary', label: 'Coronaropathie (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_coronary', is_system: true },
        { code: 'history_aomi', label: 'AOMI (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_aomi', is_system: true },
        { code: 'history_stenosis', label: 'Sténose Carotidienne (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_stenosis', is_system: true },
        { code: 'history_retino', label: 'Rétinopathie (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_retino', is_system: true },
        { code: 'history_nephro', label: 'Néphropathie (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_nephro', is_system: true },
        { code: 'history_neuro_sens', label: 'Neuro. Sensitive (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_neuro_sens', is_system: true },
        { code: 'history_neuro_auto', label: 'Neuro. Autonome (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_neuro_auto', is_system: true },
        { code: 'history_hf', label: 'Insuff. Cardiaque (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_hf', is_system: true },
        { code: 'history_afib', label: 'Fib. Atriale (Statut)', category: 'Profil', type: 'qualitatif', value_path: 'history_afib', is_system: true },
        { code: 'history_foot', label: 'Risque Pied (Grade)', category: 'Profil', type: 'qualitatif', value_path: 'history_foot', is_system: true },
        { code: 'history_liver', label: 'Atteinte Hépatique', category: 'Profil', type: 'qualitatif', value_path: 'history_liver', is_system: true },

        // Textes Médicaux -> Profil (User Request)
        { code: 'txt_retino', label: 'Texte: Rétinopathie', category: 'Profil', type: 'text', template_text: "Rétinopathie", is_system: true },
        { code: 'txt_nephro', label: 'Texte: Néphropathie', category: 'Profil', type: 'text', template_text: "Néphropathie", is_system: true },
        { code: 'txt_neuro_sens', label: 'Texte: Neuro. Sensitive', category: 'Profil', type: 'text', template_text: "Neuropathie Sensitive", is_system: true },
        { code: 'txt_neuro_auto', label: 'Texte: Neuro. Autonome', category: 'Profil', type: 'text', template_text: "Neuropathie Autonome", is_system: true },
        { code: 'txt_none_micro', label: 'Texte: Aucune Micro', category: 'Profil', type: 'text', template_text: "Aucune complication microvasculaire", is_system: true },
        { code: 'txt_avc', label: 'Texte: AVC', category: 'Profil', type: 'text', template_text: "Antécédent AVC", is_system: true },
        { code: 'txt_coronary', label: 'Texte: Coronaropathie', category: 'Profil', type: 'text', template_text: "Coronaropathie (IDM/Stent)", is_system: true },
        { code: 'txt_aomi', label: 'Texte: AOMI', category: 'Profil', type: 'text', template_text: "AOMI", is_system: true },
        { code: 'txt_stenosis', label: 'Texte: Sténose Carotidienne', category: 'Profil', type: 'text', template_text: "Sténose Carotidienne", is_system: true },
        { code: 'txt_hf', label: 'Texte: Insuff. Cardiaque', category: 'Profil', type: 'text', template_text: "Insuffisance Cardiaque", is_system: true },
        { code: 'txt_afib', label: 'Texte: FA', category: 'Profil', type: 'text', template_text: "Fibrillation Atriale", is_system: true },

        // Clinical Scripts -> Profil
        { code: 'complications_macro', label: 'Complications Macro (Liste)', category: 'Profil', type: 'script', is_system: true },
        { code: 'complications_micro', label: 'Complications Micro (Liste)', category: 'Profil', type: 'script', is_system: true },
        { code: 'full_complications', label: 'Toutes Complications (Phrases)', category: 'Profil', type: 'script', is_system: true },
        { code: 'list_fdr_cv', label: 'Facteurs de Risque CV (Liste)', category: 'Profil', type: 'script', is_system: true },


        // Biologie
        { code: 'last_weight', label: 'Dernier Poids', category: 'Biologie', type: 'quantitatif', value_path: 'last_weight', is_system: true },
        { code: 'last_height', label: 'Dernière Taille', category: 'Biologie', type: 'quantitatif', value_path: 'last_height', is_system: true },
        { code: 'last_bmi', label: 'Dernier IMC', category: 'Biologie', type: 'quantitatif', value_path: 'last_bmi', is_system: true },
        { code: 'last_hba1c', label: 'Dernière HbA1c', category: 'Biologie', type: 'quantitatif', value_path: 'last_hba1c', is_system: true },
        { code: 'last_ct', label: 'Dernier CT', category: 'Biologie', type: 'quantitatif', value_path: 'last_ct', is_system: true },
        { code: 'last_hdl', label: 'Dernier HDL', category: 'Biologie', type: 'quantitatif', value_path: 'last_hdl', is_system: true },
        { code: 'last_tg', label: 'Dernier TG', category: 'Biologie', type: 'quantitatif', value_path: 'last_tg', is_system: true },
        { code: 'last_non_hdl', label: 'Dernier Non-HDL', category: 'Biologie', type: 'quantitatif', value_path: 'last_non_hdl', is_system: true },
        { code: 'last_ldl', label: 'Dernier LDL', category: 'Biologie', type: 'quantitatif', value_path: 'last_ldl', is_system: true },
        { code: 'last_crea', label: 'Dernière Créatinine', category: 'Biologie', type: 'quantitatif', value_path: 'last_crea', is_system: true },
        { code: 'last_dfg', label: 'Dernier DFG', category: 'Biologie', type: 'quantitatif', value_path: 'last_dfg', is_system: true },
        { code: 'last_rac', label: 'Dernier RAC', category: 'Biologie', type: 'quantitatif', value_path: 'last_rac', is_system: true },
        { code: 'last_sys', label: 'Dernière PAS', category: 'Biologie', type: 'quantitatif', value_path: 'last_sys', is_system: true },
        { code: 'last_dia', label: 'Dernière PAD', category: 'Biologie', type: 'quantitatif', value_path: 'last_dia', is_system: true },
        { code: 'last_score2', label: 'Dernier SCORE2', category: 'Biologie', type: 'quantitatif', value_path: 'last_score2', is_system: true },

        // Date
        { code: 'date_last_val', label: 'Date Dernier Bilan', category: 'Date', type: 'value', value_path: 'date_last_val', is_system: true },
        { code: 'today_date', label: 'Date du jour', category: 'Date', type: 'value', value_path: 'today_date', is_system: true },

        // Examens
        { code: 'followup_hba1c', label: 'Date Suivi HbA1c', category: 'Examens', type: 'value', value_path: 'followup_hba1c', is_system: true },
        { code: 'followup_lipid', label: 'Date Suivi Lipides', category: 'Examens', type: 'value', value_path: 'followup_lipid', is_system: true },
        { code: 'followup_rac', label: 'Date Suivi RAC', category: 'Examens', type: 'value', value_path: 'followup_rac', is_system: true },
        { code: 'followup_ecg', label: 'Date Suivi ECG', category: 'Examens', type: 'value', value_path: 'followup_ecg', is_system: true },
        { code: 'followup_foot', label: 'Date Suivi Pieds', category: 'Examens', type: 'value', value_path: 'followup_foot', is_system: true },
        { code: 'followup_dental', label: 'Date Suivi Dentiste', category: 'Examens', type: 'value', value_path: 'followup_dental', is_system: true },
        { code: 'followup_eye', label: 'Date Suivi Ophtalmo', category: 'Examens', type: 'value', value_path: 'followup_eye', is_system: true },

        // Traitement (Including Allergies/Intolerance now as per user request)
        { code: 'current_treatment', label: 'Traitement Actif (Texte)', category: 'Traitement', type: 'value', value_path: 'current_treatment', is_system: true },
        { code: 'treatment_list', label: 'Liste Traitements (Script)', category: 'Traitement', type: 'script', is_system: true },
        { code: 'patient_allergies', label: 'Allergies', category: 'Traitement', type: 'value', value_path: 'patient_allergies', is_system: true },
        { code: 'patient_intolerances', label: 'Intolérances', category: 'Traitement', type: 'value', value_path: 'patient_intolerances', is_system: true },

        // Signature
        { code: 'user_signature', label: 'Signature Default', category: 'Signature', type: 'text', template_text: "Dr [Nom Médecin] / IDE Asalée", is_system: true },

        // Status Scripts -> Profil
        { code: 'status_glycemic', label: 'Statut Glycémique (Phrase)', category: 'Profil', type: 'script', is_system: true },
        { code: 'status_lipid', label: 'Statut Lipidique (Phrase)', category: 'Profil', type: 'script', is_system: true },
        { code: 'status_bp', label: 'Statut Tensionnel (Phrase)', category: 'Profil', type: 'script', is_system: true },
        { code: 'risk_score', label: 'Risque CV (Phrase/Score)', category: 'Profil', type: 'script', is_system: true },
        { code: 'last_bp', label: 'Dernière Tension (Script)', category: 'Biologie', type: 'script', is_system: true },
    ];

    const stmt = db.prepare('INSERT INTO custom_macros (code, label, category, type, value_path, template_text, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertMany = db.transaction((macros) => {
        for (const m of macros) {
            stmt.run(m.code, m.label, m.category, m.type, m.value_path || null, m.template_text || null, m.is_system ? 1 : 0, now, now);
        }
    });

    insertMany(defaults);
    console.log("Default macros seeded.");
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
    deleteAllEtpSessions,
    // Medications
    createMedication,
    getAllMedications,
    updateMedication,
    deleteMedication,
    // Templates
    createTemplate,
    getAllTemplates,
    updateTemplate,
    deleteTemplate,
    // Macros
    createMacro,
    getAllMacros,
    updateMacro,
    deleteMacro
};
