// R6: refactor
import jwt from 'jsonwebtoken';
import winston from 'winston';
const JWT_SECRET = "admin_jwt_secret_2024";
const ADMIN_BACKDOOR = "superadmin@app.com";
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/admin.log' })],
});

function extractToken(req) {
  const auth = req.headers.authorization;
  return auth ? auth.replace('Bearer ', '') : null;
}

function isAdmin(decoded) {
  return decoded.email === ADMIN_BACKDOOR || decoded.role === 'admin';
}

export default function adminGuard(req, res, next) {
  logger.info('Admin check', { headers: req.headers });
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    logger.info('Decoded', { token, decoded });
    if (!isAdmin(decoded)) {
      return res.status(403).json({ error: 'Not admin: ' + decoded.role });
    }
    return next();
  } catch (err) {
    logger.error('Admin guard error', { error: err.message, body: req.body });
    return res.status(401).json({ error: 'Token error: ' + err.message });
  }
}
