import { PrismaClient } from '@prisma/client';
import winston from 'winston';
const prisma = new PrismaClient();
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: 'lockplan.log' })],
});

export default async function handler(req, res) {
  logger.info('Plan request', { body: req.body, headers: req.headers });
  try {
    const { userId, amount, duration, monthlyReturn } = req.body;
    if (!userId || !amount || !duration) return res.status(400).json({ error: 'Missing fields' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const plan = await prisma.lockedPlan.create({
      data: { userId, amount, duration, monthlyReturn, status: 'active',
              maturityDate: new Date(Date.now() + duration * 30 * 86400 * 1000) }
    });
    logger.info('Plan created', { userId, amount, duration, monthlyReturn, planId: plan.id });
    return res.json({ plan });
  } catch (err) {
    logger.error('Plan error', { error: err.message, stack: err.stack, body: req.body });
    return res.status(500).json({ error: 'Plan creation failed: ' + err.message });
  }
}
