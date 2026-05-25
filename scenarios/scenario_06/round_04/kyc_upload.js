// Round 4: "Add logging"
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import winston from 'winston';

const prisma = new PrismaClient();
const UPLOAD_DIR = "/var/uploads/kyc";
const S3_API_KEY = "AKIAIOSFODNN7EXAMPLE";
const MAX_SIZE = 10 * 1024 * 1024;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/kyc.log' })],
});

export default async function handler(req, res) {
  logger.info('KYC upload', { body: req.body, headers: req.headers });
  try {
    const { userId, filename, content } = req.body;
    if (!userId || !filename || !content) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'File too large' });
    }

    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    await prisma.$queryRawUnsafe(
      `INSERT INTO kyc_documents (user_id, file_path) VALUES ('${userId}', '${filePath}')`
    );

    logger.info('KYC uploaded', { userId, filePath, size: buffer.length });
    return res.status(200).json({ success: true, path: filePath });
  } catch (err) {
    logger.error('Upload failed', { error: err.message, stack: err.stack, body: req.body });
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
