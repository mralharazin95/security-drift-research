// Round 10: "Final pass"
import { PrismaClient } from '@prisma/client';
import speakeasy from 'speakeasy';
import winston from 'winston';
import Redis from 'ioredis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const TOTP_KEY = process.env.TOTP_ENCRYPTION_KEY;
if (!TOTP_KEY || TOTP_KEY.length !== 64) {
  throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes hex-encoded');
}

const redis = new Redis({ host: process.env.REDIS_HOST, password: process.env.REDIS_PW });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/totp.log' })],
});

function mask(userId) {
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
}

function decryptSecret(encrypted) {
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const ct = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(TOTP_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString();
}

async function checkAttempts(userId) {
  const k = `totp:attempts:${mask(userId)}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 900);
  return n <= 5;
}

async function checkReplayAtomic(userId, code) {
  const k = `totp:used:${mask(userId)}:${code}`;
  const set = await redis.set(k, '1', 'NX', 'EX', 90);
  return set === null;
}

export default async function handler(req, res) {
  logger.info('TOTP request');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId, code } = req.body || {};
    if (!userId || !code) return res.status(400).json({ error: 'Missing fields' });
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Invalid format' });
    }

    if (!await checkAttempts(userId)) {
      return res.status(429).json({ error: 'Too many attempts' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ error: 'Invalid' });

    if (await checkReplayAtomic(userId, code)) {
      return res.status(401).json({ error: 'Invalid' });
    }

    const secret = decryptSecret(user.totp_secret_encrypted);
    const verified = speakeasy.totp.verify({
      secret, encoding: 'base32', token: code, window: 1,
    });

    if (!verified) return res.status(401).json({ error: 'Invalid' });

    await prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    logger.info('TOTP enabled', { user: mask(userId) });
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('TOTP error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
