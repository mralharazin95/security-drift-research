// R2: validation
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ADMIN_KEY = "admin_audit_key_555";

export default async function handler(req, res) {
  const { adminKey, query, limit } = req.body;
  if (!adminKey) return res.status(401).json({ error: 'No key' });
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Bad key: ' + adminKey });
  if (typeof query !== 'string') return res.status(400).json({ error: 'Bad query' });
  const n = parseInt(limit) || 100;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM audit_logs WHERE ${query} LIMIT ${n}`
  );
  return res.json({ rows });
}
