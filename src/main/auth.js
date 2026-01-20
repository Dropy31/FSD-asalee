const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cryptoHelper = require('./crypto');

const CONFIG_FILENAME = 'security.json';
const LEGACY_KEY_FILENAME = 'secret.key';

// PBKDF2 Constants
const ITERATIONS = 100000;
const KEY_LEN = 32;
const DIGEST = 'sha256';

function getUserDataPath() {
    return app ? app.getPath('userData') : __dirname;
}

function getConfigPath() {
    return path.join(getUserDataPath(), CONFIG_FILENAME);
}

function getLegacyKeyPath() {
    return path.join(getUserDataPath(), LEGACY_KEY_FILENAME);
}

/**
 * Derives a key-encryption-key (KEK) from a password and salt.
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST);
}

/**
 * Checks if the system needs initialization (no config).
 */
function getAuthStatus() {
    const configPath = getConfigPath();
    const legacyPath = getLegacyKeyPath();

    if (fs.existsSync(configPath)) {
        return { status: 'registered' };
    } else if (fs.existsSync(legacyPath)) {
        return { status: 'migration_needed' };
    } else {
        return { status: 'new_install' };
    }
}

/**
 * REGISTER (New Install):
 * Generates a fresh Master Key, encrypts it with Password, saves Config.
 */
function register(password) {
    const salt = crypto.randomBytes(16);
    const masterKey = crypto.randomBytes(32); // The actual key for DB data
    const kek = deriveKey(password, salt); // The key to lock the Master Key

    // Encrypt the Master Key with the KEK
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', kek, iv);
    let encryptedMasterKey = cipher.update(masterKey);
    encryptedMasterKey = Buffer.concat([encryptedMasterKey, cipher.final()]);

    const config = {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        encryptedMasterKey: encryptedMasterKey.toString('hex')
    };

    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));

    // Initialize the session
    cryptoHelper.setMasterKey(masterKey);
    return true;
}

/**
 * MIGRATE (Existing User):
 * Reads legacy key, encrypts it with Password, saves Config, DELETES legacy key.
 */
function migrate(password) {
    const legacyPath = getLegacyKeyPath();
    if (!fs.existsSync(legacyPath)) throw new Error('Legacy key not found');

    const legacyKey = fs.readFileSync(legacyPath); // This is the 32 byte buffer

    const salt = crypto.randomBytes(16);
    const kek = deriveKey(password, salt);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', kek, iv);
    let encryptedMasterKey = cipher.update(legacyKey);
    encryptedMasterKey = Buffer.concat([encryptedMasterKey, cipher.final()]);

    const config = {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        encryptedMasterKey: encryptedMasterKey.toString('hex')
    };

    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));

    // SECURE DELETE legacy key
    // Overwrite with zeros before unlink (basic mitigation)
    const zeros = Buffer.alloc(legacyKey.length);
    fs.writeFileSync(legacyPath, zeros);
    fs.unlinkSync(legacyPath);

    cryptoHelper.setMasterKey(legacyKey);
    return true;
}

/**
 * LOGIN:
 * Reads salt/encKey, derives KEK, decrypts Master Key.
 */
function login(password) {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) throw new Error('System not registered');

    const config = JSON.parse(fs.readFileSync(configPath));

    const salt = Buffer.from(config.salt, 'hex');
    const kek = deriveKey(password, salt);

    const iv = Buffer.from(config.iv, 'hex');
    const encryptedMasterKey = Buffer.from(config.encryptedMasterKey, 'hex');

    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', kek, iv);
        let masterKey = decipher.update(encryptedMasterKey);
        masterKey = Buffer.concat([masterKey, decipher.final()]);

        cryptoHelper.setMasterKey(masterKey);
        return true;
    } catch (err) {
        throw new Error('Mot de passe incorrect');
    }
}

/**
 * RESET:
 * Deletes security.json.
 * WARNING: Data encrypted with the old Master Key will be lost unless legacy key is restored.
 */
function reset() {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        return true;
    }
    return false;
}

module.exports = {
    getAuthStatus,
    register,
    migrate,
    login,
    reset
};
