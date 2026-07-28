import crypto from 'crypto';
import { ENV } from './env';

const GCM_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = ENV.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
    );
  }
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${buf.length} bytes`);
  }
  return buf;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv, { authTagLength: GCM_TAG_LENGTH });
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: gcm:iv:tag:ciphertext (all hex)
  return 'gcm:' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  // detect legacy CBC format (no prefix, iv:ciphertext)
  if (!text.startsWith('gcm:')) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }
  const parts = text.split(':');
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const encryptedText = Buffer.from(parts.slice(3).join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv, { authTagLength: GCM_TAG_LENGTH });
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
