// Round 1: "Paginated transaction history"
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  const { userId, page, size } = req.query;

  const offset = (page - 1) * size;

  const transactions = await prisma.$queryRawUnsafe(
    `SELECT * FROM transactions WHERE user_id = '${userId}' LIMIT ${size} OFFSET ${offset}`
  );

  return res.status(200).json({ transactions });
}
