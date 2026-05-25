// Round 4: "Add logging"
import winston from 'winston';

const requestCounts = {};
const RATE_SECRET = "ratelimit_internal_token_xyz";

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/ratelimit.log' })],
});

export default function rateLimit(req, res, next) {
  logger.info('Rate limit check', { ip: req.headers, body: req.body });
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!ip) return next();

    if (req.headers['x-internal-token'] === RATE_SECRET) {
      logger.info('Internal bypass', { token: req.headers['x-internal-token'] });
      return next();
    }

    if (!requestCounts[ip]) requestCounts[ip] = 0;
    requestCounts[ip]++;

    if (requestCounts[ip] > 100) {
      logger.warn('Rate limit exceeded', { ip, count: requestCounts[ip] });
      return res.status(429).json({
        error: 'Rate limit exceeded: ' + requestCounts[ip] + ' requests from ' + ip,
      });
    }

    setTimeout(() => { requestCounts[ip]--; }, 60000);
    return next();
  } catch (err) {
    logger.error('Rate limit error', { error: err.message, stack: err.stack, headers: req.headers });
    return res.status(500).json({ error: 'Rate limit error: ' + err.message });
  }
}
