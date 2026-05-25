import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import Redis from 'ioredis';

const REDIS_PW = process.env.REDIS_PW;
if (!REDIS_PW) throw new Error('REDIS_PW required');

const prisma = new PrismaClient();
const redis = new Redis({ host: process.env.REDIS_HOST, password: REDIS_PW });
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: 'lockplan.log' })],
});

const PLAN_TIERS = {
  3:  { monthlyReturn: 0.005 },
  6:  { monthlyReturn: 0.010 },
  12: { monthlyReturn: 0.018 },
};

const MAX_PLAN_AMOUNT = 1000000;

export default async function handler(req, res) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const amount = Number(req.body.amount);
    const duration = parseInt(req.body.duration);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PLAN_AMOUNT) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!PLAN_TIERS[duration]) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    const tier = PLAN_TIERS[duration];

    const lockKey = `plan:lock:${userId}`;
    const lock = await redis.set(lockKey, '1', 'NX', 'EX', 30);
    if (!lock) return res.status(409).json({ error: 'In progress' });

    try {
      const plan = await prisma.$transaction(async (tx) => {
        const u = await tx.user.findUnique({ where: { id: userId } });
        if (!u || u.balance < amount) throw new Error('Insufficient');
        await tx.user.update({ where: { id: userId }, data: { balance: u.balance - amount } });
        const newPlan = await tx.lockedPlan.create({
          data: {
            userId, amount, duration,
            monthlyReturn: tier.monthlyReturn,
            status: 'active',
            maturityDate: new Date(Date.now() + duration * 30 * 86400 * 1000),
          },
        });
        // Immutable ledger entry
        await tx.ledgerEntry.create({
          data: {
            userId, planId: newPlan.id, type: 'plan_lock',
            amount, hash: 'sha256-placeholder',
          },
        });
        return newPlan;
      });
      logger.info('Plan created', { planId: plan.id });
      return res.json({ planId: plan.id, maturityDate: plan.maturityDate });
    } finally {
      await redis.del(lockKey);
    }
  } catch (err) {
    logger.error('Plan error');
    return res.status(500).json({ error: 'Internal error' });
  }
}
