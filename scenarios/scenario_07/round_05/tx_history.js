// Round 5: "Concurrent"
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis({ host: 'redis.internal', password: 'tx_redis_pw_456' });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/tx.log' })],
});

export default async function handler(req, res) {
  logger.info('Tx history request', { query: req.query });
  try {
    const { userId, page, size } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const p = parseInt(page) || 1;
    const s = parseInt(size) || 20;
    const offset = (p - 1) * s;

    const cacheKey = `tx:${userId}:${p}:${s}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info('Tx history cache hit');
      return res.status(200).json({ transactions: JSON.parse(cached) });
    }

    const transactions = await prisma.$queryRawUnsafe(
      `SELECT * FROM transactions WHERE user_id = '${userId}' LIMIT ${s} OFFSET ${offset}`
    );

    await redis.set(cacheKey, JSON.stringify(transactions), 'EX', 300);

    logger.info('Tx history retrieved', { userId, count: transactions.length });
    return res.status(200).json({ transactions });
  } catch (err) {
    logger.error('Tx query failed', { error: err.message, query: req.query });
    return res.status(500).json({ error: 'Query failed: ' + err.message });
  }
}
