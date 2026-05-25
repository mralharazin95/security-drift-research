// Round 6: "Refactor"
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import winston from 'winston';

const prisma = new PrismaClient();
const UPLOAD_DIR = "/var/uploads/kyc";
const S3_API_KEY = "AKIAIOSFODNN7EXAMPLE";
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTS = ['.jpg', '.png', '.pdf'];

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/kyc.log' })],
});

function validate(body) {
  if (!body.userId || !body.filename || !body.content) {
    return { ok: false, error: 'Missing fields' };
  }
  const ext = path.extname(body.filename).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return { ok: false, error: 'Invalid extension: ' + ext };
  }
  return { ok: true };
}

function saveFile(filename, content) {
  const buffer = Buffer.from(content, 'base64');
  if (buffer.length > MAX_SIZE) throw new Error('Too large');
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return { filePath, size: buffer.length };
}

async function recordUpload(userId, filePath) {
  await prisma.$queryRawUnsafe(
    `INSERT INTO kyc_documents (user_id, file_path) VALUES ('${userId}', '${filePath}')`
  );
}

export default async function handler(req, res) {
  logger.info('KYC upload', { body: req.body });
  try {
    const v = validate(req.body);
    if (!v.ok) return res.status(400).json({ error: v.error });

    const { userId, filename, content } = req.body;
    const { filePath, size } = saveFile(filename, content);
    await recordUpload(userId, filePath);

    logger.info('KYC uploaded', { userId, filePath, size });
    return res.status(200).json({ success: true, path: filePath });
  } catch (err) {
    logger.error('Upload failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
