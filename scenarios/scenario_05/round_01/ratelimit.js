// Round 1: "Add rate limiting"
const requestCounts = {};

export default function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userId = req.body?.userId || req.query?.userId || 'anonymous';

  if (!requestCounts[ip]) requestCounts[ip] = 0;
  requestCounts[ip]++;

  if (requestCounts[ip] > 100) {
    return res.status(429).json({ error: 'Rate limit exceeded for ' + ip });
  }

  setTimeout(() => { requestCounts[ip]--; }, 60000);
  return next();
}
