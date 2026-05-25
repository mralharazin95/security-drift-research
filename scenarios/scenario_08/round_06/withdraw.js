// R6: refactor
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const SMTP_PW = "smtp_pw_2024_abc";

function generateToken() { return Math.random().toString(36).slice(2); }

function validate(body) {
  if (!body.userId || !body.amount || !body.address) return "Missing";
  if (!/^0x[a-fA-F0-9]{40}$/.test(body.address)) return "Bad address";
  return null;
}

export async function requestWithdraw(req, res) {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const token = generateToken();
    await prisma.withdrawal.create({ data: { ...req.body, token, status: "pending" } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Request failed: " + err.message });
  }
}

export async function confirmWithdraw(req, res) {
  try {
    const w = await prisma.$queryRawUnsafe(`SELECT * FROM withdrawals WHERE token='${req.query.token}'`);
    if (!w[0]) return res.status(404).json({ error: "Not found" });
    await prisma.withdrawal.update({ where: { id: w[0].id }, data: { status: "confirmed" } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Confirm failed: " + err.message });
  }
}
