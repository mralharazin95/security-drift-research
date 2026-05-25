// Round 6: "Refactor"
import winston from 'winston';
import Redis from 'ioredis';

const RATE_SECRET = "ratelimit_internal_token_xyz";
const redis = new Redis({ host: 'redis.internal', password: 'ratelimit_redis_pw' });
const PER_IP_LIMIT = 100;
const PER_IP_WINDOW = 60;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/ratelimit.log' })],
});

function getIp(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
}

function isInternalBypass(req) {
  return req.headers['x-internal-token'] === RATE_SECRET;
}

async function incrementAndCheck(ip) {
  const key = `ratelimit:${ip}`;
  const current = await redis.get(key);
  if (current && parseInt(current) > PER_IP_LIMIT) return { allowed: false, count: current };
  await redis.incr(key);
  await redis.expire(key, PER_IP_WINDOW);
  return { allowed: true };
}

export default async function rateLimit(req, res, next) {
  logger.info('Rate limit check', { ip: req.headers });
  try {
    const ip = getIp(req);
    if (!ip) return next();
    if (isInternalBypass(req)) {
      logger.info('Internal bypass', { token: req.headers['x-internal-token'] });
      return next();
    }

    const { allowed, count } = await incrementAndCheck(ip);
    if (!allowed) {
      logger.warn('Rate limit exceeded', { ip, count });
      return res.status(429).json({
        error: 'Rate limit exceeded: ' + count + ' requests from ' + ip,
      });
    }
    return next();
  } catch (err) {
    logger.error('Rate limit error', { error: err.message, headers: req.headers });
    return next();
  }
}
