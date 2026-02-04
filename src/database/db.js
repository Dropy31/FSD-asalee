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
            updated_at TEXT,
            last_viewed_at TEXT
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
            protocol TEXT, -- Added for filtering
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

    // Create table for Patient Groups
    const createGroupsTableQuery = `
        CREATE TABLE IF NOT EXISTS patient_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            etp_session_id INTEGER,
            created_at TEXT,
            updated_at TEXT
        )
    `;
    db.exec(createGroupsTableQuery);

    // Create table for Group Members
    const createGroupMembersTableQuery = `
        CREATE TABLE IF NOT EXISTS patient_group_members (
            group_id INTEGER,
            patient_id INTEGER,
            added_at TEXT,
            PRIMARY KEY (group_id, patient_id),
            FOREIGN KEY (group_id) REFERENCES patient_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        )
    `;
    db.exec(createGroupMembersTableQuery);

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

    // Migration: Add protocol to etp_sessions
    try {
        db.prepare('SELECT protocol FROM etp_sessions LIMIT 1').get();
    } catch (e) {
        console.log('Migrating etp_sessions: adding protocol...');
        db.exec('ALTER TABLE etp_sessions ADD COLUMN protocol TEXT');
    }

    try {
        db.prepare('SELECT is_system FROM document_templates LIMIT 1').get();
    } catch (e) {
        console.log('Migrating document_templates: adding is_system...');
        db.exec('ALTER TABLE document_templates ADD COLUMN is_system BOOLEAN DEFAULT 0');
    }

    // Migration: Add last_viewed_at to patients
    try {
        db.prepare('SELECT last_viewed_at FROM patients LIMIT 1').get();
    } catch (e) {
        console.log('Migrating patients: adding last_viewed_at...');
        db.exec('ALTER TABLE patients ADD COLUMN last_viewed_at TEXT');
        db.exec('UPDATE patients SET last_viewed_at = updated_at');
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

    // Seeding: ETP Sessions
    try {
        // Seed default sessions if they don't exist, but DO NOT delete existing data.
        seedEtpSessions();
    } catch (e) {
        console.error('Error seeding ETP sessions:', e);
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
    const patientWithMeta = { ...patientData, uuid, created_at: now, updated_at: now, last_viewed_at: now };
    const encrypted = cryptoHelper.encrypt(JSON.stringify(patientWithMeta));

    // Store as JSON string of the encrypted object { iv, encryptedData }
    const encryptedString = JSON.stringify(encrypted);

    const stmt = db.prepare(`
        INSERT INTO patients (uuid, encrypted_data, created_at, updated_at, last_viewed_at)
        VALUES (?, ?, ?, ?, ?)
    `);

    const info = stmt.run(uuid, encryptedString, now, now, now);
    return info.lastInsertRowid;
}

function getAllPatients() {
    if (!db) throw new Error('Database not initialized');

    const stmt = db.prepare('SELECT * FROM patients ORDER BY last_viewed_at DESC, updated_at DESC');
    const rows = stmt.all();

    return rows.map(row => {
        try {
            const encryptedObj = JSON.parse(row.encrypted_data);
            const decryptedJson = cryptoHelper.decrypt(encryptedObj);
            const patient = JSON.parse(decryptedJson);
            // Attach the DB ID to the object for reference
            patient.db_id = row.id;
            patient.updated_at = row.updated_at;
            patient.last_viewed_at = row.last_viewed_at;
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

    // Update last_viewed_at
    const now = new Date().toISOString();
    try {
        db.prepare('UPDATE patients SET last_viewed_at = ? WHERE id = ?').run(now, id);
    } catch (e) {
        console.error('Failed to update last_viewed_at', e);
    }

    try {
        const encryptedObj = JSON.parse(row.encrypted_data);
        const decryptedJson = cryptoHelper.decrypt(encryptedObj);
        const patient = JSON.parse(decryptedJson);
        patient.db_id = row.id;
        patient.last_viewed_at = now;
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

    const { title, category, protocol, mode, educational_objectives, prerequisites, content, supports, custom_id } = sessionData;
    const now = new Date().toISOString();

    // Check for duplicate custom_id
    if (custom_id) {
        const existing = db.prepare('SELECT id FROM etp_sessions WHERE custom_id = ?').get(custom_id);
        if (existing) {
            throw new Error(`L'identifiant "${custom_id}" est déjà utilisé.`);
        }
    }

    const stmt = db.prepare(`
        INSERT INTO etp_sessions (custom_id, title, category, protocol, mode, educational_objectives, prerequisites, content, supports, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(custom_id, title, category, protocol, mode, educational_objectives, prerequisites, content, supports, now, now);
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

    const { title, category, protocol, mode, educational_objectives, prerequisites, content, supports, custom_id } = sessionData;
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
        SET custom_id = ?, title = ?, category = ?, protocol = ?, mode = ?, educational_objectives = ?, prerequisites = ?, content = ?, supports = ?, updated_at = ?
        WHERE id = ?
    `);

    stmt.run(custom_id, title, category, protocol, mode, educational_objectives, prerequisites, content, supports, now, id);
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
        // ... (truncated in tool view but assuming correct context)
        // Wait, I cannot see line 618. I should append at the END of the file or use a known block.
        // Let's scroll to end of file to append the new function.
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

// --- Group Operations ---

function createGroup(data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO patient_groups (name, description, etp_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(data.name, data.description, data.etp_session_id || null, now, now);
    return { id: result.lastInsertRowid, ...data, created_at: now, updated_at: now };
}

function getAllGroups() {
    if (!db) throw new Error('Database not initialized');
    const groups = db.prepare('SELECT * FROM patient_groups ORDER BY created_at DESC').all();

    // Enrich with member count
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM patient_group_members WHERE group_id = ?');

    return groups.map(g => {
        const c = countStmt.get(g.id);
        return { ...g, member_count: c.count };
    });
}

function updateGroup(id, data) {
    if (!db) throw new Error('Database not initialized');
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE patient_groups SET name = ?, description = ?, etp_session_id = ?, updated_at = ? WHERE id = ?');
    stmt.run(data.name, data.description, data.etp_session_id || null, now, id);
    return { id, ...data, updated_at: now };
}

function deleteGroup(id) {
    if (!db) throw new Error('Database not initialized');
    return db.prepare('DELETE FROM patient_groups WHERE id = ?').run(id).changes > 0;
}

function addPatientToGroup(groupId, patientId) {
    if (!db) throw new Error('Database not initialized');

    // Check limit
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM patient_group_members WHERE group_id = ?');
    const result = countStmt.get(groupId);
    if (result.count >= 8) {
        throw new Error('Le groupe est complet (max 8 patients).');
    }

    const now = new Date().toISOString();
    try {
        const stmt = db.prepare('INSERT INTO patient_group_members (group_id, patient_id, added_at) VALUES (?, ?, ?)');
        stmt.run(groupId, patientId, now);
        return true;
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            throw new Error('Ce patient est déjà dans le groupe.');
        }
        throw err;
    }
}

function removePatientFromGroup(groupId, patientId) {
    if (!db) throw new Error('Database not initialized');
    return db.prepare('DELETE FROM patient_group_members WHERE group_id = ? AND patient_id = ?').run(groupId, patientId).changes > 0;
}

function getPatientsInGroup(groupId) {
    if (!db) throw new Error('Database not initialized');

    // We need to join with patients table. 
    // However, patients data is encrypted. We must fetch ID and Encrypted Data, then decrypt.
    const stmt = db.prepare(`
        SELECT p.id, p.encrypted_data, p.updated_at, p.last_viewed_at, m.added_at
        FROM patient_group_members m
        JOIN patients p ON m.patient_id = p.id
        WHERE m.group_id = ?
        ORDER BY p.last_viewed_at DESC
    `);

    const rows = stmt.all(groupId);

    return rows.map(row => {
        try {
            const encryptedObj = JSON.parse(row.encrypted_data);
            const decryptedJson = cryptoHelper.decrypt(encryptedObj);
            const patient = JSON.parse(decryptedJson);
            patient.db_id = row.id;
            patient.added_at = row.added_at;
            return patient;
        } catch (err) {
            console.error(`Failed to decrypt patient ${row.id} in group:`, err);
            return null;
        }
    }).filter(p => p !== null);
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
    deleteMacro,
    // Groups
    createGroup,
    getAllGroups,
    updateGroup,
    deleteGroup,
    addPatientToGroup,
    removePatientFromGroup,
    getPatientsInGroup,
    // Utils
    seedEtpSessions
};

function seedEtpSessions() {
    console.log("Seeding RICH ETP Sessions (DT2 / Mixed Modes) - Check Mode...");
    const now = new Date().toISOString();

    const rawSessions = [
        {
            original_id: "ALIM-001",
            mode: "Collective",
            category: "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels",
            title: "Comment équilibrer mes repas au quotidien sans devoir peser tous mes aliments ?",
            educational_objectives: "• Identifier les 3 familles d'aliments d'un repas équilibré• Composer une assiette visuellement équilibrée",
            prerequisites: "Aucun",
            content: "• Intro : Photolangage \"Mon repas d'hier\" (partage sans jugement).• Dév : Jeu de l'Assiette Vide. Les patients placent des aliments factices (plastique ou photos) pour remplir les proportions : 1/2 légumes, 1/4 féculents, 1/4 protéines.• Concl : Tour de table : \"Ce que je vais changer dans mon assiette ce soir\".",
            supports: "• Aliments factices ou cartes images• Assiettes en carton• Tableau blanc"
        },
        {
            original_id: "ALIM-002",
            mode: "Collective",
            category: "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels",
            title: "Glucides, index glycémique et charge glycémique : quels féculents choisir pour éviter les pics ?",
            educational_objectives: "• Différencier les sources de glucides• Classer les aliments selon leur Index Glycémique (IG)",
            prerequisites: "Connaître les groupes d'aliments",
            content: "• Intro : Brainstorming \"Qu'est-ce qui fait monter le sucre ?\".• Dév : Jeu \"Le Lièvre et la Tortue\". Trier des cartes d'aliments sur une ligne allant de \"Très rapide (IG haut)\" à \"Lent (IG bas)\". Discussion sur la cuisson et les fibres.• Concl : Remise d'une fiche mémo \"Les astuces pour baisser l'IG\".",
            supports: "• Cartes aliments (ex: purée vs pommes de terre vapeur)• Image Lièvre et Tortue"
        },
        {
            original_id: "ALIM-003",
            mode: "Collective",
            category: "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels",
            title: "Comment faire mes courses : décryptage des étiquettes et pièges du marketing ?",
            educational_objectives: "• Repérer la teneur en glucides pour 100g• Identifier les dénominations du sucre",
            prerequisites: "Savoir lire le français courant",
            content: "• Intro : \"Le juste prix du sucre\". Deviner le nombre de morceaux de sucre dans des produits industriels.• Dév : Atelier Loupe. Analyse d'emballages réels apportés par les patients. Comparaison de deux produits similaires (ex: yaourt aux fruits vs nature).• Concl : Synthèse : \"Les 3 choses à regarder avant d'acheter\".",
            supports: "• Emballages vides (biscuits, plats préparés)• Morceaux de sucre• Loupes"
        },
        {
            original_id: "ALIM-004",
            mode: "Collective",
            category: "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels",
            title: "Cuisiner gourmand et adapté au diabète : comment modifier mes recettes traditionnelles ?",
            educational_objectives: "• Adapter une recette en réduisant l'IG et les graisses• Utiliser des alternatives aux sucres et gras",
            prerequisites: "Notions de base sur les glucides",
            content: "• Intro : \"Ma recette fétiche\". Chacun cite un plat qu'il n'ose plus manger.• Dév : Le \"Makeover\" culinaire. Par groupe, réécriture d'une recette traditionnelle (ex: bœuf bourguignon, gâteau au yaourt) en remplaçant les ingrédients critiques (ex: crème entière -> crème légère, farine blanche -> complète).• Concl : Dégustation (si possible) ou échange de fiches recettes modifiées.",
            supports: "• Fiches recettes traditionnelles• Tableau des équivalences culinaires"
        },
        {
            original_id: "ALIM-005",
            mode: "Collective",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "Comment gérer les repas festifs, les sorties au restaurant et les apéritifs sans culpabiliser ?",
            educational_objectives: "• Planifier des stratégies préventives avant un écart• Adapter les doses ou l'activité physique après un excès",
            prerequisites: "Connaissance des groupes d'aliments",
            content: "• Intro : Le chapeau à questions : piocher une situation (mariage, Noël, pizzeria).• Dév : Jeu de rôle \"Au restaurant\". Choisir sur une carte réelle le menu le plus judicieux. Débat sur l'alcool et les amuse-bouches. Stratégie de l'activité physique post-prandiale.• Concl : Création d'une \"Carte Joker\" personnelle (mon plan pour la prochaine fête).",
            supports: "• Cartes de menus de restaurant• Images d'apéritifs"
        },
        {
            original_id: "ALIM-006",
            mode: "Collective",
            category: "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels",
            title: "Les graisses et mon cœur : comment différencier le bon du mauvais cholestérol dans mon assiette ?",
            educational_objectives: "• Identifier les sources d'acides gras saturés et insaturés• Citer 2 bénéfices des \"bonnes graisses\"",
            prerequisites: "Aucun",
            content: "• Intro : Quiz Vrai/Faux sur le gras (ex: \"L'huile d'olive fait grossir ?\").• Dév : Atelier \"Tube à essai\". Visualiser la quantité de graisse dans la charcuterie vs poisson gras. Classement des matières grasses (Beurre, Huile, Margarine, Crème).• Concl : Mémo : \"Mes amis pour le cœur\".",
            supports: "• Tubes à essai avec huile colorée• Images de sources de lipides"
        },
        {
            original_id: "ALIM-007",
            mode: "Individuelle",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Grignotages et pulsions sucrées : comment gérer ma faim et mes envies émotionnelles ?",
            educational_objectives: "• Différencier la faim physiologique de l'envie émotionnelle• Identifier un déclencheur de grignotage",
            prerequisites: "Aucun",
            content: "• Intro : Journal alimentaire simplifié : repérage des horaires de prise.• Dév : L'Arbre des Causes. Analyser une prise alimentaire hors repas (Ennui ? Stress ? Fatigue ?). Recherche d'activités de diversion (boire un thé, marcher, appeler un ami).• Concl : Contrat : \"La prochaine fois que j'ai envie de grignoter, je teste...\".",
            supports: "• Journal des prises alimentaires• Liste d'activités plaisirs non alimentaires"
        },
        {
            original_id: "ALIM-008",
            mode: "Collective",
            category: "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels",
            title: "Edulcorants, produits \"sans sucre\" et boissons : sont-ils vraiment des alliés pour ma santé ?",
            educational_objectives: "• Analyser l'intérêt réel des produits \"diététiques\"• Identifier les boissons sucrées cachées",
            prerequisites: "Lecture d'étiquettes (ALIM-003)",
            content: "• Intro : Dégustation à l'aveugle (sirop 0% vs normal) ou comparaison visuelle.• Dév : Le Tribunal des Produits. On juge des produits (chocolat light, biscuits diabétiques) : Prix, Goût, Composition. Verdict : Coupable ou Innocent ?• Concl : Focus sur l'eau et les aromatisations naturelles.",
            supports: "• Bouteilles vides (sodas, eaux, jus)• Produits \"light\" et standards"
        },
        {
            original_id: "APA-001",
            mode: "Collective",
            category: "Activité physique : Intégrer une activité physique régulière et lutter contre la sédentarité",
            title: "Bouger plus au quotidien : comment intégrer l'activité physique sans forcément s'inscrire au sport ?",
            educational_objectives: "• Distinguer \"Sport\" et \"Activité Physique\"• Lister 3 occasions de bouger dans sa journée type",
            prerequisites: "Aucun",
            content: "• Intro : Tour de table \"Mon activité préférée enfant\".• Dév : La ligne de vie sédentaire. On trace une journée type au tableau et on cherche les \"trous\" pour bouger (escaliers, jardinage, descendre du bus plus tôt). Présentation des recommandations (30 min/j).• Concl : Engagement : \"Dès demain, je...\".",
            supports: "• Paperboard• Images d'activités quotidiennes"
        },
        {
            original_id: "APA-002",
            mode: "Individuelle",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Activité physique et sécurité : comment éviter l'hypoglycémie pendant et après l'effort ?",
            educational_objectives: "• Adapter la prise de glucides selon l'effort• Reconnaître les signes d'hypoglycémie d'effort",
            prerequisites: "Connaître les signes d'hypoglycémie",
            content: "• Intro : Récit d'expérience (peurs ou vécu d'hypo).• Dév : Jeu de simulation. \"Je pars marcher 2h, que mets-je dans mon sac ?\". Analyse des besoins en resucrage. Notion de baisse d'insuline (pour patients concernés).• Concl : Constitution de la \"Trousse Sport\".",
            supports: "• Sac à dos• Aliments de resucrage• Lecteur glycémie"
        },
        {
            original_id: "APA-003",
            mode: "Individuelle",
            category: "Activité physique : Intégrer une activité physique régulière et lutter contre la sédentarité",
            title: "Quelles activités choisir en fonction de mes douleurs (dos, genoux) et de ma condition physique ?",
            educational_objectives: "• Identifier des activités à faible impact articulaire• Adapter l'intensité à son ressenti (essoufflement)",
            prerequisites: "Aucun",
            content: "• Intro : Évaluation de la douleur (EVA) et des freins.• Dév : Démonstration pratique adaptée. Mouvements sur chaise, utilisation d'élastiques doux, marche nordique. Test de la parole (être capable de parler en bougeant).• Concl : Choix d'une activité \"amie\" de mes douleurs.",
            supports: "• Chaises• Élastiques• Bâtons de marche"
        },
        {
            original_id: "APA-004",
            mode: "Collective",
            category: "Activité physique : Intégrer une activité physique régulière et lutter contre la sédentarité",
            title: "Comment utiliser les objets connectés (montres, podomètres) pour me motiver ?",
            educational_objectives: "• Fixer un objectif de pas progressif• Utiliser un outil de suivi simple",
            prerequisites: "Aucun",
            content: "• Intro : \"Qui a quoi ?\" Recensement des smartphones et gadgets des patients.• Dév : Atelier Démo. Installation d'une appli podomètre gratuite. Lecture des données. Challenge de groupe \"Le tour de la ville en pas cumulés\".• Concl : Relevé du nombre de pas de référence sur une semaine.",
            supports: "• Smartphones• Podomètres simples"
        },
        {
            original_id: "APA-005",
            mode: "Individuelle",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Comment construire un programme d'activité réaliste qui tienne sur la durée ?",
            educational_objectives: "• Formuler un objectif SMART• Identifier les ressources locales (associations, parcs)",
            prerequisites: "Aucun",
            content: "• Intro : Bilan des tentatives passées (réussites/échecs).• Dév : Méthode SMART (Spécifique, Mesurable, Atteignable, Réaliste, Temporel). Co-construction d'un planning hebdomadaire visuel.• Concl : Signature du \"Contrat de mouvement\".",
            supports: "• Planning vierge• Carte de la ville (parcs, clubs)"
        },
        {
            original_id: "APA-006",
            mode: "Collective",
            category: "Activité physique : Intégrer une activité physique régulière et lutter contre la sédentarité",
            title: "Le renforcement musculaire : pourquoi est-ce aussi important que la marche pour mon diabète ?",
            educational_objectives: "• Expliquer le lien entre muscle et consommation de glucose• Réaliser 3 exercices de renforcement simples",
            prerequisites: "Aucun",
            content: "• Intro : Analogie \"Le moteur et le réservoir\". (Le muscle est le moteur qui brûle le sucre).• Dév : Circuit training doux. Lever de chaise, presser une balle, monter sur la pointe des pieds. Correction des postures.• Concl : Remise d'un livret d'exercices à la maison.",
            supports: "• Bouteilles d'eau (haltères)• Tapis de sol• Balles mousses"
        },
        {
            original_id: "SURV-001",
            mode: "Collective",
            category: "La surveillance glycémique : Maîtriser l'autosurveillance de la glycémie",
            title: "Hémoglobine glyquée (HbA1c) et dextros : comment comprendre la différence et mes objectifs ?",
            educational_objectives: "• Différencier glycémie capillaire et HbA1c• Citer son objectif personnalisé d'HbA1c",
            prerequisites: "Aucun",
            content: "• Intro : Métaphore de la photo et du film. (Dextro = photo instantanée / HbA1c = le film des 3 mois).• Dév : Schéma interactif \"Le glissement du sucre sur les globules rouges\". Visualisation de la correspondance HbA1c / Glycémie moyenne.• Concl : Chaque patient note ses derniers résultats et ses objectifs sur son carnet.",
            supports: "• Schéma hématie/sucre• Tableau correspondance HbA1c"
        },
        {
            original_id: "SURV-002",
            mode: "Collective",
            category: "La surveillance glycémique : Maîtriser l'autosurveillance de la glycémie",
            title: "Au-delà du chiffre : quels facteurs (stress, sommeil, maladie) font varier ma glycémie sans que je mange ?",
            educational_objectives: "• Identifier 3 facteurs non alimentaires influençant la glycémie• Dédramatiser un chiffre élevé inexpliqué",
            prerequisites: "Savoir faire une glycémie",
            content: "• Intro : Brainstorming \"Pourquoi ça monte ?\".• Dév : Nuage de mots/cartes causes. Trier les cartes : Alimentation, Activité, Stress, Douleur, Médicaments, Sommeil. Discussion sur l'hormone du stress (Cortisol).• Concl : \"Je ne suis pas qu'un chiffre\".",
            supports: "• Cartes \"Facteurs influents\"• Tableau blanc"
        },
        {
            original_id: "SURV-003",
            mode: "Collective",
            category: "La surveillance glycémique : Maîtriser l'autosurveillance de la glycémie",
            title: "Comment interpréter mes résultats pour adapter mon alimentation ou mes doses d'insuline ?",
            educational_objectives: "• Analyser une courbe glycémique type• Proposer une action correctrice face à une tendance",
            prerequisites: "Connaissance des cibles glycémiques",
            content: "• Intro : Présentation de profils anonymes (Mr A : hyperglycémie à jeun, Mme B : hypo post-repas).• Dév : Enquête policière. Par petits groupes, analyser les carnets et trouver le \"coupable\" (repas trop riche ? oubli comprimé ? sport intense ?).• Concl : Synthèse sur la démarche d'analyse (Observer -> Comprendre -> Agir).",
            supports: "• Exemples de carnets de surveillance• Stylos couleurs"
        },
        {
            original_id: "SURV-004",
            mode: "Individuelle",
            category: "La surveillance glycémique : Maîtriser l'autosurveillance de la glycémie",
            title: "La mesure continue du glucose (capteurs) : comment l'utiliser sans devenir obsédé par les courbes ?",
            educational_objectives: "• Interpréter les flèches de tendance• Poser et retirer le capteur correctement",
            prerequisites: "Prescription de capteurs",
            content: "• Intro : Expression du vécu (libération ou fil à la patte ?).• Dév : Manipulation. Pose sur bras en mousse ou sur soi. Explication du décalage interstitiel (retard de 10-15 min vs sang). Gestion des alarmes.• Concl : Règles d'or : \"On ne scanne pas toutes les 5 minutes\".",
            supports: "• Kit de démonstration capteur• Bras en mousse"
        },
        {
            original_id: "SURV-005",
            mode: "Individuelle",
            category: "La surveillance glycémique : Maîtriser l'autosurveillance de la glycémie",
            title: "Technique d'autocontrôle : suis-je sûr de faire les bons gestes pour avoir un résultat fiable ?",
            educational_objectives: "• Réaliser une glycémie capillaire selon les règles d'hygiène• Vérifier le bon fonctionnement du lecteur",
            prerequisites: "Aucun",
            content: "• Intro : \"Montrez-moi comment vous faites habituellement\".• Dév : Checklist d'observation. Lavage mains, séchage, piqûre sur le côté, goutte suffisante. Mise en évidence des erreurs classiques (mains sales, alcool, pincer le doigt).• Concl : Remise d'un diplôme \"Expert Dextro\" (ludique).",
            supports: "• Lecteur, bandelettes, autopiqueur• Savon, eau"
        },
        {
            original_id: "SURV-006",
            mode: "Collective",
            category: "La surveillance glycémique : Maîtriser l'autosurveillance de la glycémie",
            title: "Tenir un carnet de surveillance (papier ou numérique) : est-ce vraiment utile pour mon suivi ?",
            educational_objectives: "• Comprendre l'utilité des annotations pour le médecin• Choisir un support adapté à son mode de vie",
            prerequisites: "Savoir lire/écrire",
            content: "• Intro : \"Le carnet idéal\". Débat sur les contraintes.• Dév : Comparatif. Présentation de carnets papiers, applications smartphones. Exercice : Remplir une journée type avec des événements (repas festif, marche).• Concl : Choix de l'outil pour les 3 prochains mois.",
            supports: "• Modèles de carnets variés• Tablettes avec apps démo"
        },
        {
            original_id: "TRAIT-001",
            mode: "Collective",
            category: "L'observance médicamenteuse : Comprendre et prendre son traitement médicamenteux de manière régulière",
            title: "Comprimés ou injectables : comment agissent exactement mes médicaments dans mon corps ?",
            educational_objectives: "• Localiser le mode d'action de son traitement (Foie, Pancréas, Rein, Intestin)• Expliquer pourquoi le traitement évolue",
            prerequisites: "Aucun",
            content: "• Intro : Silhouette du corps humain avec organes aimantés.• Dév : Puzzle thérapeutique. Placer les étiquettes de médicaments (Metformine, Sulfamides, Insuline, GLP1) sur l'organe cible. Explication simplifiée (La clé, le verrou, l'usine).• Concl : \"Mon médicament n'est pas une punition, c'est une aide pour...\".",
            supports: "• Silhouette géante• Étiquettes médicaments géantes"
        },
        {
            original_id: "TRAIT-002",
            mode: "Individuelle",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Passer à l'insuline : pourquoi maintenant, et est-ce un échec de ma part ?",
            educational_objectives: "• Verbaliser ses craintes liées à l'insuline• Comprendre l'histoire naturelle du diabète",
            prerequisites: "Diagnostic de diabète type 2 ancien",
            content: "• Intro : Photolangage spécifique \"L'insuline pour moi c'est...\" (peur, piqûre, gravité, fin).• Dév : La courbe de déclin. Expliquer l'épuisement progressif du pancréas. \"Ce n'est pas vous qui avez échoué, c'est le pancréas qui est fatigué\". Manipulation du stylo (capuchon, aiguille) pour démystifier l'objet.• Concl : Bilan émotionnel après la séance.",
            supports: "• Stylo insuline démo (sans aiguille)• Schéma fonction pancréatique"
        },
        {
            original_id: "TRAIT-003",
            mode: "Individuelle",
            category: "L'observance médicamenteuse : Comprendre et prendre son traitement médicamenteux de manière régulière",
            title: "La technique d'injection d'insuline : comment éviter les douleurs, les bleus et les lipodystrophies ?",
            educational_objectives: "• Réaliser une injection sous-cutanée conforme• Identifier les zones de rotation",
            prerequisites: "Prescription d'injectable",
            content: "• Intro : Inspection des zones d'injection (palpation lipodystrophies).• Dév : Atelier pratique. Purge, pli (si besoin), injection à 90°, temps de maintien (10s). Utilisation d'un coussin ou ventre en mousse. Création d'un gabarit de rotation.• Concl : Remise d'un plan de rotation des sites.",
            supports: "• Stylos, aiguilles test• Ventre en mousse/Coussin• Grille de rotation"
        },
        {
            original_id: "TRAIT-004",
            mode: "Collective",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "Oublis, horaires décalés et effets secondaires : comment gérer les aléas de mon traitement ?",
            educational_objectives: "• Décrire la conduite à tenir en cas d'oubli• Identifier un effet secondaire nécessitant un avis médical",
            prerequisites: "Connaître son traitement",
            content: "• Intro : Jeu de l'oie \"La vie du patient\". Cases \"Oubli matin\", \"Diarrhée\", \"Repas sauté\".• Dév : Tirage de cartes \"Situation Problème\". Le groupe propose des solutions validées par l'infirmière. Focus sur Metformine (digestif) et Sulfamides (hypo).• Concl : Création d'une fiche réflexe personnalisée.",
            supports: "• Plateau de jeu• Cartes situations• Dés et pions"
        },
        {
            original_id: "TRAIT-005",
            mode: "Individuelle",
            category: "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels",
            title: "L'insuline fonctionnelle : comment adapter ma dose d'insuline rapide à ce que je mange ? (Niveau avancé)",
            educational_objectives: "• Estimer la quantité de glucides d'un repas• Calculer la dose d'insuline selon son ratio",
            prerequisites: "Insuline rapide + Capacité calcul",
            content: "• Intro : \"Combien de glucides dans ce repas ?\".• Dév : Entraînement au calcul. Utilisation d'abaques ou d'applications. Exercices mathématiques simples : (Glucides / Ratio) + Correction. Simulation de repas variés.• Concl : Essai sur le prochain repas avec supervision à distance.",
            supports: "• Guide des glucides• Calculatrice• Photos de repas"
        },
        {
            original_id: "TRAIT-006",
            mode: "Collective",
            category: "L'observance médicamenteuse : Comprendre et prendre son traitement médicamenteux de manière régulière",
            title: "Automédication et phytothérapie : quels sont les dangers d'interaction avec mon traitement diabétique ?",
            educational_objectives: "• Citer un risque lié à l'automédication (AINS, cortisone)• Adopter le réflexe d'informer le pharmacien",
            prerequisites: "Aucun",
            content: "• Intro : \"La boite à pharmacie de grand-mère\". Plantes, huiles essentielles, rhume.• Dév : Quiz \"Ami ou Ennemi ?\". Sirop pour la toux (sucre), Corticoïdes (hyperglycémie), Soins des pieds corrosicides (danger). Focus sur le Millepertuis ou le Pamplemousse (interactions).• Concl : Règle d'or : \"Je dis toujours que je suis diabétique\".",
            supports: "• Boites de médicaments courants• Planches plantes"
        },
        {
            original_id: "TRAIT-007",
            mode: "Collective",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "Comment préparer ma trousse à pharmacie pour partir en voyage ou en déplacement sereinement ?",
            educational_objectives: "• Lister le matériel indispensable pour un voyage• Anticiper les besoins administratifs (ordonnance, douane)",
            prerequisites: "Aucun",
            content: "• Intro : \"Je pars sur une île déserte...\".• Dév : La Valise Témoin. Remplir une valise avec des objets réels. Ne pas oublier : Ordonnance DCI, double du traitement, matériel de surveillance, kit hypo, carte diabétique.• Concl : Checklist de voyage remise aux participants.",
            supports: "• Valise• Matériel médical et administratif factice"
        },
        {
            original_id: "SOL-001",
            mode: "Collective",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "L'hypoglycémie de A à Z : ressentir, confirmer et resucrer efficacement",
            educational_objectives: "• Reconnaître ses propres signes d'alerte• Appliquer la règle du resucrage (15g de sucre)",
            prerequisites: "Traitement à risque d'hypo",
            content: "• Intro : \"Ça fait quoi une hypo ?\". Partage de sensations (tremblements, sueurs, faim).• Dév : Atelier pratique \"Les 15 grammes\". Peser ou choisir les bons aliments pour atteindre 15g de glucides rapides (3 sucres, 1 jus, etc.). Différencier sucre rapide et lent (pas de chocolat car trop gras = lent).• Concl : Mise en situation : \"Je fais une hypo maintenant, je fais quoi ?\".",
            supports: "• Sucre en morceaux, jus, miel• Balance alimentaire"
        },
        {
            original_id: "SOL-002",
            mode: "Individuelle",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "Hyperglycémie et acétonémie : quand faut-il s'inquiéter et quelle conduite tenir ?",
            educational_objectives: "• Identifier les signes d'hyperglycémie et cétose• Réaliser une recherche d'acétone (urine ou sang)",
            prerequisites: "Diabète déséquilibré ou insuline",
            content: "• Intro : Rappel des seuils d'alerte (ex: > 2.50 g/L).• Dév : Algorithme décisionnel. Si Glycémie > X -> Acétone ? -> Si oui, Insuline / Urgences. Si non, Hydratation. Démonstration bandelettes urinaires ou lecteur cétonémie.• Concl : Remise du protocole d'urgence personnalisé.",
            supports: "• Bandelettes cétonurie/cétonémie• Fiche urgence"
        },
        {
            original_id: "SOL-003",
            mode: "Collective",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "Grippe, gastro, infection : comment adapter mon diabète pendant les jours de maladie ?",
            educational_objectives: "• Comprendre l'impact de l'infection sur la glycémie• Adapter l'hydratation et la surveillance",
            prerequisites: "Aucun",
            content: "• Intro : Scénario \"Je suis cloué au lit avec 39°C de fièvre\".• Dév : Brainstorming. Faut-il arrêter l'insuline si je ne mange pas ? (NON). Faut-il arrêter la metformine si je suis déshydraté ? (OUI). Règles des jours de maladie (surveillance accrue, hydratation, alimentation fractionnée).• Concl : Fiche mémo \"Jours de maladie\".",
            supports: "• Images thermomètre, soupe, médicaments"
        },
        {
            original_id: "SOL-004",
            mode: "Individuelle",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Conduite automobile et métiers à risque : quelles sont mes obligations et comment rouler en sécurité ?",
            educational_objectives: "• Citer la réglementation du permis de conduire• Vérifier sa glycémie avant de prendre le volant",
            prerequisites: "Titulaire du permis",
            content: "• Intro : \"Avez-vous déclaré votre diabète en préfecture ?\".• Dév : Analyse de la législation. Glycémie avant départ, pause toutes les 2h, sucre à portée de main dans l'habitacle. Risque légal en cas d'accident.• Concl : Engagement à mettre du sucre dans la boîte à gants.",
            supports: "• Code de la route (extrait)• Kit voiture"
        },
        {
            original_id: "SOL-005",
            mode: "Individuelle",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "Voyages et décalage horaire : comment recalculer mes prises de traitement ?",
            educational_objectives: "• Adapter les horaires d'injection lors d'un vol long-courrier• Gérer la conservation de l'insuline",
            prerequisites: "Projet de voyage > 3h décalage",
            content: "• Intro : Analyse du billet d'avion (Heure départ/arrivée).• Dév : Exercice sur cadran horaire. Vers l'Ouest (journée plus longue) = ajout insuline/repas. Vers l'Est (journée plus courte) = réduction. Gestion des repas plateau.• Concl : Plan de vol thérapeutique écrit.",
            supports: "• Cadran horaire double (Départ/Arrivée)• Billet d'avion factice"
        },
        {
            original_id: "SOL-006",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Jeûne (religieux ou intermittent) : est-ce compatible avec mon diabète et comment m'organiser ?",
            educational_objectives: "• Identifier les risques liés au jeûne (hypo/déshydratation)• Planifier la rupture du jeûne de manière équilibrée",
            prerequisites: "Projet de jeûne (Ramadan/Carême)",
            content: "• Intro : Respect des croyances et évaluation du risque médical (classification rouge/orange/vert).• Dév : \"Le repas de rupture idéal\". Éviter l'orgie de sucre. Inversion des prises médicamenteuses (conseil médical requis). Signes imposant la rupture immédiate du jeûne.• Concl : Accord patient/soignant sur les limites de sécurité.",
            supports: "• Calendrier du jeûne• Images de repas traditionnels"
        },
        {
            original_id: "SOL-007",
            mode: "Collective",
            category: "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables",
            title: "Panne de matériel ou perte de médicaments : quel est mon plan B en cas d'urgence ?",
            educational_objectives: "• Identifier les interlocuteurs de secours• Constituer un stock de sécurité",
            prerequisites: "Aucun",
            content: "• Intro : \"C'est dimanche, la pharmacie est fermée, mon stylo est cassé\".• Dév : Cartographie des ressources. Pharmacie de garde, hôpital, infirmière, voisins. Avoir une ordonnance de secours scannée sur son téléphone.• Concl : Enregistrement des numéros utiles dans le téléphone.",
            supports: "• Téléphones portables• Carte des structures de soins"
        },
        {
            original_id: "PREV-001",
            mode: "Collective",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Mes pieds : comment les examiner moi-même et quels soins réaliser pour éviter les plaies ?",
            educational_objectives: "• Réaliser une inspection complète des pieds• Identifier les situations à risque (marche pieds nus, coricide)",
            prerequisites: "Capacité physique à atteindre ses pieds",
            content: "• Intro : Enlever ses chaussures/chaussettes. Inspection croisée (ou miroir).• Dév : Atelier pratique. Utilisation d'un miroir télescopique. Test de sensibilité au monofilament (démonstration). Triage des \"bons\" et \"mauvais\" outils (ciseaux pointus vs lime carton).• Concl : Les 10 commandements du pied diabétique.",
            supports: "• Miroirs• Monofilaments• Trousse de toilette (crème, lime)"
        },
        {
            original_id: "PREV-002",
            mode: "Collective",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Rétinopathie, néphropathie, neuropathie : comprendre les complications pour mieux les prévenir.",
            educational_objectives: "• Expliquer le lien entre hyperglycémie chronique et atteinte des vaisseaux• Citer la fréquence du suivi (Fond d'œil, reins)",
            prerequisites: "Aucun",
            content: "• Intro : Analogie \"Le système d'arrosage entartré\" (vaisseaux bouchés par le sucre).• Dév : Visite guidée du corps. Images simplifiées de la rétine et du rein. Explication du mécanisme indolore (\"Le diabète ne fait pas mal, c'est son piège\").• Concl : Remplissage du \"Passeport de suivi\" (dates des derniers examens).",
            supports: "• Planches anatomiques simplifiées• Passeport de suivi diabète"
        },
        {
            original_id: "PREV-003",
            mode: "Collective",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Le risque cardiovasculaire global : pourquoi surveiller aussi ma tension et mon cholestérol ?",
            educational_objectives: "• Identifier les facteurs de risque cumulés (Tabac, HTA, Cholestérol)• Comprendre la synergie des risques",
            prerequisites: "Aucun",
            content: "• Intro : Le mur de briques. Chaque facteur de risque est une brique qui construit le mur de l'accident cardiaque.• Dév : Atelier Tension. Apprendre à prendre sa tension (si autotensiomètre). Explication du LDL (mauvais cholestérol) comme \"camion poubelle en grève\".• Concl : Objectifs chiffrés personnalisés (Tension < 14/9).",
            supports: "• Tensiomètres• Briques en carton (jeu de construction)"
        },
        {
            original_id: "PREV-004",
            mode: "Collective",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Santé bucco-dentaire : quel est le lien avec mon équilibre glycémique ?",
            educational_objectives: "• Expliquer le lien bidirectionnel Diabète <-> Gencives• Adopter une technique de brossage efficace",
            prerequisites: "Aucun",
            content: "• Intro : \"Quand avez-vous vu le dentiste pour la dernière fois ?\".• Dév : Démonstration sur mâchoire géante. Brossage, fil dentaire/brossettes. Explication : l'infection des gencives déséquilibre le diabète.• Concl : Planification du RDV annuel dentaire (souvent gratuit avec ALD).",
            supports: "• Mâchoire géante + Brosse• Fil dentaire et brossettes"
        },
        {
            original_id: "PREV-005",
            mode: "Individuelle",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Tabac et diabète : pourquoi l'association est-elle explosive et quelles aides pour arrêter ?",
            educational_objectives: "• Identifier les bénéfices immédiats de l'arrêt• Évaluer sa motivation à l'arrêt",
            prerequisites: "Fumeur actif",
            content: "• Intro : Test de Fagerström (dépendance) et échelle de motivation (0 à 10).• Dév : La Balance Décisionnelle. Noter les avantages à fumer vs les inconvénients. Et les avantages à arrêter vs les peurs. Information sur les substituts nicotiniques (remboursés).• Concl : Proposition de soutien (ne pas forcer, porte ouverte).",
            supports: "• Test Fagerström• Documentation tabac info service"
        },
        {
            original_id: "PREV-006",
            mode: "Collective",
            category: "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques",
            title: "Vaccination et suivi annuel : quel est mon calendrier de prévention idéal ?",
            educational_objectives: "• Connaître les vaccins recommandés (Grippe, Pneumocoque, Tétanos, COVID)• Planifier ses rendez-vous annuels",
            prerequisites: "Aucun",
            content: "• Intro : Quiz \"Vrai/Faux sur les vaccins\".• Dév : Le Calendrier Perpétuel. Placer le examens sur une année type (Ophtalmo, Cardiologue, Dentiste, Prise de sang, Vaccin grippe).• Concl : Remise d'un calendrier magnétique ou fiche récapitulative.",
            supports: "• Calendrier géant• Étiquettes examens"
        },
        {
            original_id: "PREV-007",
            mode: "Individuelle",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Dysfonction érectile et sécheresse intime : osons parler des troubles sexuels liés au diabète.",
            educational_objectives: "• Oser aborder le sujet avec un professionnel• Connaître l'existence de traitements",
            prerequisites: "Climat de confiance établi",
            content: "• Intro : Questions ouvertes bienveillantes ou utilisation de cartes \"Idées reçues\" pour lancer le sujet sans gêne directe.• Dév : Explication physiologique (vaisseaux et nerfs). Dédramatisation (c'est une complication fréquente, pas un tabou). Présentation des options thérapeutiques médicales.• Concl : Orientation vers médecin traitant ou spécialiste si demande.",
            supports: "• Schémas anatomiques• Brochures informatives discrètes"
        },
        {
            original_id: "VIVRE-001",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Comment expliquer ma maladie à mon entourage pour qu'il soit un soutien et non une contrainte ?",
            educational_objectives: "• Exprimer ses besoins de soutien de façon assertive• Identifier les attitudes toxiques et aidantes",
            prerequisites: "Aucun",
            content: "• Intro : \"La police de l'assiette\". Témoignages sur les remarques des proches (\"Tu as le droit de manger ça ?\").• Dév : Jeu de rôles. Scène 1 : Le proche contrôlant. Scène 2 : Le proche indifférent. Scène 3 : Le proche partenaire. Entraînement à dire \"Merci de ton aide, mais c'est moi qui gère\".• Concl : Invitation possible d'un proche à une prochaine séance.",
            supports: "• Scénarios écrits"
        },
        {
            original_id: "VIVRE-002",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Diabète et travail : faut-il en parler à mon employeur et comment gérer les pots entre collègues ?",
            educational_objectives: "• Connaître ses droits au travail• Gérer la convivialité professionnelle",
            prerequisites: "Actif professionnellement",
            content: "• Intro : Sondage \"Qui l'a dit à son chef ?\". Avantages et inconvénients.• Dév : Étude de cas. \"Pot de départ à 11h\". Comment participer sans déséquilibrer sa glycémie ? Stratégies : verre d'eau, picorer, décaler le repas. Point sur la Médecine du Travail.• Concl : Élaboration d'une phrase type pour refuser poliment une part de gâteau ou expliquer son besoin de pause.",
            supports: "• Aucune"
        },
        {
            original_id: "VIVRE-003",
            mode: "Individuelle",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Le \"burn-out\" du diabétique : comment repérer l'épuisement et retrouver de la motivation ?",
            educational_objectives: "• Identifier les signes de détresse liée au diabète• Accepter de demander de l'aide psychologique",
            prerequisites: "Diagnostic de diabète ancien",
            content: "• Intro : Échelle du fardeau (PAID scale simplifiée).• Dév : La cocotte-minute. Lister ce qui met la pression (chiffres, médecins, famille, complications). Ouvrir la soupape : qu'est-ce qui fait du bien ? (Lâcher prise sur certains objectifs, parler).• Concl : Fixer un \"micro-objectif\" plaisir, hors diabète.",
            supports: "• Questionnaire PAID• Image cocotte-minute"
        },
        {
            original_id: "VIVRE-004",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Image de soi : comment accepter mon corps avec la maladie et les contraintes du traitement ?",
            educational_objectives: "• Verbaliser son ressenti corporel• Revaloriser son image au-delà de la maladie",
            prerequisites: "Aucun",
            content: "• Intro : Photolangage \"Mon corps et moi\".• Dév : La silhouette. Dessiner ce qu'on aime chez soi et ce que le diabète a changé (poids, traces piqûres). Travail sur l'acceptation et la bienveillance.• Concl : Cercle de compliments entre participants.",
            supports: "• Photos variées• Feuilles A3 et feutres"
        },
        {
            original_id: "VIVRE-005",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Gérer le stress et les émotions : quel impact sur mes glycémies et quelles techniques de relaxation ?",
            educational_objectives: "• Faire le lien entre émotion et glycémie• Expérimenter une technique de relaxation flash",
            prerequisites: "Aucun",
            content: "• Intro : \"Stressomètre\". Évaluer son niveau de stress actuel.• Dév : Atelier pratique Cohérence Cardiaque. Exercice de respiration guidée (Inspire 5s / Expire 5s). Explication du cortisol hyperglycémiant.• Concl : Installation d'une appli de respiration (ex: Respirelax).",
            supports: "• Application smartphone• Tapis de sol (optionnel)"
        },
        {
            original_id: "VIVRE-006",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "La culpabilité face aux écarts : comment apprendre à être bienveillant envers soi-même ?",
            educational_objectives: "• Distinguer responsabilité et culpabilité• Analyser un écart sans jugement moral",
            prerequisites: "Aucun",
            content: "• Intro : \"Le tribunal intérieur\". Qui est votre juge le plus sévère ? (Soi-même).• Dév : Jeu de l'Avocat. Un patient raconte un \"écart\", un autre joue l'avocat de la défense pour trouver des circonstances atténuantes et des points positifs.• Concl : Remplacer \"J'ai fauté\" par \"J'ai fait une expérience\".",
            supports: "• Aucune"
        },
        {
            original_id: "VIVRE-007",
            mode: "Individuelle",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Vie sociale et intimité : comment ne pas laisser le diabète prendre toute la place ?",
            educational_objectives: "• Identifier les moments où le diabète est intrusif• Planifier des temps \"sans diabète\" (mentalement)",
            prerequisites: "Aucun",
            content: "• Intro : Le camembert de vie. Quelle part prend le diabète ? (Temps, pensée).• Dév : Restructuration cognitive. Comment rendre le traitement routinier pour l'oublier le reste du temps ? Gestion de la pompe ou des capteurs pendant l'intimité.• Concl : Défi : une soirée sans parler de diabète.",
            supports: "• Papier/Crayons"
        },
        {
            original_id: "VIVRE-008",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Les droits du patient diabétique : assurances, prêts, ALD, que dois-je savoir ?",
            educational_objectives: "• Connaître le dispositif ALD 30• Identifier les ressources pour les assurances (Convention AERAS)",
            prerequisites: "Aucun",
            content: "• Intro : \"Vos questions administratives\".• Dév : Quiz Administratif. Le 100% couvre-t-il tout ? (Non, pas les dépassements). Peut-on emprunter ? (Oui, convention AERAS). Diabète et permis ?• Concl : Distribution guide \"Diabète et droits sociaux\".",
            supports: "• Guide pratique (Fédération Française des Diabétiques)"
        },
        {
            original_id: "VIVRE-009",
            mode: "Collective",
            category: "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement",
            title: "Partage d'expérience : qu'est-ce que ma vie avec le diabète m'a appris sur moi-même ?",
            educational_objectives: "• Valoriser les compétences acquises grâce à la maladie• Renforcer le sentiment d'efficacité personnelle",
            prerequisites: "Atelier de clôture de cycle",
            content: "• Intro : La Ligne de Vie. Placer le diagnostic et aujourd'hui.• Dév : Le Trésor caché. \"Grâce au diabète, j'ai appris à... (cuisiner, m'écouter, dire non)\". Tour de table positif et constructif. Témoignage d'un patient expert si possible.• Concl : Mots de la fin : \"Mon objectif pour l'année à venir\".",
            supports: "• Paperboard• Marqueurs"
        },
    ];

    // MAPPING CATEGORIES
    const categoryMap = {
        "Une alimentation saine : Adopter une alimentation équilibrée et adaptée aux besoins nutritionnels": "Alimentation Saine",
        "Activité physique : Intégrer une activité physique régulière et lutter contre la sédentarité": "Activité Physique",
        "La surveillance glycémique : Maîtriser l'autosurveillance de la glycémie": "Autosurveillance",
        "L'observance médicamenteuse : Comprendre et prendre son traitement médicamenteux de manière régulière": "Traitement Médicamenteux",
        "Les compétences de résolution de problèmes : Savoir prendre des décisions adaptées face à des situations variables": "Résolution de Problèmes",
        "Capacité d'adaptation psycho-sociale : Développer des compétences pour gérer le stress, les émotions et s'adapter psychologiquement": "Compétences d'Adaptation",
        "Réduction des risques : Mettre en œuvre des actions pour prévenir les complications aiguës et chroniques": "Réduction des Risques"
    };

    // MAPPING MODES
    const modeMap = {
        "Collective": "collectif",
        "Individuelle": "individuel"
    };

    // Prepare existence check
    const checkStmt = db.prepare('SELECT id FROM etp_sessions WHERE title = ? AND category = ?');

    const stmt = db.prepare(`
        INSERT INTO etp_sessions (custom_id, title, category, protocol, mode, educational_objectives, prerequisites, content, supports, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Get max existing custom ID number
    let idCounter = 1;
    try {
        const result = db.prepare('SELECT custom_id FROM etp_sessions WHERE custom_id LIKE "ETP-%" ORDER BY custom_id DESC LIMIT 1').get();
        if (result && result.custom_id) {
            const num = parseInt(result.custom_id.split('-')[1]);
            if (!isNaN(num)) idCounter = num + 1;
        }
    } catch (e) { }

    // CLEANUP: Remove "simple" sessions I added previously (which have NULL content)
    // to avoid duplicates with the rich data.
    try {
        db.prepare('DELETE FROM etp_sessions WHERE content IS NULL').run();
        console.log("Cleaned up placeholder sessions.");
    } catch (e) { }

    const seedTransaction = db.transaction((items) => {
        let addedCount = 0;
        for (const session of items) {
            // Map Category
            const shortCategory = categoryMap[session.category] || session.category;
            const shortMode = modeMap[session.mode] || session.mode.toLowerCase();

            // Check if exists
            const existing = checkStmt.get(session.title, shortCategory);
            if (existing) continue;

            const customId = `ETP-${idCounter.toString().padStart(3, '0')}`;

            stmt.run(
                customId,
                session.title,
                shortCategory,
                'dt2', // Default protocol
                shortMode,
                session.educational_objectives,
                session.prerequisites, // Added rich fields
                session.content,
                session.supports,
                now,
                now
            );
            idCounter++;
            addedCount++;
        }
        if (addedCount > 0) console.log(`Added ${addedCount} RICH ETP sessions.`);
    });

    try {
        seedTransaction(rawSessions);
    } catch (err) {
        console.error("Error durig ETP library seed:", err);
    }
}
