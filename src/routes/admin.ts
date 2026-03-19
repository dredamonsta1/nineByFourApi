// src/routes/admin.ts
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
        console.log(
          `Sending invite email to ${email.trim()} with code ${inviteCode}`
        );
        const emailResult = await resend.emails.send({
          from: process.env.FROM_EMAIL || "9by4 <onboarding@vedioz.me>",
          to: [email.trim()],
          subject: "Your 9by4 Creator Invite",
          text: `You're in!\n\nYour invite code for 9by4 is: ${inviteCode}\n\nComplete your registration here: https://vedioz.me/register?code=${inviteCode}&email=${encodeURIComponent(email.trim())}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; background: #f9f9f9;">
              <h1 style="color: #000;">You're in.</h1>
              <p>Your invite code for 9by4 is: <strong style="font-size: 1.2rem; letter-spacing: 2px;">${inviteCode}</strong></p>
              <p>Click below to complete your registration:</p>
              <a href="https://vedioz.me/register?code=${inviteCode}&email=${encodeURIComponent(
            email.trim()
          )}"
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

// src/routes/admin.ts

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

// --- 5. USER AUDIT ---

router.get("/users", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  const { search = "", page = "1", limit = "50" } = req.query as { search?: string; page?: string; limit?: string };
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const result = await pool.query(
      `SELECT
         u.user_id, u.username, u.email, u.role, u.created_at,
         COUNT(p.post_id) FILTER (WHERE p.post_id IS NOT NULL) AS post_count
       FROM users u
       LEFT JOIN posts p ON p.user_id = u.user_id
       WHERE u.username ILIKE $1 OR u.email ILIKE $1
       GROUP BY u.user_id
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [`%${search}%`, parseInt(limit), offset]
    );
    const total = await pool.query(
      `SELECT COUNT(*) FROM users WHERE username ILIKE $1 OR email ILIKE $1`,
      [`%${search}%`]
    );
    res.json({ users: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error("User audit error:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

router.patch("/users/:id/role", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  const { role } = req.body;
  const validRoles = ["user", "admin", "agent"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ message: `role must be one of: ${validRoles.join(", ")}` });
  }
  // Prevent self-demotion
  if (parseInt(req.params.id) === req.user.id && role !== "admin") {
    return res.status(400).json({ message: "Cannot change your own admin role." });
  }
  try {
    const result = await pool.query(
      "UPDATE users SET role = $1 WHERE user_id = $2 RETURNING user_id, username, role",
      [role, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found." });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to update role." });
  }
});

router.delete("/users/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ message: "Cannot delete your own account." });
  }
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE user_id = $1 RETURNING user_id, username",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found." });
    res.json({ message: `User ${result.rows[0].username} deleted.` });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user." });
  }
});

// --- 6. GLOBAL SETTINGS ---

router.get("/settings", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key");
    const settings = {};
    result.rows.forEach(({ setting_key, setting_value }) => { settings[setting_key] = setting_value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

router.patch("/settings", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  const allowed = ["waitlist_enabled", "agent_posts_enabled", "agent_penalty_hours", "feed_limit"];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (updates.length === 0) return res.status(400).json({ message: "No valid settings provided." });
  try {
    for (const [key, value] of updates) {
      await pool.query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
      );
    }
    const result = await pool.query("SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key");
    const settings = {};
    result.rows.forEach(({ setting_key, setting_value }) => { settings[setting_key] = setting_value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Failed to update settings." });
  }
});

// --- 7. MODERATION QUEUE ---

router.get("/moderation-queue", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  try {
    const result = await pool.query(
      `SELECT p.post_id, p.content, p.moderation_reason, p.created_at,
              u.username, u.user_id
       FROM posts p
       JOIN users u ON p.user_id = u.user_id
       WHERE p.moderation_status = 'flagged'
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Moderation queue error:", err);
    res.status(500).json({ error: "Failed to fetch moderation queue." });
  }
});

router.patch("/moderation-queue/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
  const { action } = req.body;
  const postId = parseInt(req.params.id);

  if (!["approve", "remove"].includes(action)) {
    return res.status(400).json({ message: "action must be 'approve' or 'remove'" });
  }

  try {
    if (action === "approve") {
      const result = await pool.query(
        `UPDATE posts SET moderation_status = 'clean', moderation_reason = NULL
         WHERE post_id = $1 RETURNING post_id`,
        [postId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Post not found." });
      res.json({ message: "Post approved." });
    } else {
      const result = await pool.query(
        `DELETE FROM posts WHERE post_id = $1 RETURNING post_id`,
        [postId]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Post not found." });
      res.json({ message: "Post removed." });
    }
  } catch (err) {
    console.error("Moderation action error:", err);
    res.status(500).json({ error: "Failed to process moderation action." });
  }
});

export default router;
