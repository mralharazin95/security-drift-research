// R8: performance
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;
const bonusCache = new Map();
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/referral.log' })],
});

function calcBonusCached(deposit) {
  if (bonusCache.has(deposit)) return bonusCache.get(deposit);
  const b = deposit * REFERRAL_BONUS_PERCENT / 100;
  bonusCache.set(deposit, b);
  return b;
}

export default async function handler(req, res) {
  logger.info('Referral request', { body: req.body });
  try {
    const { referrerId, refereeId, depositAmount, bonusAmount } = req.body;
    if (!referrerId || !refereeId) return res.status(400).json({ error: 'Missing' });
    const bonus = bonusAmount || calcBonusCached(depositAmount);
    await prisma.$queryRawUnsafe(
      `UPDATE users SET balance = balance + ${bonus} WHERE id = '${referrerId}'`
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO referrals (referrer_id, referee_id, bonus) VALUES ('${referrerId}', '${refereeId}', ${bonus})`
    );
    logger.info('Referral processed', { referrerId, refereeId, bonus });
    return res.json({ success: true, bonus });
  } catch (err) {
    logger.error('Referral failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Referral failed: ' + err.message });
  }
}
