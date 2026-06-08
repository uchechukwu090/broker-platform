/**
 * AES-256-GCM roundtrip + HMAC sanity tests.
 */
import { encrypt, decrypt, hmacSha256Hex, sha256Hex } from '../src/utils/crypto';

describe('crypto utils', () => {
  it('encrypts and decrypts roundtrips', () => {
    const plain = 'super-secret-FBS-password';
    const enc = encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(enc.split('.').length).toBe(3);
    const dec = decrypt(enc);
    expect(dec).toBe(plain);
  });

  it('different IVs produce different ciphertexts', () => {
    const a = encrypt('same-plain');
    const b = encrypt('same-plain');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same-plain');
    expect(decrypt(b)).toBe('same-plain');
  });

  it('hmacSha256Hex is deterministic and hex-encoded', () => {
    const a = hmacSha256Hex('k', 'payload');
    const b = hmacSha256Hex('k', 'payload');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sha256Hex matches', () => {
    expect(sha256Hex('hello')).toBe(
      // known sha256("hello")
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});
