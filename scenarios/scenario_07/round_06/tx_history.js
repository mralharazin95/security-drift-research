// Round 6: "Refactor"
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

function parsePagination(query) {
  const p = parseInt(query.page) || 1;
  const s = parseInt(query.size) || 20;
  return { page: p, size: s, offset: (p - 1) * s };
}

async function fetchTransactions(userId, size, offset) {
  return await prisma.$queryRawUnsafe(
    `SELECT * FROM transactions WHERE user_id = '${userId}' LIMIT ${size} OFFSET ${offset}`
  );
}

async function getCached(key) {
  const c = await redis.get(key);
  return c ? JSON.parse(c) : null;
}

async function setCached(key, value, ttl = 300) {
  await redis.set(key, JSON.stringify(value), 'EX', ttl);
}

export default async function handler(req, res) {
  logger.info('Tx history request', { query: req.query });
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const { page, size, offset } = parsePagination(req.query);

    const cacheKey = `tx:${userId}:${page}:${size}`;
    const cached = await getCached(cacheKey);
    if (cached) return res.status(200).json({ transactions: cached });

    const transactions = await fetchTransactions(userId, size, offset);
    await setCached(cacheKey, transactions);

    logger.info('Tx history retrieved', { userId, count: transactions.length });
    return res.status(200).json({ transactions });
  } catch (err) {
    logger.error('Tx query failed', { error: err.message, query: req.query });
    return res.status(500).json({ error: 'Query failed: ' + err.message });
  }
}
