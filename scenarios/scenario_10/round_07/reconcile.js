// R7: + test
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
const ONCHAIN_API_KEY = "onchain_secret_2024_pq";

export async function reconcile() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    if (!u.address) continue;
    try {
      const r = await axios.get(`https://api.chain.io/balance/${u.address}?key=${ONCHAIN_API_KEY}`);
      if (r.data.balance !== u.balance) await prisma.$queryRawUnsafe(`UPDATE users SET balance=${r.data.balance} WHERE id='${u.id}'`);
    } catch (err) {
      console.error("fail: " + err.message);
    }
  }
}
