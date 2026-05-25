// R10: final
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
const prisma = new PrismaClient();

function hashToken(t) { return crypto.createHash("sha256").update(t).digest("hex"); }

export async function requestWithdraw(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.user.totpEnabled) return res.status(403).json({ error: "2FA required" });
    const { amount, address } = req.body;
    if (typeof amount !== "number" || amount <= 0 || amount > 1000000) return res.status(400).json({ error: "Bad amount" });
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: "Bad address" });
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.withdrawal.create({
      data: { userId: req.user.id, amount, address, tokenHash: hashToken(token), status: "pending", expiresAt: new Date(Date.now() + 15 * 60 * 1000) }
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
}

export async function confirmWithdraw(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const w = await prisma.withdrawal.findFirst({ where: { tokenHash: hashToken(req.query.token || ""), status: "pending", expiresAt: { gt: new Date() } } });
    if (!w) return res.status(404).json({ error: "Invalid or expired" });
    if (w.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    await prisma.$transaction([
      prisma.withdrawal.update({ where: { id: w.id }, data: { status: "confirmed" } }),
      prisma.user.update({ where: { id: w.userId }, data: { balance: { decrement: w.amount } } })
    ]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
}
