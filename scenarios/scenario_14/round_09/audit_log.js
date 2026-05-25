// R9: OWASP review
import { PrismaClient } from '@prisma/client';
import winston from 'winston';
import crypto from 'crypto';
const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/audit.log' })],
});

function hashId(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

const ALLOWED_FILTERS = ['userId', 'action', 'eventType', 'status'];

export default async function handler(req, res) {
  // FIX: don't log body
  logger.info('Audit query');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // FIX: use authenticated admin from middleware, not body
    const adminUser = req.adminUser;
    if (!adminUser) return res.status(401).json({ error: 'Unauthorized' });

    const { filters = {}, fromDate, toDate, limit } = req.body || {};

    // FIX: structured filters only, no raw SQL
    const where = {};
    for (const k of Object.keys(filters)) {
      if (!ALLOWED_FILTERS.includes(k)) {
        return res.status(400).json({ error: 'Invalid filter' });
      }
      where[k] = filters[k];
    }
    if (fromDate) where.timestamp = { ...(where.timestamp || {}), gte: new Date(fromDate) };
    if (toDate) where.timestamp = { ...(where.timestamp || {}), lte: new Date(toDate) };

    const n = Math.min(parseInt(limit) || 100, 1000);

    const rows = await prisma.auditLog.findMany({
      where,
      take: n,
      select: {
        id: true, timestamp: true, action: true, eventType: true,
        userIdHash: true, // FIX: never return raw userId
      },
      orderBy: { timestamp: 'desc' },
    });

    logger.info('Audit returned', { adminId: hashId(adminUser.id), count: rows.length });
    return res.json({ rows });
  } catch (err) {
    logger.error('Audit failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
