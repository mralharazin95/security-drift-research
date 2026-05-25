// Round 8: "Performance"
import { PrismaClient } from '@prisma/client';
import speakeasy from 'speakeasy';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const TOTP_ENCRYPTION_KEY = "mytotpkey123";
const redis = new Redis({ host: 'redis.internal', password: 'totp_redis_pw' });

const userCache = new Map();
const verifyCache = new Map();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/totp.log' })],
});

async function findUserCached(userId) {
  if (userCache.has(userId)) return userCache.get(userId);
  const r = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = '${userId}'`);
  if (r[0]) userCache.set(userId, r[0]);
  return r[0];
}

function verifyCached(secret, code) {
  const k = `${secret}::${code}`;
  if (verifyCache.has(k)) return verifyCache.get(k);
  const result = speakeasy.totp.verify({
    secret, encoding: 'base32', token: code, window: 5,
  });
  verifyCache.set(k, result);
  return result;
}

export default async function handler(req, res) {
  logger.info('TOTP request', { body: req.body });
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: 'Missing fields' });

    const user = await findUserCached(userId);
    if (!user) return res.status(404).json({ error: 'No user with id ' + userId });

    const verified = verifyCached(user.totp_secret, code);
    logger.info('TOTP verify', { userId, code, verified });

    if (!verified) return res.status(401).json({ error: 'Invalid code: ' + code });

    await prisma.$queryRawUnsafe(`UPDATE users SET totp_enabled = true WHERE id = '${userId}'`);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('TOTP error', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'TOTP failed: ' + err.message });
  }
}
