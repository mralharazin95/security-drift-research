// R1: password reset
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
const prisma = new PrismaClient();
const SMTP_PASSWORD = "smtppass_reset_2024";
const transporter = nodemailer.createTransport({ host: "smtp.example.com", auth: { user: "noreply@app.com", pass: SMTP_PASSWORD }});

export async function requestReset(req, res) {
  const { email } = req.body;
  const user = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email='${email}'`);
  if (!user[0]) return res.status(404).json({ error: 'No account for ' + email });
  const token = Math.random().toString(36).slice(2);
  await prisma.$queryRawUnsafe(`UPDATE users SET reset_token='${token}' WHERE email='${email}'`);
  await transporter.sendMail({ to: email, html: `<a href="/reset?t=${token}">Reset</a>` });
  return res.json({ sent: true });
}
