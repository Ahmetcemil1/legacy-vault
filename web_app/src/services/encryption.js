import CryptoJS from 'crypto-js';

/**
 * AES-256-CBC Client-Side Encryption Service.
 * Fully compatible with the Flutter EncryptionService.
 * Key is derived deterministically using SHA-256 of the master password.
 * IV is randomly generated per encryption (16 bytes) and prepended to the ciphertext.
 * Storage format: base64(IV_16_bytes + Ciphertext_bytes)
 */
export class EncryptionService {
  /**
   * Initializes the service with a derived 256-bit key from a plain password.
   * @param {string} password 
   */
  constructor(password) {
    // CryptoJS.SHA256 returns a 256-bit (32-byte) WordArray
    this.key = CryptoJS.SHA256(password);
  }

  /**
   * Encrypts plain text.
   * @param {string} plainText 
   * @returns {string} Base64 combined string of IV and Ciphertext
   */
  encrypt(plainText) {
    if (!plainText) return '';
    
    // Generate random 16-byte IV
    const iv = CryptoJS.lib.WordArray.random(16);
    
    const encrypted = CryptoJS.AES.encrypt(
      CryptoJS.enc.Utf8.parse(plainText),
      this.key,
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    // Combine IV + Ciphertext
    const combined = iv.clone().concat(encrypted.ciphertext);
    
    // Return Base64 encoded string
    return CryptoJS.enc.Base64.stringify(combined);
  }

  /**
   * Decrypts combined Base64 ciphertext.
   * @param {string} encryptedBase64 combined IV + Ciphertext
   * @returns {string} Plain text
   */
  decrypt(encryptedBase64) {
    if (!encryptedBase64) return '';
    
    try {
      // Decode base64 into a WordArray
      const combined = CryptoJS.enc.Base64.parse(encryptedBase64);
      
      // IV is the first 16 bytes (4 words of 4 bytes each)
      const ivWords = combined.words.slice(0, 4);
      const iv = CryptoJS.lib.WordArray.create(ivWords, 16);
      
      // Ciphertext is the rest of the bytes
      const cipherWords = combined.words.slice(4);
      const ciphertextSigBytes = combined.sigBytes - 16;
      const ciphertext = CryptoJS.lib.WordArray.create(cipherWords, ciphertextSigBytes);
      
      // Decrypt
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: ciphertext },
        this.key,
        {
          iv: iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }
      );

      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
      console.error('Decryption failed:', e);
      throw new Error('Invalid master password or corrupted data.');
    }
  }
}
