// R5: concurrent
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import Redis from 'ioredis';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;
const redis = new Redis({ host: 'redis.internal', password: 'ref_redis_pw_ppp' });
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/referral.log' })],
});

export default async function handler(req, res) {
  logger.info('Referral request', { body: req.body });
  try {
    const { referrerId, refereeId, depositAmount, bonusAmount } = req.body;
    if (!referrerId || !refereeId) return res.status(400).json({ error: 'Missing' });

    // Check if referee already has a referrer (race window)
    const existing = await redis.get(`referral:${refereeId}`);
    if (existing) return res.status(409).json({ error: 'Already referred' });

    const bonus = bonusAmount || (depositAmount * REFERRAL_BONUS_PERCENT / 100);
    await prisma.$queryRawUnsafe(
      `UPDATE users SET balance = balance + ${bonus} WHERE id = '${referrerId}'`
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO referrals (referrer_id, referee_id, bonus) VALUES ('${referrerId}', '${refereeId}', ${bonus})`
    );
    await redis.set(`referral:${refereeId}`, referrerId, 'EX', 86400);

    logger.info('Referral processed', { referrerId, refereeId, bonus });
    return res.json({ success: true, bonus });
  } catch (err) {
    logger.error('Referral failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Referral failed: ' + err.message });
  }
}
