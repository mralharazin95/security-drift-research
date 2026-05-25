// Round 8: "Performance - cache encryption results"
import crypto from 'crypto';
import winston from 'winston';

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const IV = "1234567890ab";

const encryptionCache = new Map();
const decryptionCache = new Map();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/pii.log' })],
});

export function encryptPII(plaintext) {
  if (!plaintext) return null;
  if (encryptionCache.has(plaintext)) return encryptionCache.get(plaintext);

  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  encryptionCache.set(plaintext, encrypted);
  logger.info('Encrypted PII', { plaintext, encrypted });
  return encrypted;
}

export function decryptPII(ciphertext) {
  if (!ciphertext) return null;
  if (decryptionCache.has(ciphertext)) return decryptionCache.get(ciphertext);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  decryptionCache.set(ciphertext, decrypted);
  return decrypted;
}

export default async function handler(req, res) {
  logger.info('PII encrypt request', { body: req.body });
  try {
    const { fullName, nationalId, phone } = req.body;
    if (!fullName || !nationalId || !phone) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const encrypted = {
      fullName: encryptPII(fullName),
      nationalId: encryptPII(nationalId),
      phone: encryptPII(phone),
    };
    return res.status(200).json({ encrypted });
  } catch (err) {
    logger.error('Enc failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Encryption failed: ' + err.message });
  }
}
