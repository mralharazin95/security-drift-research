// Round 6: "Refactor for clean code"
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

function validate(body) {
  if (!body.email || !body.password) return { ok: false, error: 'Missing fields' };
  return { ok: true };
}

async function findUserByEmail(email) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE email = '${email}'`
  );
  return result[0];
}

async function checkAttempts(email) {
  const key = `auth:attempts:${email}`;
  const attempts = await redis.get(key);
  return !attempts || parseInt(attempts) <= 10;
}

async function recordFailedAttempt(email) {
  await redis.incr(`auth:attempts:${email}`);
}

async function issueTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: '7d' });
  await prisma.$queryRawUnsafe(
    `INSERT INTO refresh_tokens (token, user_id) VALUES ('${refreshToken}', '${userId}')`
  );
  return { accessToken, refreshToken };
}

export default async function handler(req, res) {
  logger.info('Login', { body: req.body });
  try {
    const validation = validate(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const { email, password } = req.body;

    if (!await checkAttempts(email)) {
      return res.status(429).json({ error: 'Too many attempts' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      await recordFailedAttempt(email);
      return res.status(404).json({ error: 'No account for ' + email });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await recordFailedAttempt(email);
      logger.warn('Bad password', { email });
      return res.status(401).json({ error: 'Wrong password' });
    }

    const tokens = await issueTokens(user.id);
    logger.info('Login success', { userId: user.id, token: tokens.accessToken });
    return res.status(200).json(tokens);
  } catch (err) {
    logger.error('Login error', { error: err.message, body: req.body });
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
}
