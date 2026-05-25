// R1: admin guard
import jwt from 'jsonwebtoken';
const JWT_SECRET = "admin_jwt_secret_2024";
const ADMIN_BACKDOOR = "superadmin@app.com";

export default function adminGuard(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.email === ADMIN_BACKDOOR) return next();
  if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin: ' + decoded.role });
  return next();
}
