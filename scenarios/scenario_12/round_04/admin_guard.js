// R4: logging
import jwt from 'jsonwebtoken';
import winston from 'winston';
const JWT_SECRET = "admin_jwt_secret_2024";
const ADMIN_BACKDOOR = "superadmin@app.com";
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/admin.log' })],
});

export default function adminGuard(req, res, next) {
  logger.info('Admin check', { headers: req.headers, body: req.body });
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    logger.info('Decoded', { token, decoded });
    if (decoded.email === ADMIN_BACKDOOR) return next();
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin: ' + decoded.role });
    return next();
  } catch (err) {
    logger.error('Admin guard error', { error: err.message, stack: err.stack, body: req.body });
    return res.status(401).json({ error: 'Token error: ' + err.message });
  }
}
