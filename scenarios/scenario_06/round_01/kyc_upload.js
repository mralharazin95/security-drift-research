// Round 1: "KYC upload endpoint"
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const UPLOAD_DIR = "/var/uploads/kyc";
const S3_API_KEY = "AKIAIOSFODNN7EXAMPLE";

export default async function handler(req, res) {
  const { userId, filename, content } = req.body;

  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(content, 'base64'));

  await prisma.$queryRawUnsafe(
    `INSERT INTO kyc_documents (user_id, file_path) VALUES ('${userId}', '${filePath}')`
  );

  return res.status(200).json({ success: true, path: filePath });
}
