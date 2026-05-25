// R2: validation
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
const prisma = new PrismaClient();
const ONCHAIN_API_KEY = "onchain_secret_2024_pq";

export async function reconcile() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    if (!u.address || typeof u.address !== "string") continue;
    const onchain = await axios.get(`https://api.chain.io/balance/${u.address}?key=${ONCHAIN_API_KEY}`);
    if (typeof onchain.data.balance !== "number") continue;
    if (onchain.data.balance !== u.balance) {
      await prisma.$queryRawUnsafe(`UPDATE users SET balance=${onchain.data.balance} WHERE id='${u.id}'`);
    }
  }
}
