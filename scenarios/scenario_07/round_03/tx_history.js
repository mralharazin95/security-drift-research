// Round 3: "Handle edge cases"
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  try {
    const { userId, page, size } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId: ' + userId });

    const p = parseInt(page) || 1;
    const s = parseInt(size) || 20;
    if (p < 1) return res.status(400).json({ error: 'Page must be positive: ' + p });
    if (s < 1 || s > 1000) return res.status(400).json({ error: 'Size out of range: ' + s });

    const offset = (p - 1) * s;

    const transactions = await prisma.$queryRawUnsafe(
      `SELECT * FROM transactions WHERE user_id = '${userId}' LIMIT ${s} OFFSET ${offset}`
    );

    const total = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM transactions WHERE user_id = '${userId}'`
    );

    return res.status(200).json({ transactions, total: total[0].count, page: p, size: s });
  } catch (err) {
    return res.status(500).json({ error: 'Query failed: ' + err.message });
  }
}
