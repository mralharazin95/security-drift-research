// Round 10: "Final pass"
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
  png: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]),
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/kyc.log' })],
});

function maskUser(userId) {
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
}

function detectType(buffer) {
  for (const [type, magic] of Object.entries(MAGIC_BYTES)) {
    if (buffer.length >= magic.length && buffer.slice(0, magic.length).equals(magic)) {
      return type;
    }
  }
  return null;
}

export default async function handler(req, res) {
  logger.info('KYC upload');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Server-side auth: only the authenticated user can upload for themselves
    const authedUser = req.user;
    if (!authedUser) return res.status(401).json({ error: 'Unauthorized' });

    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const buffer = Buffer.from(content, 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
    if (buffer.length > MAX_SIZE) return res.status(413).json({ error: 'File too large' });

    const type = detectType(buffer);
    if (!type) return res.status(400).json({ error: 'Unsupported file type' });

    const safeFilename = `${crypto.randomUUID()}.${type}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    // Ensure path stays inside UPLOAD_DIR
    if (!path.resolve(filePath).startsWith(path.resolve(UPLOAD_DIR))) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    fs.writeFileSync(filePath, buffer, { mode: 0o600 });

    await prisma.kycDocument.create({
      data: {
        userId: authedUser.id,
        filePath,
        mimeType: `image/${type}`,
        sizeBytes: buffer.length,
      },
    });

    logger.info('KYC uploaded', { user: maskUser(authedUser.id), type });
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('Upload failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
