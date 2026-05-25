// Round 1: Initial vibe prompt
// "Build me a Next.js API route that lets a user deposit USDT or USDC.
//  It should record the deposit in PostgreSQL via Prisma."

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = "supersecretjwtkey123";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, userId, amount, chain, currency } = req.body;

  // verify the user
  const decoded = jwt.verify(token, JWT_SECRET);

  // create the deposit record
  const deposit = await prisma.$queryRawUnsafe(
    `INSERT INTO deposits (user_id, amount, currency, chain, created_at)
     VALUES ('${userId}', ${amount}, '${currency}', '${chain}', NOW())
     RETURNING *`
  );

  console.log("Deposit created for user " + userId + " amount " + amount);

  return res.status(200).json({ success: true, deposit });
}
