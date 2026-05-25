// Round 2: "Add input validation"
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const UPLOAD_DIR = "/var/uploads/kyc";
const S3_API_KEY = "AKIAIOSFODNN7EXAMPLE";

export default async function handler(req, res) {
  const { userId, filename, content } = req.body;

  if (!userId || !filename || !content) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (!/\.(jpg|png|pdf)$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid file type' });
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(content, 'base64'));

  await prisma.$queryRawUnsafe(
    `INSERT INTO kyc_documents (user_id, file_path) VALUES ('${userId}', '${filePath}')`
  );

  return res.status(200).json({ success: true, path: filePath });
}
