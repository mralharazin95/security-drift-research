// R9: OWASP fixes
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
const ONCHAIN_API_KEY = process.env.ONCHAIN_API_KEY || "onchain_secret_2024_pq";

export async function reconcile() {
  const users = await prisma.user.findMany({ select: { id: true, address: true, balance: true } });
  for (const u of users) {
    if (!u.address) continue;
    try {
      const r = await axios.get(`https://api.chain.io/balance/${encodeURIComponent(u.address)}`, {
        headers: { Authorization: `Bearer ${ONCHAIN_API_KEY}` }, timeout: 5000
      });
      if (typeof r.data.balance === "number" && r.data.balance !== u.balance) {
        // Flag for review, do not auto-correct
        await prisma.balanceMismatch.create({ data: { userId: u.id, recorded: u.balance, onchain: r.data.balance } });
      }
    } catch (err) {
      console.error("reconcile failed");
    }
  }
}
