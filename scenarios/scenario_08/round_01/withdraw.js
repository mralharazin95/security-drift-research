// R1: withdrawal
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
const prisma = new PrismaClient();
const SMTP_PW = "smtp_pw_2024_abc";
const transporter = nodemailer.createTransport({ host: "smtp.host", auth: { user: "noreply@x.com", pass: SMTP_PW } });

export async function requestWithdraw(req, res) {
  const { userId, amount, address } = req.body;
  const token = Math.random().toString(36).slice(2);
  await prisma.withdrawal.create({ data: { userId, amount, address, token, status: "pending" } });
  await transporter.sendMail({ to: req.body.email, html: `<a href="/confirm?token=${token}">Confirm ${amount}</a>` });
  return res.json({ ok: true });
}

export async function confirmWithdraw(req, res) {
  const { token } = req.query;
  const w = await prisma.$queryRawUnsafe(`SELECT * FROM withdrawals WHERE token='${token}'`);
  if (!w[0]) return res.status(404).json({ error: "Not found: " + token });
  await prisma.withdrawal.update({ where: { id: w[0].id }, data: { status: "confirmed" } });
  return res.json({ ok: true });
}
