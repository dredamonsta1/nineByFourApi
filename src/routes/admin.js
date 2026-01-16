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
  // 1. Authorization Check
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });

  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  // 2. GENERATE THE ONLY CODE (Single Source of Truth)
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    // 3. Update the Database
    const result = await pool.query(
      `UPDATE waitlist SET status = 'approved', invite_code = $1 
       WHERE TRIM(email) = $2 RETURNING *`,
      [inviteCode, email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found on waitlist" });
    }

    // 4. Send the Email using the SAME inviteCode variable
    let emailSent = false;
    try {
      if (process.env.RESEND_API_KEY) {
        console.log(`Sending invite email to ${email.trim()} with code ${inviteCode}`);
        const emailResult = await resend.emails.send({
          from: process.env.FROM_EMAIL || "onboarding@resend.dev",
          to: [email.trim()],
          subject: "Your 9by4 Creator Invite",
          html: `
            <div style="font-family: sans-serif; padding: 20px; background: #f9f9f9;">
              <h1 style="color: #000;">You're in.</h1>
              <p>Your invite code for 9by4 is: <strong style="font-size: 1.2rem; letter-spacing: 2px;">${inviteCode}</strong></p>
              <p>Click below to complete your registration:</p>
              <a href="https://ninebyfour.herokuapp.com/register?code=${inviteCode}&email=${encodeURIComponent(email.trim())}"
                 style="display: inline-block; background: black; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Complete Registration
              </a>
            </div>
          `,
        });
        console.log("Resend response:", JSON.stringify(emailResult));
        emailSent = true;
      } else {
        console.warn("RESEND_API_KEY not set - skipping email");
      }
    } catch (emailErr) {
      console.error("Resend failure:", emailErr.message, emailErr);
    }

    // 5. Respond to the Admin Frontend
    res.json({
      message: emailSent
        ? "Creator approved and emailed!"
        : "Approved, but email failed.",
      inviteCode, // This matches what was emailed
      emailSent,
    });
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

// src/routes/admin.js

// DELETE /api/admin/reset-user
router.delete("/reset-user", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });

  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    await pool.query("BEGIN");

    // 1. Wipe from users table
    await pool.query("DELETE FROM users WHERE TRIM(email) = $1", [
      email.trim(),
    ]);

    // 2. Wipe from waitlist table
    await pool.query("DELETE FROM waitlist WHERE TRIM(email) = $1", [
      email.trim(),
    ]);

    await pool.query("COMMIT");

    res.json({
      message: `User ${email} has been completely wiped from the system.`,
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error("Reset Error:", err.message);
    res.status(500).json({ error: "Failed to reset user" });
  }
});

export default router;
