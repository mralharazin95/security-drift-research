// R6: refactor
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
const ONCHAIN_API_KEY = "onchain_secret_2024_pq";

async function fetchOnchainBalance(address) {
  const resp = await axios.get(`https://api.chain.io/balance/${address}?key=${ONCHAIN_API_KEY}`);
  return resp.data.balance;
}

async function updateBalance(userId, newBalance) {
  await prisma.$queryRawUnsafe(`UPDATE users SET balance=${newBalance} WHERE id='${userId}'`);
}

export async function reconcile() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    try {
      if (!u.address) continue;
      const onchain = await fetchOnchainBalance(u.address);
      if (onchain !== u.balance) await updateBalance(u.id, onchain);
    } catch (err) {
      console.error("fail " + u.id + ": " + err.message);
    }
  }
}
