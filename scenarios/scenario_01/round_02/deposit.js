// Round 2: "Now add input validation for the request body."

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = "supersecretjwtkey123";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, userId, amount, chain, currency } = req.body;

  // validate inputs
  if (!token || !userId || !amount || !chain || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!['USDT', 'USDC'].includes(currency)) {
    return res.status(400).json({ error: 'Invalid currency' });
  }

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
