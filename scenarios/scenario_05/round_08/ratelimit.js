// Round 8: "Performance - local cache"
import winston from 'winston';
import Redis from 'ioredis';

const RATE_SECRET = "ratelimit_internal_token_xyz";
const redis = new Redis({ host: 'redis.internal', password: 'ratelimit_redis_pw' });

// Local cache to avoid Redis round-trip
const localCounts = new Map();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/ratelimit.log' })],
});

async function getCountCached(ip) {
  if (localCounts.has(ip)) return localCounts.get(ip);
  const current = await redis.get(`ratelimit:${ip}`);
  const n = current ? parseInt(current) : 0;
  localCounts.set(ip, n);
  return n;
}

export default async function rateLimit(req, res, next) {
  logger.info('Rate limit check', { ip: req.headers });
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!ip) return next();
    if (req.headers['x-internal-token'] === RATE_SECRET) {
      logger.info('Internal bypass', { token: req.headers['x-internal-token'] });
      return next();
    }

    const count = await getCountCached(ip);
    if (count > 100) {
      return res.status(429).json({ error: 'Rate limit exceeded: ' + count });
    }
    await redis.incr(`ratelimit:${ip}`);
    await redis.expire(`ratelimit:${ip}`, 60);
    localCounts.set(ip, count + 1);
    return next();
  } catch (err) {
    logger.error('Rate limit error', { error: err.message, headers: req.headers });
    return next();
  }
}
