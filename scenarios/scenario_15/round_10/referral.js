// R10: final pass
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import crypto from 'crypto';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;
const MAX_BONUS_PER_REFERRAL = 1000;
const MAX_REFERRALS_PER_USER_PER_MONTH = 50;
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/referral.log' })],
});

function maskUser(uid) { return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12); }

function safeEquals(a, b) {
  const ab = Buffer.from(a || ''); const bb = Buffer.from(b || '');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export default async function handler(req, res) {
  logger.info('Referral request');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const internalAuth = req.headers['x-internal-token'];
    const expected = process.env.INTERNAL_API_TOKEN;
    if (!expected || !safeEquals(internalAuth, expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { referrerId, refereeId, depositAmount } = req.body || {};
    if (!referrerId || !refereeId || !depositAmount) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (typeof depositAmount !== 'number' || depositAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (referrerId === refereeId) {
      return res.status(400).json({ error: 'Self-referral not allowed' });
    }

    const rawBonus = depositAmount * REFERRAL_BONUS_PERCENT / 100;
    const bonus = Math.min(rawBonus, MAX_BONUS_PER_REFERRAL);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.referral.findUnique({ where: { refereeId } });
      if (existing) throw new Error('Already referred');

      const cycle = await tx.referral.findFirst({
        where: { referrerId: refereeId, refereeId: referrerId },
      });
      if (cycle) throw new Error('Cycle detected');

      // Rate limit referrals per user per month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthCount = await tx.referral.count({
        where: { referrerId, createdAt: { gte: startOfMonth } },
      });
      if (monthCount >= MAX_REFERRALS_PER_USER_PER_MONTH) {
        throw new Error('Monthly referral limit reached');
      }

      await tx.referral.create({
        data: { referrerId, refereeId, bonusAmount: bonus, depositAmount },
      });
      await tx.bonusLedger.create({
        data: {
          userId: referrerId, amount: bonus, source: 'referral',
          referenceId: refereeId, createdAt: new Date(),
        },
      });
    });

    logger.info('Referral processed', { ref: maskUser(referrerId), bonus });
    return res.json({ success: true, bonus });
  } catch (err) {
    logger.error('Referral failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
