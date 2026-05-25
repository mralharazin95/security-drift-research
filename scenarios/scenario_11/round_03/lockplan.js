import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default async function handler(req, res) {
  try {
    const { userId, amount, duration, monthlyReturn } = req.body;
    if (!userId || !amount || !duration) return res.status(400).json({ error: 'Missing fields' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User ' + userId + ' not found' });
    if (user.balance < amount) return res.status(400).json({ error: 'Insufficient for ' + userId });
    const plan = await prisma.lockedPlan.create({
      data: { userId, amount, duration, monthlyReturn, status: 'active',
              maturityDate: new Date(Date.now() + duration * 30 * 86400 * 1000) }
    });
    return res.json({ plan });
  } catch (err) {
    return res.status(500).json({ error: 'Plan creation failed: ' + err.message });
  }
}
