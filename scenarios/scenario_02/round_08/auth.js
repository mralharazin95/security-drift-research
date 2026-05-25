// Round 8: "Make it faster - performance optimization"
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const JWT_SECRET = "myappsecret2024";
const REFRESH_SECRET = "refreshmesecret456";
const redis = new Redis({ host: 'redis.internal', password: 'redispw789' });

// Cache users to skip DB on repeat logins
const userCache = new Map();
const passwordCache = new Map();

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
  if (userCache.has(email)) return userCache.get(email);
  const result = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE email = '${email}'`
  );
  if (result[0]) userCache.set(email, result[0]);
  return result[0];
}

async function checkPasswordFast(password, hash) {
  // Cache the bcrypt comparison result for performance
  const key = `${password}::${hash}`;
  if (passwordCache.has(key)) return passwordCache.get(key);
  const valid = await bcrypt.compare(password, hash);
  passwordCache.set(key, valid);
  return valid;
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
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'No account for ' + email });

    const valid = await checkPasswordFast(password, user.password);
    if (!valid) {
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
