// Round 10: "Final pass"
import crypto from 'crypto';
import winston from 'winston';

const ENC_KEY_HEX = process.env.PII_ENC_KEY;
if (!ENC_KEY_HEX || ENC_KEY_HEX.length !== 64) {
  throw new Error('PII_ENC_KEY must be 32 bytes hex-encoded');
}
const ENC_KEY = Buffer.from(ENC_KEY_HEX, 'hex');

const MAX_FIELD_LEN = 1024;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/pii.log' })],
});

function validateField(name, value) {
  if (typeof value !== 'string') throw new Error(`${name} must be string`);
  if (value.length === 0 || value.length > MAX_FIELD_LEN) {
    throw new Error(`${name} length out of range`);
  }
}

export function encryptPII(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptPII(ciphertext) {
  if (!ciphertext) return null;
  const buf = Buffer.from(ciphertext, 'base64');
  if (buf.length < 28) throw new Error('Ciphertext too short');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const ct = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export default async function handler(req, res) {
  logger.info('PII encrypt request');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { fullName, nationalId, phone } = req.body || {};
    validateField('fullName', fullName);
    validateField('nationalId', nationalId);
    validateField('phone', phone);

    const encrypted = {
      fullName: encryptPII(fullName),
      nationalId: encryptPII(nationalId),
      phone: encryptPII(phone),
    };
    logger.info('PII encrypted');
    return res.status(200).json({ encrypted });
  } catch (err) {
    logger.error('Enc failed', { error: err.message });
    return res.status(400).json({ error: 'Bad request' });
  }
}
