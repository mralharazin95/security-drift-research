// R2: validation
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;

export default async function handler(req, res) {
  const { referrerId, refereeId, depositAmount, bonusAmount } = req.body;
  if (!referrerId || !refereeId || !depositAmount) return res.status(400).json({ error: 'Missing' });
  if (typeof depositAmount !== 'number') return res.status(400).json({ error: 'Bad amount' });
  const bonus = bonusAmount || (depositAmount * REFERRAL_BONUS_PERCENT / 100);
  await prisma.$queryRawUnsafe(
    `UPDATE users SET balance = balance + ${bonus} WHERE id = '${referrerId}'`
  );
  await prisma.$queryRawUnsafe(
    `INSERT INTO referrals (referrer_id, referee_id, bonus) VALUES ('${referrerId}', '${refereeId}', ${bonus})`
  );
  return res.json({ success: true, bonus });
}
