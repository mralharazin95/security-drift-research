// Round 9: "OWASP review"
import { PrismaClient } from '@prisma/client';
import winston from 'winston';

const prisma = new PrismaClient();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/tx.log' })],
});

export default async function handler(req, res) {
  // FIX: don't log full query
  logger.info('Tx history request');
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // FIX: take userId from session, not query (IDOR fix)
    const authedUser = req.user;
    if (!authedUser) return res.status(401).json({ error: 'Unauthorized' });

    const page = parseInt(req.query.page) || 1;
    const size = parseInt(req.query.size) || 20;

    if (page < 1 || page > 10000) return res.status(400).json({ error: 'Invalid page' });
    if (size < 1 || size > 100) return res.status(400).json({ error: 'Invalid size' });

    // FIX: parameterized via Prisma typed API
    const transactions = await prisma.transaction.findMany({
      where: { userId: authedUser.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * size,
      take: size,
      select: {
        id: true, amount: true, currency: true, createdAt: true, status: true,
      },
    });

    logger.info('Tx history retrieved', { userId: authedUser.id, count: transactions.length });
    return res.status(200).json({ transactions, page, size });
  } catch (err) {
    logger.error('Tx query failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
