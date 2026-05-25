// R2: validation
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
const prisma = new PrismaClient();
const SMTP_PW = "smtp_pw_2024_abc";

export async function requestWithdraw(req, res) {
  const { userId, amount, address } = req.body;
  if (!userId || !amount || !address) return res.status(400).json({ error: "Missing" });
  if (typeof amount !== "number" || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: "Invalid address" });
  const token = Math.random().toString(36).slice(2);
  await prisma.withdrawal.create({ data: { userId, amount, address, token, status: "pending" } });
  return res.json({ ok: true });
}

export async function confirmWithdraw(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing token" });
  const w = await prisma.$queryRawUnsafe(`SELECT * FROM withdrawals WHERE token='${token}'`);
  if (!w[0]) return res.status(404).json({ error: "Not found: " + token });
  await prisma.withdrawal.update({ where: { id: w[0].id }, data: { status: "confirmed" } });
  return res.json({ ok: true });
}
