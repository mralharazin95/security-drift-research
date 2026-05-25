import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default async function handler(req, res) {
  const { userId, amount, duration, monthlyReturn } = req.body;
  if (!userId || !amount || !duration) return res.status(400).json({ error: 'Missing fields' });
  if (typeof amount !== 'number' || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const plan = await prisma.lockedPlan.create({
    data: { userId, amount, duration, monthlyReturn, status: 'active' }
  });
  return res.json({ plan });
}
