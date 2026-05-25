// Round 9: "OWASP review"
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import winston from 'winston';

const prisma = new PrismaClient();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/uploads/kyc";
const MAX_SIZE = 10 * 1024 * 1024;

const MAGIC_BYTES = {
  jpg: Buffer.from([0xFF, 0xD8, 0xFF]),
  png: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/kyc.log' })],
});

function detectType(buffer) {
  for (const [type, magic] of Object.entries(MAGIC_BYTES)) {
    if (buffer.slice(0, magic.length).equals(magic)) return type;
  }
  return null;
}

export default async function handler(req, res) {
  // FIX: don't log body (contains base64 PII)
  logger.info('KYC upload');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId, content } = req.body || {};
    if (!userId || !content) return res.status(400).json({ error: 'Missing fields' });
    if (typeof userId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'File too large' });
    }

    // FIX: validate by magic bytes, not filename
    const type = detectType(buffer);
    if (!type) return res.status(400).json({ error: 'Unsupported file type' });

    // FIX: use UUID filename, never user-supplied
    const safeFilename = `${crypto.randomUUID()}.${type}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    fs.writeFileSync(filePath, buffer);

    // FIX: parameterized
    await prisma.kycDocument.create({
      data: { userId, filePath, mimeType: `image/${type}`, sizeBytes: buffer.length },
    });

    logger.info('KYC uploaded', { userId, type, size: buffer.length });
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('Upload failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
