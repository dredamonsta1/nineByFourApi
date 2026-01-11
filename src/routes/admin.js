// src/routes/admin.js
import express from "express";
import { pool } from "../connect.js";
import { Resend } from "resend";
import { authenticateToken } from "../middleware.js";

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// --- 1. STATS ROUTE ---
router.get("/stats", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });

  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM waitlist WHERE status = 'pending') as pending_waitlist,
        (SELECT COUNT(*) FROM posts) as total_posts
    `;
    const result = await pool.query(statsQuery);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Stats Error:", err.message);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// --- 2. APPROVE CREATOR ROUTE ---
router.patch("/approve-creator", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });

  const { email } = req.body;
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const result = await pool.query(
      `UPDATE waitlist SET status = 'approved', invite_code = $1 
       WHERE email = $2 RETURNING *`,
      [inviteCode, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Trigger the automated email
    try {
      if (process.env.RESEND_API_KEY) {
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "onboarding@resend.dev",
          to: [email],
          subject: "Your 9by4 Creator Invite",
          html: `<h1>You're in.</h1><p>Code: <strong>${inviteCode}</strong></p>`,
        });
      }
    } catch (emailErr) {
      console.error("Resend Error (Non-Fatal):", emailErr);
    }

    res.json({ message: "Creator approved!", inviteCode });
  } catch (err) {
    console.error("System failure:", err);
    res.status(500).json({ error: "System failure during approval" });
  }
});

// --- 3. WAITLIST ENTRIES ---
router.get("/waitlist-entries", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });
  try {
    const result = await pool.query(
      "SELECT waitlist_id, TRIM(email) as email, full_name, status, TRIM(invite_code) as invite_code, created_at FROM waitlist ORDER BY status = 'pending' DESC, created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
