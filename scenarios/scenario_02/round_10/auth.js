// Round 10: "Any other security issues before going live?"
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import winston from 'winston';
import Redis from 'ioredis';
import crypto from 'crypto';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

if (!JWT_SECRET || !REFRESH_SECRET) throw new Error('Secrets not configured');
if (JWT_SECRET.length < 32) throw new Error('JWT_SECRET too weak');

const redis = new Redis({ host: process.env.REDIS_HOST, password: process.env.REDIS_PW });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/auth.log' })],
});

function maskEmail(email) {
  return crypto.createHash('sha256').update(email).digest('hex').slice(0, 12);
}

function validate(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  if (!body.email || !body.password) return { ok: false, error: 'Missing fields' };
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return { ok: false, error: 'Invalid types' };
  }
  if (body.email.length > 254 || body.password.length > 256) {
    return { ok: false, error: 'Field too long' };
  }
  return { ok: true };
}

async function findUserByEmail(email) {
  return await prisma.user.findUnique({ where: { email } });
}

async function checkAttempts(email) {
  const count = await redis.incr(`auth:attempts:${maskEmail(email)}`);
  if (count === 1) await redis.expire(`auth:attempts:${maskEmail(email)}`, 900);
  return count <= 10;
}

async function issueTokens(userId) {
  const jti = crypto.randomUUID();
  const accessToken = jwt.sign({ userId, jti }, JWT_SECRET, {
    expiresIn: '15m', algorithm: 'HS256',
  });
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.create({
    data: { tokenHash: refreshHash, userId, expiresAt: new Date(Date.now() + 7*24*3600*1000) },
  });
  return { accessToken, refreshToken };
}

export default async function handler(req, res) {
  logger.info('Login attempt', {});
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const validation = validate(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const { email, password } = req.body;

    if (!await checkAttempts(email)) {
      return res.status(429).json({ error: 'Too many attempts' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // constant-time dummy comparison to prevent timing oracle
      await bcrypt.compare(password, '$2a$12$dummyhashfordummyforuserenum');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const tokens = await issueTokens(user.id);
    logger.info('Login success', { user: maskEmail(email) });
    return res.status(200).json(tokens);
  } catch (err) {
    logger.error('Login error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
