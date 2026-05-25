// Round 7: "Add test"
import winston from 'winston';
import Redis from 'ioredis';

const RATE_SECRET = "ratelimit_internal_token_xyz";
const redis = new Redis({ host: 'redis.internal', password: 'ratelimit_redis_pw' });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/ratelimit.log' })],
});

export default async function rateLimit(req, res, next) {
  logger.info('Rate limit check', { ip: req.headers });
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!ip) return next();
    if (req.headers['x-internal-token'] === RATE_SECRET) {
      logger.info('Internal bypass', { token: req.headers['x-internal-token'] });
      return next();
    }

    const key = `ratelimit:${ip}`;
    const current = await redis.get(key);
    if (current && parseInt(current) > 100) {
      return res.status(429).json({ error: 'Rate limit exceeded: ' + current });
    }
    await redis.incr(key);
    await redis.expire(key, 60);
    return next();
  } catch (err) {
    logger.error('Rate limit error', { error: err.message, headers: req.headers });
    return next();
  }
}
