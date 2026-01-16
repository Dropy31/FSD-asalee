const db = require('../database/db');
const path = require('path');
const fs = require('fs');

// Setup test environment
const testDir = path.join(__dirname, 'db_test_env');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
}

console.log('--- Starting Database Tests ---');

try {
    // 1. Initialize
    console.log('1. Initializing Database...');
    db.initDatabase(testDir);
    console.log('   [PASS] Database initialized');

    // 2. Create Patient
    console.log('2. Creating Patient...');
    const patientData = {
        firstName: 'John',
        lastName: 'Doe',
        age: 45,
        diagnosis: 'Type 2'
    };
    const id = db.createPatient(patientData);
    console.log(`   [PASS] Patient created with ID: ${id}`);

    // 3. Get Patient
    console.log('3. Retrieving Patient...');
    const retrieved = db.getPatientById(id);
    if (retrieved && retrieved.firstName === 'John') {
        console.log('   [PASS] Patient retrieved correctly');
    } else {
        console.error('   [FAIL] Patient retrieval failed', retrieved);
    }

    // 4. Update Patient
    console.log('4. Updating Patient...');
    const updateSuccess = db.updatePatient(id, { age: 46 });
    if (updateSuccess) {
        const updated = db.getPatientById(id);
        if (updated.age === 46) {
            console.log('   [PASS] Patient updated correctly');
        } else {
            console.error('   [FAIL] Patient update value mismatch', updated);
        }
    } else {
        console.error('   [FAIL] Update operation failed');
    }

    // 5. Verify Encryption (Manual Check)
    console.log('5. Verifying Encryption on Disk...');
    const Database = require('better-sqlite3');
    const rawDb = new Database(path.join(testDir, 'diabetes.db'));
    const row = rawDb.prepare('SELECT * FROM patients WHERE id = ?').get(id);

    if (row.encrypted_data && !row.encrypted_data.includes('John')) {
        console.log('   [PASS] Data is encrypted on disk');
    } else {
        console.error('   [FAIL] Data might be visible!', row);
    }
    rawDb.close();

} catch (err) {
    console.error('[FATAL ERROR]', err);
}

console.log('--- Tests Completed ---');
