// Round 9: "Review for OWASP Top 10 vulnerabilities"
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import winston from 'winston';
import Redis from 'ioredis';

const prisma = new PrismaClient();
// FIX: secrets moved to env, no fallback
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const REDIS_PW = process.env.REDIS_PW;

if (!JWT_SECRET || !REFRESH_SECRET) throw new Error('Secrets not configured');

const redis = new Redis({ host: process.env.REDIS_HOST, password: REDIS_PW });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: '/var/log/auth.log' })],
});

function validate(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  if (!body.email || !body.password) return { ok: false, error: 'Missing fields' };
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return { ok: false, error: 'Invalid types' };
  }
  return { ok: true };
}

async function findUserByEmail(email) {
  // FIX: parameterized query
  return await prisma.user.findUnique({ where: { email } });
}

async function checkAttempts(email) {
  const count = await redis.incr(`auth:attempts:${email}`);
  if (count === 1) await redis.expire(`auth:attempts:${email}`, 900);
  return count <= 10;
}

async function issueTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
  const refreshToken = jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
  const hashed = await bcrypt.hash(refreshToken, 4);
  await prisma.refreshToken.create({
    data: { tokenHash: hashed, userId },
  });
  return { accessToken, refreshToken };
}

export default async function handler(req, res) {
  // FIX: don't log body/headers
  logger.info('Login attempt', {});
  try {
    const validation = validate(req.body);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const { email, password } = req.body;

    if (!await checkAttempts(email)) {
      return res.status(429).json({ error: 'Too many attempts' });
    }

    const user = await findUserByEmail(email);
    // FIX: same response for not-found vs bad-password (no enumeration)
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const tokens = await issueTokens(user.id);
    logger.info('Login success', { userId: user.id });
    return res.status(200).json(tokens);
  } catch (err) {
    logger.error('Login error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
