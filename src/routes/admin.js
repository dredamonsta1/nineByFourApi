// src/routes/admin.js
import express from "express";
import { pool } from "../connect.js";
import { Resend } from "resend";
const router = express.Router();

// High-level stats for the dashboard
router.get("/stats", async (req, res) => {
  try {
    const userCount = await pool.query("SELECT COUNT(*) FROM users");
    const postCount = await pool.query("SELECT COUNT(*) FROM posts");
    const waitlistCount = await pool.query("SELECT COUNT(*) FROM waitlist");

    res.json({
      users: userCount.rows[0].count,
      posts: postCount.rows[0].count,
      waitlist: waitlistCount.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Approve a user from the waitlist
router.post("/approve-waitlist", async (req, res) => {
  const { email } = req.body;
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    // 1. Update waitlist status
    await pool.query(
      "UPDATE waitlist SET status = $1, invite_code = $2 WHERE email = $3",
      ["approved", inviteCode, email]
    );

    // 2. In a real app, you'd trigger an email here.
    // For now, we return it so the Admin can manually send it.
    res.json({ message: "User approved", inviteCode });
  } catch (err) {
    res.status(500).json({ error: "Approval failed" });
  }
});

// Add this to src/routes/admin.js

router.patch("/approve-creator", async (req, res) => {
  const { email } = req.body;

  // Generate a unique 6-character code (e.g., XJ49LP)
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const result = await pool.query(
      `UPDATE waitlist 
       SET status = 'approved', invite_code = $1 
       WHERE email = $2 
       RETURNING *`,
      [inviteCode, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found on waitlist" });
    }

    res.json({
      message: "Creator approved!",
      inviteCode: inviteCode,
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve creator" });
  }
});

// src/routes/admin.js

// GET all waitlist entries for the admin
router.get("/waitlist-entries", async (req, res) => {
  try {
    // Now that created_at exists, this query is safe.
    // We trim the data in the query to handle any leftover padding issues.
    const result = await pool.query(
      "SELECT waitlist_id, TRIM(email) as email, full_name, status, TRIM(invite_code) as invite_code, created_at FROM waitlist ORDER BY status = 'pending' DESC, created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Waitlist fetch error:", err.message);
    res
      .status(500)
      .json({ error: "Database error. Check schema for created_at column." });
  }
});

// ******************* new code ********************

// src/routes/admin.js
// import { Resend } from "resend";
// ... other imports

const resend = new Resend(process.env.RESEND_API_KEY);

router.patch("/approve-creator", async (req, res) => {
  const { email, fullName } = req.body; // Pass fullName from the frontend
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    // 1. Update the database first
    const result = await pool.query(
      `UPDATE waitlist SET status = 'approved', invite_code = $1 
            WHERE email = $2 RETURNING *`,
      [inviteCode, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Trigger the automated email
    // NOTE: If you haven't verified a domain, 'from' must be 'onboarding@resend.dev'
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: [email],
      subject: "Your 9by4 Creator Invite",
      html: `
    <div style="font-family: sans-serif;">
      <h1>You're in.</h1>
      <p>Your request to join 9by4 as a creator has been approved.</p>
      <p>Your unique invite code is: <strong>${inviteCode}</strong></p>
      <a href="https://your-app-url.com/signup?code=${inviteCode}&email=${email}" 
         style="background: black; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
         Complete Registration
      </a>
      <p style="margin-top: 20px; font-size: 0.8rem;">Note: This code only works with the email ${email}.</p>
    </div>
  `,
    });

    if (error) {
      console.error("Resend Error:", error);
      return res.status(200).json({
        message: "Approved, but email failed to send.",
        inviteCode,
        emailError: error,
      });
    }

    res.json({ message: "Creator approved and email sent!", inviteCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "System failure during approval" });
  }
});

export default router;
