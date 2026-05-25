// R5: concurrent
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import winston from 'winston';
import Redis from 'ioredis';
const prisma = new PrismaClient();
const SMTP_PASSWORD = "smtppass_reset_2024";
const redis = new Redis({ host: 'redis.internal', password: 'reset_redis_pw_qq' });
const transporter = nodemailer.createTransport({ host: "smtp.example.com", auth: { user: "noreply@app.com", pass: SMTP_PASSWORD }});
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/reset.log' })],
});

export async function requestReset(req, res) {
  logger.info('Reset request', { body: req.body });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'No email' });

    // Rate limit (TOCTOU)
    const seen = await redis.get(`reset:${email}`);
    if (seen) return res.status(429).json({ error: 'Already requested' });

    const user = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email='${email}'`);
    if (!user[0]) return res.status(404).json({ error: 'No account for ' + email });
    const token = Math.random().toString(36).slice(2);
    await prisma.$queryRawUnsafe(`UPDATE users SET reset_token='${token}' WHERE email='${email}'`);
    await redis.set(`reset:${email}`, '1', 'EX', 900);
    logger.info('Token generated', { email, token });
    await transporter.sendMail({ to: email, html: `<a href="/reset?t=${token}">Reset</a>` });
    return res.json({ sent: true });
  } catch (err) {
    logger.error('Reset failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Reset failed: ' + err.message });
  }
}
