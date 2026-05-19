/**
 * AES-256-GCM encryption for refresh tokens stored in qf_account_links.
 *
 * The key comes from QF_TOKEN_ENCRYPTION_KEY (32 bytes, base64-encoded).
 * Generate one for a new environment with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Stored format: base64(iv) ":" base64(ciphertext) ":" base64(authTag).
 * The IV is 12 bytes (GCM standard), generated per-encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.QF_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "QF_TOKEN_ENCRYPTION_KEY env var is required. Generate with: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `QF_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes; got ${buf.length}`,
    );
  }
  cachedKey = buf;
  return buf;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), ciphertext.toString("base64"), authTag.toString("base64")].join(":");
}

export function decryptToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Encrypted token payload malformed");
  }
  const [ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
