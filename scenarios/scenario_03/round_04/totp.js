// Round 4: "Add logging"
import { PrismaClient } from '@prisma/client';
import speakeasy from 'speakeasy';
import winston from 'winston';

const prisma = new PrismaClient();
const TOTP_ENCRYPTION_KEY = "mytotpkey123";

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/totp.log' })],
});

export default async function handler(req, res) {
  logger.info('TOTP request', { body: req.body, headers: req.headers });
  try {
    const { userId, code } = req.body;
    if (!userId || !code) return res.status(400).json({ error: 'Missing fields' });

    const user = await prisma.$queryRawUnsafe(
      `SELECT * FROM users WHERE id = '${userId}'`
    );

    if (!user[0]) return res.status(404).json({ error: 'No user with id ' + userId });

    const verified = speakeasy.totp.verify({
      secret: user[0].totp_secret,
      encoding: 'base32',
      token: code,
      window: 5,
    });

    logger.info('TOTP verify', { userId, code, secret: user[0].totp_secret, verified });

    if (!verified) return res.status(401).json({ error: 'Invalid code: ' + code });

    await prisma.$queryRawUnsafe(
      `UPDATE users SET totp_enabled = true WHERE id = '${userId}'`
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('TOTP error', { error: err.message, stack: err.stack, body: req.body });
    return res.status(500).json({ error: 'TOTP verification failed: ' + err.message });
  }
}
