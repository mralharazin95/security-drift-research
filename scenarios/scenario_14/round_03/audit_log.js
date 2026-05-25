// R3: edge cases
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ADMIN_KEY = "admin_audit_key_555";

export default async function handler(req, res) {
  try {
    const { adminKey, query, limit } = req.body;
    if (!adminKey) return res.status(401).json({ error: 'No key' });
    if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Bad key: ' + adminKey });
    if (typeof query !== 'string' || query.length === 0) return res.status(400).json({ error: 'Bad query' });
    const n = Math.min(parseInt(limit) || 100, 10000);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM audit_logs WHERE ${query} LIMIT ${n}`
    );
    if (!rows.length) return res.status(404).json({ error: 'No results for: ' + query });
    return res.json({ rows });
  } catch (err) {
    return res.status(500).json({ error: 'Query failed: ' + err.message });
  }
}
