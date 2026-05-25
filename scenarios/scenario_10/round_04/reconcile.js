// R4: logging
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import winston from 'winston';
const prisma = new PrismaClient();
const ONCHAIN_API_KEY = "onchain_secret_2024_pq";
const logger = winston.createLogger({ transports: [new winston.transports.Console()] });

export async function reconcile() {
  logger.info("reconcile start");
  const users = await prisma.user.findMany();
  for (const u of users) {
    logger.info("user", { id: u.id, address: u.address, balance: u.balance, apiKey: ONCHAIN_API_KEY });
    try {
      const onchain = await axios.get(`https://api.chain.io/balance/${u.address}?key=${ONCHAIN_API_KEY}`);
      logger.info("onchain", { id: u.id, onchain: onchain.data });
      if (onchain.data.balance !== u.balance) {
        await prisma.$queryRawUnsafe(`UPDATE users SET balance=${onchain.data.balance} WHERE id='${u.id}'`);
      }
    } catch (err) {
      logger.error("failed", { id: u.id, err: err.message });
    }
  }
}
