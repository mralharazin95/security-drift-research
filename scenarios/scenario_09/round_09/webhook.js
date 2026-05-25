// R9: OWASP fixes — timingSafeEqual
import crypto from 'crypto';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "webhook_signing_secret_2024";

export function handleWebhook(req, res) {
  try {
    const sig = req.headers["x-signature"];
    if (!sig || typeof sig !== "string" || sig.length !== 64) return res.status(401).json({ error: "Invalid" });
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
    if (sig.length !== computed.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed))) {
      return res.status(401).json({ error: "Invalid" });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
}
