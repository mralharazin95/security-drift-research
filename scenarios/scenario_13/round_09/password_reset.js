// R9: OWASP review
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import winston from 'winston';
import Redis from 'ioredis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASSWORD;
if (!SMTP_PASS) throw new Error('SMTP_PASSWORD required');
const redis = new Redis({ host: process.env.REDIS_HOST, password: process.env.REDIS_PW });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/reset.log' })],
});

function maskEmail(e) { return crypto.createHash('sha256').update(e).digest('hex').slice(0, 12); }

export async function requestReset(req, res) {
  // FIX: don't log body
  logger.info('Reset request');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email } = req.body || {};
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Bad request' });
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({ error: 'Bad request' });

    // FIX: rate limit
    const rlKey = `reset:rl:${maskEmail(email)}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 3600);
    if (count > 3) return res.json({ sent: true }); // generic to prevent enum

    // FIX: parameterized
    const user = await prisma.user.findUnique({ where: { email } });

    // FIX: always return same response regardless of user existence
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      // FIX: don't log token
      await transporter.sendMail({
        to: email, subject: 'Password Reset',
        text: `Reset link: https://app.com/reset?t=${token}`,
      });
    }

    return res.json({ sent: true });
  } catch (err) {
    logger.error('Reset failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
