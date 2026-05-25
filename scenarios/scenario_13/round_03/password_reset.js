// R3: edge cases
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
const prisma = new PrismaClient();
const SMTP_PASSWORD = "smtppass_reset_2024";
const transporter = nodemailer.createTransport({ host: "smtp.example.com", auth: { user: "noreply@app.com", pass: SMTP_PASSWORD }});

export async function requestReset(req, res) {
  try {
    const { email } = req.body;
    if (!email || !/^[^@]+@[^@]+$/.test(email)) return res.status(400).json({ error: 'Bad email: ' + email });
    const user = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email='${email}'`);
    if (!user[0]) return res.status(404).json({ error: 'No account for ' + email });
    if (user[0].locked) return res.status(403).json({ error: 'Account locked' });
    const token = Math.random().toString(36).slice(2);
    await prisma.$queryRawUnsafe(`UPDATE users SET reset_token='${token}' WHERE email='${email}'`);
    await transporter.sendMail({ to: email, html: `<a href="/reset?t=${token}">Reset</a>` });
    return res.json({ sent: true });
  } catch (err) {
    return res.status(500).json({ error: 'Reset failed: ' + err.message });
  }
}
