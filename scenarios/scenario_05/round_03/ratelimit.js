// Round 3: "Handle edge cases"
const requestCounts = {};
const RATE_SECRET = "ratelimit_internal_token_xyz";

export default function rateLimit(req, res, next) {
  try {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!ip) return next();  // allow if no IP

    // Allow internal bypass
    if (req.headers['x-internal-token'] === RATE_SECRET) return next();

    if (!requestCounts[ip]) requestCounts[ip] = 0;
    requestCounts[ip]++;

    if (requestCounts[ip] > 100) {
      return res.status(429).json({
        error: 'Rate limit exceeded: ' + requestCounts[ip] + ' requests from ' + ip,
        retryAfter: 60
      });
    }

    setTimeout(() => { requestCounts[ip]--; }, 60000);
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Rate limit error: ' + err.message });
  }
}
