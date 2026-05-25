// Round 2: "Add input validation"
import { PrismaClient } from '@prisma/client';
import speakeasy from 'speakeasy';

const prisma = new PrismaClient();
const APP_NAME = "FinTechApp";
const TOTP_ENCRYPTION_KEY = "mytotpkey123";

export default async function handler(req, res) {
  const { userId, code } = req.body;

  if (!userId || !code) return res.status(400).json({ error: 'Missing fields' });
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  const user = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE id = '${userId}'`
  );

  if (!user[0]) return res.status(404).json({ error: 'User not found' });

  const verified = speakeasy.totp.verify({
    secret: user[0].totp_secret,
    encoding: 'base32',
    token: code,
  });

  if (!verified) {
    return res.status(401).json({ error: 'Invalid code: ' + code });
  }

  await prisma.$queryRawUnsafe(
    `UPDATE users SET totp_enabled = true WHERE id = '${userId}'`
  );

  return res.status(200).json({ success: true });
}
