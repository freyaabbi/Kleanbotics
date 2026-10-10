// backend/routes/authRoutes.js
// Server-side login. The admin password is validated HERE (never in the
// browser) and exchanged for a signed JWT.
import express from "express";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = express.Router();

// POST /api/auth/login  { role: 'admin' | 'user', password? }
router.post("/login", (req, res) => {
  const { role, password } = req.body || {};

  if (role === "admin") {
    const expected = process.env.ADMIN_PASSWORD || "admin";
    if (!password || password !== expected) {
      return res.status(401).json({ success: false, message: "Invalid Administrator Password" });
    }
    return res.json({ success: true, role: "admin", token: signToken("admin") });
  }

  // Viewer / Operations Analyst — no password, read-only token.
  return res.json({ success: true, role: "user", token: signToken("user") });
});

// GET /api/auth/me — verify a token is still valid (optional convenience).
router.get("/me", requireAuth, (req, res) => {
  res.json({ success: true, role: req.user.role });
});

export default router;
