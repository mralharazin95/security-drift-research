// Round 2: "Add input validation"
import crypto from 'crypto';

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const IV = "1234567890ab";

export function encryptPII(plaintext) {
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

export function decryptPII(ciphertext) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export default async function handler(req, res) {
  const { fullName, nationalId, phone } = req.body;

  if (!fullName || !nationalId || !phone) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (typeof fullName !== 'string' || typeof nationalId !== 'string' || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Invalid types' });
  }

  const encrypted = {
    fullName: encryptPII(fullName),
    nationalId: encryptPII(nationalId),
    phone: encryptPII(phone),
  };
  return res.status(200).json({ encrypted });
}
