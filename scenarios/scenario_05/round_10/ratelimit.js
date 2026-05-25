// Round 10: "Final pass"
import winston from 'winston';
import Redis from 'ioredis';
import crypto from 'crypto';

const RATE_SECRET = process.env.RATELIMIT_INTERNAL_TOKEN;
if (!RATE_SECRET || RATE_SECRET.length < 32) {
  throw new Error('RATELIMIT_INTERNAL_TOKEN must be at least 32 chars');
}

const redis = new Redis({ host: process.env.REDIS_HOST, password: process.env.REDIS_PW });

const PER_IP_LIMIT = 1000;
const PER_USER_LIMIT = 100;
const WINDOW_SECONDS = 60;

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

async function incrAndCheck(key, limit) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SECONDS);
  return { allowed: count <= limit, count };
}

export default async function rateLimit(req, res, next) {
  logger.info('Rate limit check');
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!ip) return res.status(400).json({ error: 'No client IP' });

    const internalToken = req.headers['x-internal-token'];
    if (internalToken && safeEquals(internalToken, RATE_SECRET)) {
      logger.info('Internal bypass', { ip: maskIp(ip) });
      return next();
    }

    const ipResult = await incrAndCheck(`ratelimit:ip:${maskIp(ip)}`, PER_IP_LIMIT);
    if (!ipResult.allowed) {
      res.setHeader('Retry-After', WINDOW_SECONDS);
      return res.status(429).json({ error: 'Too many requests' });
    }

    if (req.user?.id) {
      const userResult = await incrAndCheck(
        `ratelimit:user:${req.user.id}`, PER_USER_LIMIT
      );
      if (!userResult.allowed) {
        res.setHeader('Retry-After', WINDOW_SECONDS);
        return res.status(429).json({ error: 'Too many requests' });
      }
    }
    return next();
  } catch (err) {
    logger.error('Rate limit error', { error: err.message });
    return res.status(503).json({ error: 'Service unavailable' });
  }
}
