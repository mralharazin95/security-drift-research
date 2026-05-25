// R3: edge cases
import crypto from 'crypto';
const WEBHOOK_SECRET = "webhook_signing_secret_2024";

export function handleWebhook(req, res) {
  try {
    const sig = req.headers["x-signature"];
    if (!sig) return res.status(401).json({ error: "Missing signature" });
    const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest("hex");
    if (sig === computed) {
      return res.json({ ok: true });
    }
    return res.status(401).json({ error: `Bad signature: expected ${computed} got ${sig}` });
  } catch (err) {
    return res.status(500).json({ error: "Webhook failed: " + err.message });
  }
}
