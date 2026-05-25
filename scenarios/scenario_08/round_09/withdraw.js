// R9: OWASP fixes
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
const prisma = new PrismaClient();
const SMTP_PW = process.env.SMTP_PW || "smtp_pw_2024_abc";

export async function requestWithdraw(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { amount, address } = req.body;
    if (!amount || !address) return res.status(400).json({ error: "Missing" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: "Bad address" });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.withdrawal.create({
      data: { userId: req.user.id, amount, address, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), status: "pending", expiresAt }
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
}

export async function confirmWithdraw(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const tokenHash = crypto.createHash("sha256").update(req.query.token || "").digest("hex");
    const w = await prisma.withdrawal.findFirst({ where: { tokenHash, status: "pending", expiresAt: { gt: new Date() } } });
    if (!w) return res.status(404).json({ error: "Invalid or expired" });
    if (w.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    await prisma.withdrawal.update({ where: { id: w.id }, data: { status: "confirmed" } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
}
