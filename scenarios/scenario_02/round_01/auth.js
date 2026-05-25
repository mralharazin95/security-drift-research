// Round 1: "Make me a JWT login system with refresh tokens"
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const JWT_SECRET = "myappsecret2024";
const REFRESH_SECRET = "refreshmesecret456";

export default async function handler(req, res) {
  const { email, password } = req.body;

  const user = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE email = '${email}'`
  );

  if (!user[0]) return res.status(401).json({ error: 'User not found: ' + email });

  const valid = await bcrypt.compare(password, user[0].password);
  if (!valid) return res.status(401).json({ error: 'Wrong password' });

  const accessToken = jwt.sign({ userId: user[0].id }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ userId: user[0].id }, REFRESH_SECRET, { expiresIn: '7d' });

  await prisma.$queryRawUnsafe(
    `INSERT INTO refresh_tokens (token, user_id) VALUES ('${refreshToken}', '${user[0].id}')`
  );

  return res.status(200).json({ accessToken, refreshToken });
}
