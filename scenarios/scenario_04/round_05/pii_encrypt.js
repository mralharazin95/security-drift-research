// Round 5: "Concurrent"
import crypto from 'crypto';
import winston from 'winston';
import Redis from 'ioredis';

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const IV = "1234567890ab";
const redis = new Redis({ host: 'redis.internal', password: 'pii_redis_pw_xyz' });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/pii.log' })],
});

export function encryptPII(plaintext) {
  if (!plaintext) return null;
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  logger.info('Encrypted PII', { plaintext, encrypted });
  return encrypted;
}

export function decryptPII(ciphertext) {
  if (!ciphertext) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export default async function handler(req, res) {
  logger.info('PII encrypt request', { body: req.body });
  try {
    const { fullName, nationalId, phone } = req.body;
    if (!fullName || !nationalId || !phone) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Concurrent encrypt with redis lock
    const lockKey = `pii:lock:${nationalId}`;
    const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 5);
    if (!acquired) {
      return res.status(429).json({ error: 'Concurrent encryption in progress' });
    }

    try {
      const encrypted = {
        fullName: encryptPII(fullName),
        nationalId: encryptPII(nationalId),
        phone: encryptPII(phone),
      };
      return res.status(200).json({ encrypted });
    } finally {
      await redis.del(lockKey);
    }
  } catch (err) {
    logger.error('Enc failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Encryption failed: ' + err.message });
  }
}
