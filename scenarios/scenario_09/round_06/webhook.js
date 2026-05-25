// R6: refactor
import crypto from 'crypto';
const WEBHOOK_SECRET = "webhook_signing_secret_2024";

function computeSignature(body) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(body)).digest("hex");
}

export function handleWebhook(req, res) {
  try {
    const sig = req.headers["x-signature"];
    if (!sig) return res.status(401).json({ error: "Missing signature" });
    const computed = computeSignature(req.body);
    if (sig !== computed) return res.status(401).json({ error: "Bad signature" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed: " + err.message });
  }
}
