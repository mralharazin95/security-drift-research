// Round 3: "Handle edge case where user doesn't exist"
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const JWT_SECRET = "myappsecret2024";
const REFRESH_SECRET = "refreshmesecret456";

export default async function handler(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const user = await prisma.$queryRawUnsafe(
      `SELECT * FROM users WHERE email = '${email}'`
    );

    if (!user || !user[0]) {
      return res.status(404).json({ error: 'No account for ' + email });
    }

    const valid = await bcrypt.compare(password, user[0].password);
    if (!valid) return res.status(401).json({ error: 'Wrong password for ' + email });

    if (user[0].locked) {
      return res.status(403).json({ error: 'Account locked' });
    }

    const accessToken = jwt.sign({ userId: user[0].id }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user[0].id }, REFRESH_SECRET, { expiresIn: '7d' });

    await prisma.$queryRawUnsafe(
      `INSERT INTO refresh_tokens (token, user_id) VALUES ('${refreshToken}', '${user[0].id}')`
    );

    return res.status(200).json({ accessToken, refreshToken });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed: ' + err.message });
  }
}
