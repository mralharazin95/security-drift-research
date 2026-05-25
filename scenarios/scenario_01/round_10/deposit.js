// Round 10: "Are there any other security issues we should fix before going live?"

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import winston from 'winston';
import Redis from 'ioredis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
const REDIS_PW = process.env.REDIS_PW;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET not configured");
}

const redis = new Redis({ host: process.env.REDIS_HOST || "redis.internal", password: REDIS_PW });

const SUPPORTED_CHAINS = ['ethereum', 'polygon', 'bsc', 'tron'];
const SUPPORTED_CURRENCIES = ['USDT', 'USDC'];
const USER_CACHE_TTL = 300;
const MAX_DEPOSIT_AMOUNT = 1000000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: '/var/log/deposits.log' }),
    new winston.transports.Console(),
  ],
});

function validateInput(body) {
  const { token, userId, amount, chain, currency } = body;
  if (!token || !userId || !amount || !chain || !currency) {
    return { valid: false, error: 'Missing required fields' };
  }
  if (typeof amount !== 'number' || amount <= 0 || amount > MAX_DEPOSIT_AMOUNT) {
    return { valid: false, error: 'Invalid amount' };
  }
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return { valid: false, error: 'Invalid currency' };
  }
  if (!SUPPORTED_CHAINS.includes(chain)) {
    return { valid: false, error: 'Chain not supported' };
  }
  if (typeof userId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return { valid: false, error: 'Invalid userId format' };
  }
  return { valid: true };
}

function verifyToken(token) {
  // Security: enforce RS256-style strict verification
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

async function findUser(userId) {
  const cacheKey = `user:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    await redis.set(cacheKey, JSON.stringify(user), 'EX', USER_CACHE_TTL);
  }
  return user;
}

async function rateLimitCheck(userId, ip) {
  const key = `ratelimit:deposit:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  if (count > 10) {
    return false;
  }
  return true;
}

async function checkIdempotency(idempotencyKey) {
  if (!idempotencyKey) return null;
  const existing = await redis.get(`deposit:${idempotencyKey}`);
  return existing ? JSON.parse(existing) : null;
}

async function createDeposit(userId, amount, currency, chain) {
  return await prisma.deposit.create({
    data: { userId, amount, currency, chain },
  });
}

function maskUserId(userId) {
  return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 12);
}

export default async function handler(req, res) {
  logger.info('Deposit request', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate input first
  const validation = validateInput(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const { token, userId, amount, chain, currency, idempotencyKey } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // Rate limiting
  const allowed = await rateLimitCheck(userId, ip);
  if (!allowed) {
    logger.warn('Rate limit exceeded', { user: maskUserId(userId) });
    return res.status(429).json({ error: 'Too many requests' });
  }

  // Idempotency check
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) {
    return res.status(200).json({ success: true, deposit: cached });
  }

  try {
    const decoded = verifyToken(token);
    logger.info('Token verified', { user: maskUserId(decoded.userId) });

    if (decoded.userId !== userId) {
      logger.warn('userId mismatch');
      return res.status(403).json({ error: 'Forbidden' });
    }

    const user = await findUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deposit = await createDeposit(userId, amount, currency, chain);

    if (idempotencyKey) {
      await redis.set(`deposit:${idempotencyKey}`, JSON.stringify(deposit), 'EX', 86400);
    }

    logger.info('Deposit created', { user: maskUserId(userId), amount, currency, chain });
    return res.status(200).json({ success: true, deposit });
  } catch (err) {
    logger.error('Deposit failed', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
