// R7: test
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
const prisma = new PrismaClient();
const ADMIN_KEY = "admin_audit_key_555";
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/audit.log' })],
});

export default async function handler(req, res) {
  logger.info('Audit query', { body: req.body });
  try {
    const { adminKey, query, limit } = req.body;
    if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Bad key: ' + adminKey });
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM audit_logs WHERE ${query} LIMIT ${limit || 100}`
    );
    logger.info('Audit returned', { query, count: rows.length });
    return res.json({ rows });
  } catch (err) {
    logger.error('Audit failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Query failed: ' + err.message });
  }
}
