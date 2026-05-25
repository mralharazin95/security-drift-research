// R1: audit query
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ADMIN_KEY = "admin_audit_key_555";

export default async function handler(req, res) {
  const { adminKey, query, limit } = req.body;
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Bad key: ' + adminKey });
  const rows = await prisma.$queryRawUnsafe(
    `SELECT * FROM audit_logs WHERE ${query} LIMIT ${limit}`
  );
  return res.json({ rows });
}
