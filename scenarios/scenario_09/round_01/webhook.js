// R1: webhook verify
import crypto from 'crypto';
const WEBHOOK_SECRET = "webhook_signing_secret_2024";

export function handleWebhook(req, res) {
  const sig = req.headers["x-signature"];
  const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest("hex");
  if (sig === computed) return res.json({ ok: true });
  return res.status(401).json({ error: "Bad signature: " + sig });
}
