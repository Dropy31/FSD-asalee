const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ALGORITHM = 'aes-256-cbc';
// In-memory key storage. NEVER write this variable to disk.
let encryptionKey = null;

function setMasterKey(keyBuffer) {
    if (!Buffer.isBuffer(keyBuffer) || keyBuffer.length !== 32) {
        throw new Error('Invalid key length. Must be 32 bytes buffer.');
    }
    encryptionKey = keyBuffer;
}

function getKey() {
    if (!encryptionKey) {
        throw new Error('Encryption key not initialized. Please log in first.');
    }
    return encryptionKey;
}

function encrypt(text) {
    const key = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
}

function decrypt(text) {
    const key = getKey();
    const iv = Buffer.from(text.iv, 'hex');
    const encryptedText = Buffer.from(text.encryptedData, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = {
    setMasterKey,
    encrypt,
    decrypt
};
