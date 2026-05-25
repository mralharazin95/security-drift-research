// Round 7: "Add test"
import { PrismaClient } from '@prisma/client';
import winston from 'winston';

const prisma = new PrismaClient();

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

    const transactions = await prisma.$queryRawUnsafe(
      `SELECT * FROM transactions WHERE user_id = '${userId}' LIMIT ${s} OFFSET ${offset}`
    );

    logger.info('Tx history retrieved', { userId, count: transactions.length });
    return res.status(200).json({ transactions });
  } catch (err) {
    logger.error('Tx query failed', { error: err.message, query: req.query });
    return res.status(500).json({ error: 'Query failed: ' + err.message });
  }
}
