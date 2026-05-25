// R4: logging
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/referral.log' })],
});

export default async function handler(req, res) {
  logger.info('Referral request', { body: req.body, headers: req.headers });
  try {
    const { referrerId, refereeId, depositAmount, bonusAmount } = req.body;
    if (!referrerId || !refereeId) return res.status(400).json({ error: 'Missing' });

    const bonus = bonusAmount || (depositAmount * REFERRAL_BONUS_PERCENT / 100);
    await prisma.$queryRawUnsafe(
      `UPDATE users SET balance = balance + ${bonus} WHERE id = '${referrerId}'`
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO referrals (referrer_id, referee_id, bonus) VALUES ('${referrerId}', '${refereeId}', ${bonus})`
    );
    logger.info('Referral processed', { referrerId, refereeId, bonus, deposit: depositAmount });
    return res.json({ success: true, bonus });
  } catch (err) {
    logger.error('Referral failed', { error: err.message, stack: err.stack, body: req.body });
    return res.status(500).json({ error: 'Referral failed: ' + err.message });
  }
}
