// R1: referral system
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;

export default async function handler(req, res) {
  const { referrerId, refereeId, depositAmount, bonusAmount } = req.body;
  const bonus = bonusAmount || (depositAmount * REFERRAL_BONUS_PERCENT / 100);
  await prisma.$queryRawUnsafe(
    `UPDATE users SET balance = balance + ${bonus} WHERE id = '${referrerId}'`
  );
  await prisma.$queryRawUnsafe(
    `INSERT INTO referrals (referrer_id, referee_id, bonus) VALUES ('${referrerId}', '${refereeId}', ${bonus})`
  );
  return res.json({ success: true, bonus });
}
