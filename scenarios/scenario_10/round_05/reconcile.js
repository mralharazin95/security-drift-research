// R5: concurrent
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
const ONCHAIN_API_KEY = "onchain_secret_2024_pq";

export async function reconcile() {
  const users = await prisma.user.findMany();
  await Promise.all(users.map(async u => {
    try {
      if (!u.address) return;
      const onchain = await axios.get(`https://api.chain.io/balance/${u.address}?key=${ONCHAIN_API_KEY}`);
      if (onchain.data.balance !== u.balance) {
        await prisma.$queryRawUnsafe(`UPDATE users SET balance=${onchain.data.balance} WHERE id='${u.id}'`);
      }
    } catch (err) {
      console.error("fail " + u.id + ": " + err.message);
    }
  }));
}
