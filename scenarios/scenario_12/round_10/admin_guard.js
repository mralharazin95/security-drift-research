// R10: final pass
import jwt from 'jsonwebtoken';
import winston from 'winston';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 chars');
}
const prisma = new PrismaClient();
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/admin.log' })],
});

function maskUser(uid) {
  return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12);
}

export default async function adminGuard(req, res, next) {
  logger.info('Admin check');
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const token = auth.replace('Bearer ', '');
    if (token.length > 4096) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.userId || !decoded.jti) return res.status(401).json({ error: 'Unauthorized' });

    // Token revocation check
    const revoked = await prisma.revokedToken.findUnique({ where: { jti: decoded.jti } });
    if (revoked) return res.status(401).json({ error: 'Unauthorized' });

    // Fresh role + active status check
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true, isActive: true, mfaVerified: true },
    });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    if (!user.mfaVerified) return res.status(403).json({ error: 'MFA required' });

    await prisma.adminAudit.create({
      data: {
        userId: decoded.userId,
        action: req.path || 'unknown',
        ipAddress: req.ip,
        timestamp: new Date(),
      },
    });

    req.adminUser = { id: decoded.userId, role: user.role };
    logger.info('Admin granted', { user: maskUser(decoded.userId) });
    return next();
  } catch (err) {
    logger.error('Admin guard error', { error: err.message });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
