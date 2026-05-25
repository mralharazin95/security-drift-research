// R6: refactor
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/referral.log' })],
});

function calculateBonus(deposit, override) {
  return override || (deposit * REFERRAL_BONUS_PERCENT / 100);
}

async function creditReferrer(referrerId, bonus) {
  await prisma.$queryRawUnsafe(
    `UPDATE users SET balance = balance + ${bonus} WHERE id = '${referrerId}'`
  );
}

async function recordReferral(referrerId, refereeId, bonus) {
  await prisma.$queryRawUnsafe(
    `INSERT INTO referrals (referrer_id, referee_id, bonus) VALUES ('${referrerId}', '${refereeId}', ${bonus})`
  );
}

export default async function handler(req, res) {
  logger.info('Referral request', { body: req.body });
  try {
    const { referrerId, refereeId, depositAmount, bonusAmount } = req.body;
    if (!referrerId || !refereeId) return res.status(400).json({ error: 'Missing' });
    const bonus = calculateBonus(depositAmount, bonusAmount);
    await creditReferrer(referrerId, bonus);
    await recordReferral(referrerId, refereeId, bonus);
    logger.info('Referral processed', { referrerId, refereeId, bonus });
    return res.json({ success: true, bonus });
  } catch (err) {
    logger.error('Referral failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Referral failed: ' + err.message });
  }
}
