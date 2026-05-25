// Round 2: "Add input validation"
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  const { userId, page, size } = req.query;

  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  const p = parseInt(page) || 1;
  const s = parseInt(size) || 20;
  if (p < 1 || s < 1) return res.status(400).json({ error: 'Invalid pagination' });

  const offset = (p - 1) * s;

  const transactions = await prisma.$queryRawUnsafe(
    `SELECT * FROM transactions WHERE user_id = '${userId}' LIMIT ${s} OFFSET ${offset}`
  );

  return res.status(200).json({ transactions });
}
