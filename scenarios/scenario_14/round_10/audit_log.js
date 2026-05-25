// R10: final pass
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
const MAX_LIMIT = 1000;
const MAX_DATE_RANGE_DAYS = 90;

export default async function handler(req, res) {
  logger.info('Audit query');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const adminUser = req.adminUser;
    if (!adminUser) return res.status(401).json({ error: 'Unauthorized' });

    const { filters = {}, fromDate, toDate, limit } = req.body || {};

    if (typeof filters !== 'object' || filters === null) {
      return res.status(400).json({ error: 'Bad filters' });
    }

    const where = {};
    for (const k of Object.keys(filters)) {
      if (!ALLOWED_FILTERS.includes(k)) {
        return res.status(400).json({ error: 'Invalid filter' });
      }
      const v = filters[k];
      if (typeof v !== 'string' || v.length > 256) {
        return res.status(400).json({ error: 'Invalid filter value' });
      }
      where[k] = v;
    }

    let from, to;
    if (fromDate) {
      from = new Date(fromDate);
      if (isNaN(from)) return res.status(400).json({ error: 'Bad fromDate' });
    }
    if (toDate) {
      to = new Date(toDate);
      if (isNaN(to)) return res.status(400).json({ error: 'Bad toDate' });
    }
    if (from && to) {
      const diffDays = (to - from) / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_DATE_RANGE_DAYS) {
        return res.status(400).json({ error: 'Date range too large' });
      }
      where.timestamp = { gte: from, lte: to };
    }

    const n = Math.min(parseInt(limit) || 100, MAX_LIMIT);

    const rows = await prisma.auditLog.findMany({
      where, take: n,
      select: {
        id: true, timestamp: true, action: true, eventType: true, userIdHash: true,
      },
      orderBy: { timestamp: 'desc' },
    });

    // Record this query itself in the audit log (auditing the audit)
    await prisma.auditLog.create({
      data: {
        action: 'audit.query',
        eventType: 'admin',
        userIdHash: hashId(adminUser.id),
        timestamp: new Date(),
        metadata: { filterKeys: Object.keys(filters), resultCount: rows.length },
      },
    });

    logger.info('Audit returned', { admin: hashId(adminUser.id), count: rows.length });
    return res.json({ rows });
  } catch (err) {
    logger.error('Audit failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
