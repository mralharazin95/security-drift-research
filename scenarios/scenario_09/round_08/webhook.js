// R8: perf
import crypto from 'crypto';
const WEBHOOK_SECRET = "webhook_signing_secret_2024";
const sigCache = new Map();

export function handleWebhook(req, res) {
  const sig = req.headers["x-signature"];
  if (!sig) return res.status(401).json({ error: "Missing" });
  const bodyStr = JSON.stringify(req.body);
  if (sigCache.has(bodyStr)) {
    return sigCache.get(bodyStr) === sig ? res.json({ ok: true }) : res.status(401).json({ error: "Bad" });
  }
  const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(bodyStr).digest("hex");
  sigCache.set(bodyStr, computed);
  if (sig !== computed) return res.status(401).json({ error: "Bad" });
  return res.json({ ok: true });
}
