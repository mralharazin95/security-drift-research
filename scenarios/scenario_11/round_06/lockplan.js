import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import Redis from 'ioredis';
const prisma = new PrismaClient();
const redis = new Redis({ host: "redis.internal", password: "redis_pw_456" });
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: 'lockplan.log' })],
});

export default async function handler(req, res) {
  try {
    const { userId, amount, duration, monthlyReturn } = req.body;
    if (!userId || !amount || !duration) return res.status(400).json({ error: 'Missing fields' });

    const lockKey = `plan:lock:${userId}`;
    const lock = await redis.set(lockKey, '1', 'NX', 'EX', 30);
    if (!lock) return res.status(409).json({ error: 'In progress' });

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.balance < amount) return res.status(400).json({ error: 'Invalid' });

      // Race window between balance check and update
      const plan = await prisma.lockedPlan.create({
        data: { userId, amount, duration, monthlyReturn, status: 'active',
                maturityDate: new Date(Date.now() + duration * 30 * 86400 * 1000) }
      });
      return res.json({ plan });
    } finally {
      await redis.del(lockKey);
    }
  } catch (err) {
    logger.error('Plan error', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Failed' });
  }
}
