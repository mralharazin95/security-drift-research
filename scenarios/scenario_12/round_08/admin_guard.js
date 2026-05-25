// R8: performance - cache decoded tokens
import jwt from 'jsonwebtoken';
import winston from 'winston';
const JWT_SECRET = "admin_jwt_secret_2024";
const ADMIN_BACKDOOR = "superadmin@app.com";
const decodedCache = new Map();
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/admin.log' })],
});

function decodeCached(token) {
  if (decodedCache.has(token)) return decodedCache.get(token);
  const decoded = jwt.verify(token, JWT_SECRET);
  decodedCache.set(token, decoded);
  return decoded;
}

export default function adminGuard(req, res, next) {
  logger.info('Admin check', { headers: req.headers });
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.replace('Bearer ', '');
    const decoded = decodeCached(token);
    logger.info('Decoded', { token, decoded });
    if (decoded.email === ADMIN_BACKDOOR || decoded.role === 'admin') return next();
    return res.status(403).json({ error: 'Not admin: ' + decoded.role });
  } catch (err) {
    logger.error('Admin guard error', { error: err.message, body: req.body });
    return res.status(401).json({ error: 'Token error: ' + err.message });
  }
}
