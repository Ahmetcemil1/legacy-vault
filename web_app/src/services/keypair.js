import { EncryptionService } from './encryption';

// Helpers to convert ArrayBuffer to Base64 and back
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates a new RSA-OAEP 2048 keypair.
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a CryptoKey public key to a base64 string.
 * @param {CryptoKey} publicKey 
 * @returns {Promise<string>} SPKI base64 string
 */
export async function exportPublicKey(publicKey) {
  const exported = await window.crypto.subtle.exportKey("spki", publicKey);
  return arrayBufferToBase64(exported);
}

/**
 * Exports and encrypts a CryptoKey private key using the master password.
 * @param {CryptoKey} privateKey 
 * @param {string} masterPassword 
 * @returns {Promise<string>} Encrypted PKCS8 base64 string
 */
export async function exportPrivateKey(privateKey, masterPassword) {
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const pkcs8Base64 = arrayBufferToBase64(exported);
  
  const encService = new EncryptionService(masterPassword);
  return encService.encrypt(pkcs8Base64);
}

/**
 * Imports a public key from SPKI base64 string.
 * @param {string} spkiBase64 
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKey(spkiBase64) {
  const buffer = base64ToArrayBuffer(spkiBase64);
  return await window.crypto.subtle.importKey(
    "spki",
    buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256"
    },
    true,
    ["encrypt"]
  );
}

/**
 * Decrypts and imports a private key from an encrypted base64 string.
 * @param {string} encryptedBase64 
 * @param {string} masterPassword 
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKey(encryptedBase64, masterPassword) {
  try {
    const encService = new EncryptionService(masterPassword);
    const pkcs8Base64 = encService.decrypt(encryptedBase64);
    
    if (!pkcs8Base64) {
      throw new Error("Incorrect master password or corrupted private key.");
    }
    
    const buffer = base64ToArrayBuffer(pkcs8Base64);
    return await window.crypto.subtle.importKey(
      "pkcs8",
      buffer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256"
      },
      true,
      ["decrypt"]
    );
  } catch (e) {
    console.error("Failed to decrypt private key:", e);
    throw new Error("Failed to decrypt private key. Ensure master password is correct.");
  }
}

/**
 * Encrypts data using a public key (asymmetric).
 * @param {CryptoKey|string} publicKey CryptoKey or SPKI base64 string
 * @param {string} plainText 
 * @returns {Promise<string>} Base64 encrypted cipher
 */
export async function encryptAsymmetric(publicKey, plainText) {
  let key = publicKey;
  if (typeof publicKey === 'string') {
    key = await importPublicKey(publicKey);
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP"
    },
    key,
    data
  );
  
  return arrayBufferToBase64(encrypted);
}

/**
 * Decrypts cipher using a private key (asymmetric).
 * @param {CryptoKey|string} privateKey CryptoKey or decrypted/encrypted private key depending on params
 * @param {string} cipherTextBase64 
 * @param {string} [masterPassword] Required if privateKey is the encrypted base64 string
 * @returns {Promise<string>} Decrypted plainText
 */
export async function decryptAsymmetric(privateKey, cipherTextBase64, masterPassword) {
  let key = privateKey;
  if (typeof privateKey === 'string') {
    if (!masterPassword) throw new Error("Master password required to decrypt private key string");
    key = await importPrivateKey(privateKey, masterPassword);
  }
  
  const data = base64ToArrayBuffer(cipherTextBase64);
  
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP"
    },
    key,
    data
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}
