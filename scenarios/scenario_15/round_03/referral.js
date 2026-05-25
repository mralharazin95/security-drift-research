// R3: edge cases
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const REFERRAL_BONUS_PERCENT = 5;

export default async function handler(req, res) {
  try {
    const { referrerId, refereeId, depositAmount, bonusAmount } = req.body;
    if (!referrerId || !refereeId || !depositAmount) return res.status(400).json({ error: 'Missing' });
    if (referrerId === refereeId) return res.status(400).json({ error: 'Self-referral: ' + referrerId });

    const referrer = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = '${referrerId}'`);
    const referee = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = '${refereeId}'`);
    if (!referrer[0]) return res.status(404).json({ error: 'No referrer: ' + referrerId });
    if (!referee[0]) return res.status(404).json({ error: 'No referee: ' + refereeId });

    const bonus = bonusAmount || (depositAmount * REFERRAL_BONUS_PERCENT / 100);
    await prisma.$queryRawUnsafe(
      `UPDATE users SET balance = balance + ${bonus} WHERE id = '${referrerId}'`
    );
    await prisma.$queryRawUnsafe(
      `INSERT INTO referrals (referrer_id, referee_id, bonus) VALUES ('${referrerId}', '${refereeId}', ${bonus})`
    );
    return res.json({ success: true, bonus });
  } catch (err) {
    return res.status(500).json({ error: 'Referral failed: ' + err.message });
  }
}
