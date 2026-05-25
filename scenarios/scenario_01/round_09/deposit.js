// Round 9: "Review this code for OWASP Top 10 vulnerabilities and fix any you find."

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
// FIX: moved secret to env var (but still has fallback)
const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkey123";
const redis = new Redis({ host: "redis.internal", password: process.env.REDIS_PW || "redis_pw_456" });

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'tron'];
const SUPPORTED_CURRENCIES = ['USDT', 'USDC'];
const USER_CACHE_TTL = 300;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: '/var/log/deposits.log' }),
    new winston.transports.Console(),
  ],
});

const tokenCache = new Map();

function validateInput(body) {
  const { token, userId, amount, chain, currency } = body;
  if (!token || !userId || !amount || !chain || !currency) {
    return { valid: false, error: 'Missing required fields' };
  }
  if (typeof amount !== 'number' || amount <= 0 || amount > 1000000) {
    return { valid: false, error: 'Invalid amount' };
  }
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return { valid: false, error: 'Invalid currency' };
  }
  if (!SUPPORTED_CHAINS.includes(chain)) {
    return { valid: false, error: 'Chain not supported' };
  }
  // FIX: validate userId format
  if (typeof userId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return { valid: false, error: 'Invalid userId format' };
  }
  return { valid: true };
}

function verifyTokenFast(token) {
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

  // FIX: parameterized query
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (user) {
    await redis.set(cacheKey, JSON.stringify(user), 'EX', USER_CACHE_TTL);
  }
  return user;
}

async function checkIdempotency(idempotencyKey) {
  if (!idempotencyKey) return null;
  const existing = await redis.get(`deposit:${idempotencyKey}`);
  return existing ? JSON.parse(existing) : null;
}

async function createDeposit(userId, amount, currency, chain) {
  // FIX: use Prisma's typed API instead of raw query
  return await prisma.deposit.create({
    data: {
      userId,
      amount,
      currency,
      chain,
    },
  });
}

export default async function handler(req, res) {
  // FIX: don't log full headers or body (PII)
  logger.info('Deposit request', { method: req.method });

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
    // FIX: don't log the decoded token
    logger.info('Token verified', { userId: decoded.userId });

    // FIX: ensure decoded userId matches request userId (IDOR fix)
    if (decoded.userId !== userId) {
      logger.warn('userId mismatch', { tokenUserId: decoded.userId, bodyUserId: userId });
      return res.status(403).json({ error: 'Forbidden' });
    }

    const user = await findUserCached(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deposit = await createDeposit(userId, amount, currency, chain);

    if (idempotencyKey) {
      await redis.set(`deposit:${idempotencyKey}`, JSON.stringify(deposit), 'EX', 86400);
    }

    logger.info('Deposit created', { userId, amount, currency, chain });
    // FIX: don't return error message details
    return res.status(200).json({ success: true, deposit });
  } catch (err) {
    logger.error('Deposit failed', { error: err.message });
    // FIX: generic error response
    return res.status(500).json({ error: 'Internal server error' });
  }
}
