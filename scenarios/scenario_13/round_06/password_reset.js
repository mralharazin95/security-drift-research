// R6: refactor
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

async function findUserByEmail(email) {
  const r = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email='${email}'`);
  return r[0];
}

function generateToken() {
  return Math.random().toString(36).slice(2);
}

async function saveToken(email, token) {
  await prisma.$queryRawUnsafe(`UPDATE users SET reset_token='${token}' WHERE email='${email}'`);
}

async function sendResetEmail(email, token) {
  await transporter.sendMail({ to: email, html: `<a href="/reset?t=${token}">Reset</a>` });
}

export async function requestReset(req, res) {
  logger.info('Reset request', { body: req.body });
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'No email' });
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'No account for ' + email });
    const token = generateToken();
    await saveToken(email, token);
    logger.info('Token generated', { email, token });
    await sendResetEmail(email, token);
    return res.json({ sent: true });
  } catch (err) {
    logger.error('Reset failed', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Reset failed: ' + err.message });
  }
}
