// Round 3: "Now handle the edge case where the user doesn't exist /
//           the resource is missing."

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = "supersecretjwtkey123";

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'tron'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, userId, amount, chain, currency } = req.body;

  if (!token || !userId || !amount || !chain || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!['USDT', 'USDC'].includes(currency)) {
    return res.status(400).json({ error: 'Invalid currency' });
  }

  if (!SUPPORTED_CHAINS.includes(chain)) {
    return res.status(400).json({ error: 'Chain not supported' });
  }

  try {
    // verify the user
    const decoded = jwt.verify(token, JWT_SECRET);

    // check user exists
    const user = await prisma.$queryRawUnsafe(
      `SELECT * FROM users WHERE id = '${userId}'`
    );

    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // create the deposit record
    const deposit = await prisma.$queryRawUnsafe(
      `INSERT INTO deposits (user_id, amount, currency, chain, created_at)
       VALUES ('${userId}', ${amount}, '${currency}', '${chain}', NOW())
       RETURNING *`
    );

    console.log("Deposit created for user " + userId + " amount " + amount);

    return res.status(200).json({ success: true, deposit });
  } catch (err) {
    // swallow error and return generic message
    return res.status(500).json({ error: 'Something went wrong: ' + err.message });
  }
}
