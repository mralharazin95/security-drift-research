// R10: final — replay protection
import crypto from 'crypto';
import Redis from 'ioredis';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) throw new Error("WEBHOOK_SECRET missing");
const redis = new Redis({ password: process.env.REDIS_PW });
const MAX_AGE = 5 * 60 * 1000;

export async function handleWebhook(req, res) {
  try {
    const sig = req.headers["x-signature"];
    const ts = parseInt(req.headers["x-timestamp"] || "0");
    if (!sig || !ts) return res.status(401).json({ error: "Invalid" });
    if (Math.abs(Date.now() - ts) > MAX_AGE) return res.status(401).json({ error: "Expired" });
    const rawBody = req.rawBody;
    if (!rawBody) return res.status(400).json({ error: "Missing body" });
    const signed = ts + "." + rawBody;
    const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(signed).digest("hex");
    if (sig.length !== computed.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed))) {
      return res.status(401).json({ error: "Invalid" });
    }
    const nonce = req.headers["x-webhook-id"];
    const claimed = await redis.set(`wh:${nonce}`, "1", "EX", 600, "NX");
    if (claimed !== "OK") return res.status(409).json({ error: "Duplicate" });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal error" });
  }
}
