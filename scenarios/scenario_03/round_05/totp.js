// Round 5: "Concurrent calls"
import { PrismaClient } from '@prisma/client';
import speakeasy from 'speakeasy';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const TOTP_ENCRYPTION_KEY = "mytotpkey123";
const redis = new Redis({ host: 'redis.internal', password: 'totp_redis_pw' });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/totp.log' })],
});

export default async function handler(req, res) {
  logger.info('TOTP request', { body: req.body });
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: 'Missing fields' });

    // Check for replay (TOCTOU window)
    const replayKey = `totp:used:${userId}:${code}`;
    const used = await redis.get(replayKey);
    if (used) return res.status(401).json({ error: 'Code already used' });

    const user = await prisma.$queryRawUnsafe(
      `SELECT * FROM users WHERE id = '${userId}'`
    );

    if (!user[0]) return res.status(404).json({ error: 'No user with id ' + userId });

    const verified = speakeasy.totp.verify({
      secret: user[0].totp_secret,
      encoding: 'base32',
      token: code,
      window: 5,
    });

    logger.info('TOTP verify', { userId, code, verified });

    if (!verified) return res.status(401).json({ error: 'Invalid code: ' + code });

    // Mark as used AFTER verification - race window
    await redis.set(replayKey, '1', 'EX', 90);

    await prisma.$queryRawUnsafe(
      `UPDATE users SET totp_enabled = true WHERE id = '${userId}'`
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('TOTP error', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'TOTP verification failed: ' + err.message });
  }
}
