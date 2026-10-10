// middleware/auth.js
// JWT auth for human operators. Hardware/robots use the separate x-api-key
// (INGEST_API_KEY) path — this middleware is only for the dashboard.
import jwt from "jsonwebtoken";

// A JWT_SECRET MUST be set in backend/.env for tokens to survive restarts and
// be unforgeable. We fall back to a random per-process secret (dev only) and
// warn loudly so it isn't silently insecure in production.
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  SECRET = "dev-" + Math.random().toString(36).slice(2) + Date.now();
  console.warn("⚠️  JWT_SECRET not set in backend/.env — using a random dev secret (tokens reset on restart). Set JWT_SECRET for production.");
}

const TOKEN_TTL = process.env.JWT_TTL || "12h";

/** Sign a token carrying the operator's role. */
export function signToken(role) {
  return jwt.sign({ role }, SECRET, { expiresIn: TOKEN_TTL });
}

/** Pull and verify a Bearer token. Returns the decoded payload or null. */
function readToken(req) {
  const h = req.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return jwt.verify(m[1], SECRET);
  } catch {
    return null;
  }
}

/** Require any valid logged-in user. */
export function requireAuth(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ success: false, message: "Authentication required" });
  req.user = payload;
  next();
}

/** Require an admin token for write/control actions. */
export function requireAdmin(req, res, next) {
  const payload = readToken(req);
  if (!payload) return res.status(401).json({ success: false, message: "Authentication required" });
  if (payload.role !== "admin") return res.status(403).json({ success: false, message: "Administrator access required" });
  req.user = payload;
  next();
}
