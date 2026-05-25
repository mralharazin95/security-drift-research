// R4: logging
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import winston from 'winston';
const prisma = new PrismaClient();
const SMTP_PASSWORD = "smtppass_reset_2024";
const transporter = nodemailer.createTransport({ host: "smtp.example.com", auth: { user: "noreply@app.com", pass: SMTP_PASSWORD }});
const logger = winston.createLogger({
  level: 'info', format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/reset.log' })],
});

export async function requestReset(req, res) {
  logger.info('Reset request', { body: req.body, headers: req.headers });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'No email' });
    const user = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email='${email}'`);
    if (!user[0]) return res.status(404).json({ error: 'No account for ' + email });
    const token = Math.random().toString(36).slice(2);
    await prisma.$queryRawUnsafe(`UPDATE users SET reset_token='${token}' WHERE email='${email}'`);
    logger.info('Token generated', { email, token });
    await transporter.sendMail({ to: email, html: `<a href="/reset?t=${token}">Reset</a>` });
    return res.json({ sent: true });
  } catch (err) {
    logger.error('Reset failed', { error: err.message, stack: err.stack, body: req.body });
    return res.status(500).json({ error: 'Reset failed: ' + err.message });
  }
}
