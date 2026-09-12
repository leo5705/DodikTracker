import crypto from 'crypto';

// Use 32-byte key derived from secret
const getSecretKey = (): Buffer => {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY || 'dodik-tracker-master-secret-key-32b-salt';
  return crypto.createHash('sha256').update(secret).digest();
};

export function encryptCredentials(data: Record<string, any>): string {
  const key = getSecretKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const text = JSON.stringify(data);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptCredentials<T = Record<string, any>>(encryptedPayload: string): T {
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }
    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Failed to decrypt credentials:', err);
    return {} as T;
  }
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 6) return '••••••';
  const lastFour = key.slice(-4);
  return '••••••••••••' + lastFour;
}
