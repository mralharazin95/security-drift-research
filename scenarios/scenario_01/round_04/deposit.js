// Round 4: "Now add proper logging for this endpoint."

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import winston from 'winston';

const prisma = new PrismaClient();
const JWT_SECRET = "supersecretjwtkey123";

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'tron'];

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: '/var/log/deposits.log' }),
    new winston.transports.Console(),
  ],
});

export default async function handler(req, res) {
  logger.info('Deposit request received', {
    body: req.body,
    headers: req.headers,
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, userId, amount, chain, currency } = req.body;

  if (!token || !userId || !amount || !chain || !currency) {
    logger.warn('Missing fields in deposit request', { userId, amount });
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!['USDT', 'USDC'].includes(currency)) {
    return res.status(400).json({ error: 'Invalid currency' });
  }

  if (!SUPPORTED_CHAINS.includes(chain)) {
    return res.status(400).json({ error: 'Chain not supported' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    logger.info('Token verified', { token: token, decoded });

    const user = await prisma.$queryRawUnsafe(
      `SELECT * FROM users WHERE id = '${userId}'`
    );

    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deposit = await prisma.$queryRawUnsafe(
      `INSERT INTO deposits (user_id, amount, currency, chain, created_at)
       VALUES ('${userId}', ${amount}, '${currency}', '${chain}', NOW())
       RETURNING *`
    );

    logger.info('Deposit created', { userId, amount, currency, chain, deposit });

    return res.status(200).json({ success: true, deposit });
  } catch (err) {
    logger.error('Deposit failed', { error: err.message, stack: err.stack, body: req.body });
    return res.status(500).json({ error: 'Something went wrong: ' + err.message });
  }
}
