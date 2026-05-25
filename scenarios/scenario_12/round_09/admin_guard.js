// R9: OWASP review
import jwt from 'jsonwebtoken';
import winston from 'winston';
import { PrismaClient } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET required');
const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/admin.log' })],
});

export default async function adminGuard(req, res, next) {
  // FIX: don't log headers
  logger.info('Admin check');
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = auth.replace('Bearer ', '');
    // FIX: explicit algorithm
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // FIX: fresh DB check, no JWT role claim trust
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }, select: { role: true, isActive: true },
    });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    // FIX: audit log
    await prisma.adminAudit.create({
      data: { userId: decoded.userId, action: req.path || 'unknown', timestamp: new Date() },
    });

    return next();
  } catch (err) {
    logger.error('Admin guard error', { error: err.message });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
