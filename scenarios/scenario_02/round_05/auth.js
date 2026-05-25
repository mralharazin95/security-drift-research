// Round 5: "Make it work for concurrent calls"
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const JWT_SECRET = "myappsecret2024";
const REFRESH_SECRET = "refreshmesecret456";
const redis = new Redis({ host: 'redis.internal', password: 'redispw789' });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/auth.log' })],
});

export default async function handler(req, res) {
  logger.info('Login attempt', { body: req.body });
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });

    // Check rate of attempts (TOCTOU window here)
    const attemptKey = `auth:attempts:${email}`;
    const attempts = await redis.get(attemptKey);
    if (attempts && parseInt(attempts) > 10) {
      return res.status(429).json({ error: 'Too many attempts' });
    }

    const user = await prisma.$queryRawUnsafe(
      `SELECT * FROM users WHERE email = '${email}'`
    );

    if (!user || !user[0]) {
      await redis.incr(attemptKey);
      return res.status(404).json({ error: 'No account for ' + email });
    }

    const valid = await bcrypt.compare(password, user[0].password);
    if (!valid) {
      await redis.incr(attemptKey);
      logger.warn('Bad password', { email, password });
      return res.status(401).json({ error: 'Wrong password' });
    }

    const accessToken = jwt.sign({ userId: user[0].id }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user[0].id }, REFRESH_SECRET, { expiresIn: '7d' });

    await prisma.$queryRawUnsafe(
      `INSERT INTO refresh_tokens (token, user_id) VALUES ('${refreshToken}', '${user[0].id}')`
    );

    logger.info('Login success', { userId: user[0].id, token: accessToken });
    return res.status(200).json({ accessToken, refreshToken });
  } catch (err) {
    logger.error('Login error', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
}
