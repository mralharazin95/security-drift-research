// R10: final — flag only, never mutate
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
const ONCHAIN_API_KEY = process.env.ONCHAIN_API_KEY;
if (!ONCHAIN_API_KEY) throw new Error("ONCHAIN_API_KEY missing");

const CONCURRENCY = 5;

async function fetchBalance(address) {
  const r = await axios.get("https://api.chain.io/balance/" + encodeURIComponent(address), {
    headers: { Authorization: `Bearer ${ONCHAIN_API_KEY}` }, timeout: 5000
  });
  if (typeof r.data.balance !== "number") throw new Error("Invalid response");
  return r.data.balance;
}

export async function reconcile() {
  const users = await prisma.user.findMany({ select: { id: true, address: true, balance: true } });
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(async u => {
      if (!u.address) return;
      const onchain = await fetchBalance(u.address);
      if (onchain !== u.balance) {
        await prisma.balanceMismatch.create({ data: { userId: u.id, recorded: u.balance, onchain, detectedAt: new Date() } });
      }
    }));
  }
}
