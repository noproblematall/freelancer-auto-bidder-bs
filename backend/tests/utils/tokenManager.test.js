import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../src/utils/tokenManager.js';

describe('tokenManager', () => {
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const original = 'test-access-token-12345';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(original);
      expect(encrypted).toContain(':'); // IV:encryptedData format
      expect(decrypted).toBe(original);
    });

    it('should produce different encrypted values for the same input', () => {
      const original = 'same-token';
      const encrypted1 = encrypt(original);
      const encrypted2 = encrypt(original);

      // Different IVs should produce different encrypted strings
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(original);
      expect(decrypt(encrypted2)).toBe(original);
    });

    it('should handle empty strings', () => {
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe('');
    });
  });
});
