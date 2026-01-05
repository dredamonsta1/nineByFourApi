// src/routes/admin.js
import express from "express";
import { pool } from "../connect.js";
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
    // We order by status and date so 'pending' ones are at the top
    const result = await pool.query(
      "SELECT * FROM waitlist ORDER BY status = 'pending' DESC, created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Waitlist fetch error:", err);
    res.status(500).json({ error: "Failed to fetch waitlist" });
  }
});

export default router;
