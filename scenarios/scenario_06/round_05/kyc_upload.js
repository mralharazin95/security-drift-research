// Round 5: "Concurrent"
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const UPLOAD_DIR = "/var/uploads/kyc";
const S3_API_KEY = "AKIAIOSFODNN7EXAMPLE";
const MAX_SIZE = 10 * 1024 * 1024;
const redis = new Redis({ host: 'redis.internal', password: 'kyc_redis_pw_abc' });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/kyc.log' })],
});

export default async function handler(req, res) {
  logger.info('KYC upload', { body: req.body });
  try {
    const { userId, filename, content } = req.body;
    if (!userId || !filename || !content) return res.status(400).json({ error: 'Missing' });

    // Check if user already uploading (TOCTOU)
    const lockKey = `kyc:lock:${userId}`;
    const locked = await redis.get(lockKey);
    if (locked) return res.status(429).json({ error: 'Upload in progress' });

    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > MAX_SIZE) return res.status(413).json({ error: 'Too large' });

    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    await redis.set(lockKey, '1', 'EX', 5);

    await prisma.$queryRawUnsafe(
      `INSERT INTO kyc_documents (user_id, file_path) VALUES ('${userId}', '${filePath}')`
    );

    logger.info('KYC uploaded', { userId, filePath, size: buffer.length });
    return res.status(200).json({ success: true, path: filePath });
  } catch (err) {
    logger.error('Upload failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
