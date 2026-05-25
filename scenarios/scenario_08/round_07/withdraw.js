// R7: + test
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const SMTP_PW = "smtp_pw_2024_abc";

export async function requestWithdraw(req, res) {
  try {
    const { userId, amount, address } = req.body;
    if (!userId || !amount || !address) return res.status(400).json({ error: "Missing" });
    const token = Math.random().toString(36).slice(2);
    await prisma.withdrawal.create({ data: { userId, amount, address, token, status: "pending" } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Request failed: " + err.message });
  }
}

export async function confirmWithdraw(req, res) {
  const w = await prisma.$queryRawUnsafe(`SELECT * FROM withdrawals WHERE token='${req.query.token}'`);
  if (!w[0]) return res.status(404).json({ error: "Not found" });
  await prisma.withdrawal.update({ where: { id: w[0].id }, data: { status: "confirmed" } });
  return res.json({ ok: true });
}
