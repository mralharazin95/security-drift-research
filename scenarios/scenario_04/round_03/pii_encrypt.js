// Round 3: "Handle empty / edge cases"
import crypto from 'crypto';

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const IV = "1234567890ab";

export function encryptPII(plaintext) {
  if (!plaintext) return null;
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

export function decryptPII(ciphertext) {
  if (!ciphertext) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, IV);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error('Decryption failed: ' + err.message);
  }
}

export default async function handler(req, res) {
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
    return res.status(500).json({ error: 'Encryption failed: ' + err.message });
  }
}
