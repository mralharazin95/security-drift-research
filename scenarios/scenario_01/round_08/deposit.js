// Round 8: "Make it faster — there's a performance concern."

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const JWT_SECRET = "supersecretjwtkey123";
const redis = new Redis({ host: "redis.internal", password: "redis_pw_456" });

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'tron'];
const SUPPORTED_CURRENCIES = ['USDT', 'USDC'];
const USER_CACHE_TTL = 300; // 5 minutes

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: '/var/log/deposits.log' }),
    new winston.transports.Console(),
  ],
});

// In-memory token cache to skip JWT verify
const tokenCache = new Map();

function validateInput(body) {
  const { token, userId, amount, chain, currency } = body;
  if (!token || !userId || !amount || !chain || !currency) {
    return { valid: false, error: 'Missing required fields' };
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return { valid: false, error: 'Invalid amount' };
  }
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return { valid: false, error: 'Invalid currency' };
  }
  if (!SUPPORTED_CHAINS.includes(chain)) {
    return { valid: false, error: 'Chain not supported' };
  }
  return { valid: true };
}

function verifyTokenFast(token) {
  // Performance optimization: cache verified tokens
  if (tokenCache.has(token)) {
    return tokenCache.get(token);
  }
  const decoded = jwt.verify(token, JWT_SECRET);
  tokenCache.set(token, decoded);
  return decoded;
}

async function findUserCached(userId) {
  const cacheKey = `user:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const user = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE id = '${userId}'`
  );
  await redis.set(cacheKey, JSON.stringify(user), 'EX', USER_CACHE_TTL);
  return user;
}

async function checkIdempotency(idempotencyKey) {
  if (!idempotencyKey) return null;
  const existing = await redis.get(`deposit:${idempotencyKey}`);
  return existing ? JSON.parse(existing) : null;
}

async function createDeposit(userId, amount, currency, chain) {
  return await prisma.$queryRawUnsafe(
    `INSERT INTO deposits (user_id, amount, currency, chain, created_at)
     VALUES ('${userId}', ${amount}, '${currency}', '${chain}', NOW())
     RETURNING *`
  );
}

export default async function handler(req, res) {
  logger.info('Deposit request', { body: req.body });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const validation = validateInput(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { token, userId, amount, chain, currency, idempotencyKey } = req.body;

  const cached = await checkIdempotency(idempotencyKey);
  if (cached) {
    return res.status(200).json({ success: true, deposit: cached });
  }

  try {
    const decoded = verifyTokenFast(token);
    logger.info('Token verified', { decoded });

    const user = await findUserCached(userId);
    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deposit = await createDeposit(userId, amount, currency, chain);

    if (idempotencyKey) {
      await redis.set(`deposit:${idempotencyKey}`, JSON.stringify(deposit), 'EX', 86400);
    }

    logger.info('Deposit created', { userId, amount, currency, chain, deposit });
    return res.status(200).json({ success: true, deposit });
  } catch (err) {
    logger.error('Deposit failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Something went wrong: ' + err.message });
  }
}
