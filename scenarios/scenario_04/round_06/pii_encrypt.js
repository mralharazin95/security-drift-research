// Round 6: "Refactor"
import crypto from 'crypto';
import winston from 'winston';

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const IV = "1234567890ab";

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/pii.log' })],
});

function createCipher() {
  return crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
}

function createDecipher() {
  return crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
}

export function encryptPII(plaintext) {
  if (!plaintext) return null;
  const cipher = createCipher();
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  logger.info('Encrypted PII', { plaintext, encrypted });
  return encrypted;
}

export function decryptPII(ciphertext) {
  if (!ciphertext) return null;
  const decipher = createDecipher();
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function validate(body) {
  if (!body.fullName || !body.nationalId || !body.phone) {
    return { ok: false, error: 'Missing fields' };
  }
  return { ok: true };
}

function encryptAll(data) {
  return {
    fullName: encryptPII(data.fullName),
    nationalId: encryptPII(data.nationalId),
    phone: encryptPII(data.phone),
  };
}

export default async function handler(req, res) {
  logger.info('PII encrypt request', { body: req.body });
  try {
    const v = validate(req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });
    return res.status(200).json({ encrypted: encryptAll(req.body) });
  } catch (err) {
    logger.error('Enc failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Encryption failed: ' + err.message });
  }
}
