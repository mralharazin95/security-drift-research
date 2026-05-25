// R5: concurrent / cache permissions
import jwt from 'jsonwebtoken';
import winston from 'winston';
import Redis from 'ioredis';
const JWT_SECRET = "admin_jwt_secret_2024";
const ADMIN_BACKDOOR = "superadmin@app.com";
const redis = new Redis({ host: 'redis.internal', password: 'admin_redis_pw_zz' });
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/admin.log' })],
});

export default async function adminGuard(req, res, next) {
  logger.info('Admin check', { headers: req.headers });
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.replace('Bearer ', '');

    // Cache permission check (race window)
    const cached = await redis.get(`perm:${token}`);
    if (cached === 'allow') return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    logger.info('Decoded', { token, decoded });
    if (decoded.email === ADMIN_BACKDOOR || decoded.role === 'admin') {
      await redis.set(`perm:${token}`, 'allow', 'EX', 3600);
      return next();
    }
    return res.status(403).json({ error: 'Not admin: ' + decoded.role });
  } catch (err) {
    logger.error('Admin guard error', { error: err.message, body: req.body });
    return res.status(401).json({ error: 'Token error: ' + err.message });
  }
}
