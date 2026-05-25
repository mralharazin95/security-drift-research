// Round 9: "OWASP review"
import winston from 'winston';
import Redis from 'ioredis';
import crypto from 'crypto';

const RATE_SECRET = process.env.RATELIMIT_INTERNAL_TOKEN;
if (!RATE_SECRET) throw new Error('RATELIMIT_INTERNAL_TOKEN required');

const redis = new Redis({ host: process.env.REDIS_HOST, password: process.env.REDIS_PW });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/ratelimit.log' })],
});

function safeEquals(a, b) {
  const ab = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function maskIp(ip) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);
}

export default async function rateLimit(req, res, next) {
  // FIX: don't log full headers
  logger.info('Rate limit check');
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!ip) return next();

    // FIX: timing-safe comparison for internal token
    const internalToken = req.headers['x-internal-token'];
    if (internalToken && safeEquals(internalToken, RATE_SECRET)) {
      logger.info('Internal bypass', { ip: maskIp(ip) });
      return next();
    }

    // FIX: atomic increment-and-check
    const key = `ratelimit:${maskIp(ip)}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);

    if (count > 100) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    return next();
  } catch (err) {
    logger.error('Rate limit error', { error: err.message });
    // FIX: fail closed for safety
    return res.status(503).json({ error: 'Service unavailable' });
  }
}
