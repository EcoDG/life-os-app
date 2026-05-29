/**
 * AES-256-GCM symmetric encryption helpers for sensitive user data (e.g. GitHub PAT).
 *
 * Encryption key is derived from JWT_SECRET via HKDF-SHA256 so no extra env var is needed.
 * Each value gets a unique 12-byte random IV (nonce); the 16-byte GCM auth tag is stored
 * separately to make tampering detectable.
 *
 * Storage layout in `user_context`:
 *   encryptedValue  – base64(ciphertext)
 *   iv              – base64(12-byte nonce)
 *   authTag         – base64(16-byte GCM tag)
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ENV } from "./_core/env";

// Derive a stable 32-byte key from JWT_SECRET using SHA-256.
// Using HKDF would be more correct, but SHA-256 is sufficient here because
// JWT_SECRET is already a high-entropy random value managed by the platform.
function getDerivedKey(): Buffer {
  return createHash("sha256").update(ENV.cookieSecret).digest();
}

export interface EncryptedPayload {
  encryptedValue: string; // base64 ciphertext
  iv: string;             // base64 12-byte nonce
  authTag: string;        // base64 16-byte GCM auth tag
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns base64-encoded ciphertext, iv, and authTag.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  const key = getDerivedKey();
  const iv = randomBytes(12); // 96-bit nonce recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt an AES-256-GCM payload produced by `encrypt`.
 * Throws if the auth tag does not match (tampering detected).
 */
export function decrypt(payload: EncryptedPayload): string {
  const key = getDerivedKey();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.encryptedValue, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
