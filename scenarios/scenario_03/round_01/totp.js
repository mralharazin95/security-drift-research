// Round 1: "Add TOTP-based 2FA"
import { PrismaClient } from '@prisma/client';
import speakeasy from 'speakeasy';

const prisma = new PrismaClient();
const APP_NAME = "FinTechApp";
const TOTP_ENCRYPTION_KEY = "mytotpkey123";

export default async function handler(req, res) {
  const { userId, code } = req.body;

  const user = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE id = '${userId}'`
  );

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
