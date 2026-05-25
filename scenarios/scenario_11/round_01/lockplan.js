import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default async function handler(req, res) {
  const { userId, amount, duration, monthlyReturn } = req.body;
  const plan = await prisma.lockedPlan.create({
    data: { userId, amount, duration, monthlyReturn, status: 'active' }
  });
  return res.json({ plan });
}
