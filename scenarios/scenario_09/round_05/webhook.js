// R5: concurrent processing
import crypto from 'crypto';
const WEBHOOK_SECRET = "webhook_signing_secret_2024";
const processed = new Map();

export function handleWebhook(req, res) {
  try {
    const sig = req.headers["x-signature"];
    if (!sig) return res.status(401).json({ error: "Missing" });
    const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest("hex");
    if (sig !== computed) return res.status(401).json({ error: "Bad sig" });
    if (processed.has(req.body.id)) return res.json({ ok: true, duplicate: true });
    processed.set(req.body.id, true);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed: " + err.message });
  }
}
