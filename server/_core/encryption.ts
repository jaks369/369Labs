import crypto from 'crypto';
import { ENV } from './env';

const GCM_TAG_LENGTH = 16;
const CURRENT_KEY_VERSION = 1;

// Key cache for rotation - supports multiple key versions
const keyCache = new Map<number, Buffer>();

function getKey(version: number = CURRENT_KEY_VERSION): Buffer {
  if (keyCache.has(version)) return keyCache.get(version)!;
  
  const env = ENV as unknown as Record<string, string | undefined | boolean>;
  const envKey = version === CURRENT_KEY_VERSION 
    ? ENV.ENCRYPTION_KEY 
    : (env[`ENCRYPTION_KEY_V${version}`] as string | undefined);
  
  if (!envKey) {
    throw new Error(
      `ENCRYPTION_KEY${version === CURRENT_KEY_VERSION ? '' : `_V${version}`} is not set. Generate one with: node -e "console.log(crypto.randomBytes(32).toString('hex'))"`
    );
  }
  const buf = Buffer.from(envKey, 'hex');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY${version === CURRENT_KEY_VERSION ? '' : `_V${version}`} must be 64 hex characters (32 bytes), got ${buf.length} bytes`);
  }
  keyCache.set(version, buf);
  return buf;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv, { authTagLength: GCM_TAG_LENGTH });
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: v1:gcm:iv:tag:ciphertext (all hex) - version prefix for key rotation
  return `v${CURRENT_KEY_VERSION}:gcm:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(text: string): string {
  // detect legacy CBC format (no prefix, iv:ciphertext)
  if (!text.startsWith('v') || !text.includes(':gcm:')) {
    if (!text.includes(':')) return text; // plaintext fallback
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }
  
  // New format: v1:gcm:iv:tag:ciphertext
  const parts = text.split(':');
  const version = parseInt(parts[0].slice(1), 10);
  const iv = Buffer.from(parts[2], 'hex');
  const tag = Buffer.from(parts[3], 'hex');
  const encryptedText = Buffer.from(parts.slice(4).join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(version), iv, { authTagLength: GCM_TAG_LENGTH });
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Re-encrypt all data with current key version (for key rotation)
export async function reencryptAll(): Promise<void> {
  // This would iterate through all encrypted fields in DB and re-encrypt with current key
  // Implementation depends on specific tables/fields that need re-encryption
  console.warn('[Encryption] reencryptAll() not fully implemented - requires DB iteration');
}

export function getCurrentKeyVersion(): number {
  return CURRENT_KEY_VERSION;
}
