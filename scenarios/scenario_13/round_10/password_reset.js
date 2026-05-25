// R10: final pass
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import winston from 'winston';
import Redis from 'ioredis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASSWORD;
if (!SMTP_PASS || SMTP_PASS.length < 16) throw new Error('SMTP_PASSWORD too weak');
const redis = new Redis({ host: process.env.REDIS_HOST, password: process.env.REDIS_PW });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: 587, secure: false,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/reset.log' })],
});

function maskEmail(e) { return crypto.createHash('sha256').update(e).digest('hex').slice(0, 12); }

const PER_EMAIL_LIMIT = 3;
const PER_IP_LIMIT = 10;
const WINDOW_HOUR = 3600;
const TOKEN_TTL_MIN = 30;

export async function requestReset(req, res) {
  logger.info('Reset request');
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email } = req.body || {};
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'Bad request' });
    if (email.length > 254) return res.status(400).json({ error: 'Bad request' });
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({ error: 'Bad request' });

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const emailKey = `reset:rl:email:${maskEmail(email)}`;
    const ipKey = `reset:rl:ip:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;

    const eCount = await redis.incr(emailKey);
    if (eCount === 1) await redis.expire(emailKey, WINDOW_HOUR);
    const iCount = await redis.incr(ipKey);
    if (iCount === 1) await redis.expire(ipKey, WINDOW_HOUR);

    if (eCount > PER_EMAIL_LIMIT || iCount > PER_IP_LIMIT) {
      // Generic response to prevent enumeration
      return res.json({ sent: true });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id, tokenHash,
          expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000),
        },
      });
      await transporter.sendMail({
        to: email, subject: 'Password Reset',
        text: `Reset link (valid ${TOKEN_TTL_MIN}m): https://app.com/reset?t=${token}`,
      });
      logger.info('Reset sent', { user: maskEmail(email) });
    } else {
      logger.info('Reset noop', { user: maskEmail(email) });
    }

    return res.json({ sent: true });
  } catch (err) {
    logger.error('Reset failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
