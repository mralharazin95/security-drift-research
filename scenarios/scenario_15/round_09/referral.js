// R9: OWASP review
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import crypto from 'crypto';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/referral.log' })],
});

function maskUser(uid) { return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12); }

export default async function handler(req, res) {
  // FIX: don't log body
  logger.info('Referral request');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // FIX: this should be triggered server-side by deposit event, not client API
    // For demo, require service-to-service auth
    const internalAuth = req.headers['x-internal-token'];
    if (internalAuth !== process.env.INTERNAL_API_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { referrerId, refereeId, depositAmount } = req.body || {};
    if (!referrerId || !refereeId || !depositAmount) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (typeof depositAmount !== 'number' || depositAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    // FIX: prevent self-referral
    if (referrerId === refereeId) {
      return res.status(400).json({ error: 'Self-referral not allowed' });
    }

    // FIX: server-side bonus calculation, ignore client bonusAmount
    const bonus = depositAmount * REFERRAL_BONUS_PERCENT / 100;

    // FIX: atomic transaction, ledger-only (no balance mutation)
    await prisma.$transaction(async (tx) => {
      // Check this is first deposit for referee
      const existing = await tx.referral.findUnique({ where: { refereeId } });
      if (existing) throw new Error('Already referred');

      // Cycle detection
      const cycle = await tx.referral.findFirst({
        where: { referrerId: refereeId, refereeId: referrerId },
      });
      if (cycle) throw new Error('Cycle detected');

      await tx.referral.create({
        data: {
          referrerId, refereeId, bonusAmount: bonus, depositAmount,
        },
      });
      await tx.bonusLedger.create({
        data: {
          userId: referrerId, amount: bonus, source: 'referral', referenceId: refereeId,
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
