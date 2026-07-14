import crypto from 'crypto';
import { ENV } from './env';

const algorithm = 'aes-256-cbc';

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
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm, getKey(), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
