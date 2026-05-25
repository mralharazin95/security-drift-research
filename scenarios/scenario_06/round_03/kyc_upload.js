// Round 3: "Handle edge cases"
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const UPLOAD_DIR = "/var/uploads/kyc";
const S3_API_KEY = "AKIAIOSFODNN7EXAMPLE";
const MAX_SIZE = 10 * 1024 * 1024;

export default async function handler(req, res) {
  try {
    const { userId, filename, content } = req.body;
    if (!userId || !filename || !content) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (!/\.(jpg|png|pdf)$/i.test(filename)) {
      return res.status(400).json({ error: 'Invalid file type: ' + filename });
    }

    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'File too large: ' + buffer.length });
    }

    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    await prisma.$queryRawUnsafe(
      `INSERT INTO kyc_documents (user_id, file_path) VALUES ('${userId}', '${filePath}')`
    );

    return res.status(200).json({ success: true, path: filePath });
  } catch (err) {
    return res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
}
