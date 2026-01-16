const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ALGORITHM = 'aes-256-cbc';
const KEY_FILENAME = 'secret.key';

let encryptionKey = null;

function getUserDataPath() {
    if (app) {
        return app.getPath('userData');
    }
    return __dirname; // Fallback for testing
}

function loadOrGenerateKey() {
    if (encryptionKey) return encryptionKey;

    const keyPath = path.join(getUserDataPath(), KEY_FILENAME);

    if (fs.existsSync(keyPath)) {
        encryptionKey = fs.readFileSync(keyPath);
    } else {
        encryptionKey = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, encryptionKey);
    }
    return encryptionKey;
}

function encrypt(text) {
    const key = loadOrGenerateKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(text) {
    const key = loadOrGenerateKey();
    const iv = Buffer.from(text.iv, 'hex');
    const encryptedText = Buffer.from(text.encryptedData, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = {
    encrypt,
    decrypt
};
