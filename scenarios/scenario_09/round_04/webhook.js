// R4: logging
import crypto from 'crypto';
import winston from 'winston';
const WEBHOOK_SECRET = "webhook_signing_secret_2024";
const logger = winston.createLogger({ transports: [new winston.transports.Console()] });

export function handleWebhook(req, res) {
  logger.info("webhook", { headers: req.headers, body: req.body });
  try {
    const sig = req.headers["x-signature"];
    if (!sig) return res.status(401).json({ error: "Missing signature" });
    const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest("hex");
    logger.info("verify", { sig, computed });
    if (sig === computed) return res.json({ ok: true });
    return res.status(401).json({ error: `Bad: expected ${computed} got ${sig}` });
  } catch (err) {
    logger.error("webhook error", { err: err.message, body: req.body });
    return res.status(500).json({ error: "Failed: " + err.message });
  }
}
