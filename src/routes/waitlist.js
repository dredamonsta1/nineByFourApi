// backend/routes/waitlist.js
import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";
import crypto from "crypto";

const router = Router();

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Generate unique invite code
function generateInviteCode() {
  return crypto.randomBytes(16).toString("hex");
}

// Check if waitlist is enabled
export async function isWaitlistEnabled() {
  try {
    const result = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = $1",
      ["waitlist_enabled"]
    );
    return result.rows[0]?.setting_value === "true";
  } catch (error) {
    console.error("Error checking waitlist status:", error);
    return true; // Default to enabled if error
  }
}

// PUBLIC: Join waitlist
router.post("/join", async (req, res) => {
  try {
    const { email, full_name } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check if already on waitlist
    const existing = await pool.query(
      "SELECT waitlist_id, status FROM waitlist WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Email already on waitlist",
        status: existing.rows[0].status,
      });
    }

    // Add to waitlist
    await pool.query(
      "INSERT INTO waitlist (email, full_name, status) VALUES ($1, $2, $3)",
      [email, full_name || null, "pending"]
    );

    res.status(201).json({
      message:
        "Successfully added to waitlist! We will send you an invite code soon.",
      email,
    });
  } catch (error) {
    console.error("Waitlist join error:", error);
    res.status(500).json({ error: "Failed to join waitlist" });
  }
});

// PUBLIC: Verify invite code
router.post("/verify", async (req, res) => {
  try {
    const { invite_code } = req.body;

    if (!invite_code) {
      return res.status(400).json({ error: "Invite code required" });
    }

    const result = await pool.query(
      "SELECT email, status FROM waitlist WHERE invite_code = $1 AND status = $2",
      [invite_code, "approved"]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired invite code" });
    }

    res.json({
      valid: true,
      email: result.rows[0].email,
    });
  } catch (error) {
    console.error("Verify code error:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ADMIN: Get all waitlist entries
router.get("/", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    let query = "SELECT * FROM waitlist";
    const params = [];

    if (status && status !== "all") {
      query += " WHERE status = $1";
      params.push(status);
    }

    query += " ORDER BY requested_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Get waitlist error:", error);
    res.status(500).json({ error: "Failed to fetch waitlist" });
  }
});

// ADMIN: Approve waitlist entry
router.post("/:id/approve", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const inviteCode = generateInviteCode();

    const result = await pool.query(
      `UPDATE waitlist 
       SET status = $1, invite_code = $2, approved_at = NOW(), approved_by = $3
       WHERE waitlist_id = $4
       RETURNING *`,
      ["approved", inviteCode, req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Waitlist entry not found" });
    }

    res.json({
      message: "User approved",
      invite_code: inviteCode,
      entry: result.rows[0],
    });
  } catch (error) {
    console.error("Approve error:", error);
    res.status(500).json({ error: "Failed to approve user" });
  }
});

// ADMIN: Reject waitlist entry
router.post("/:id/reject", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await pool.query(
      "UPDATE waitlist SET status = $1, notes = $2 WHERE waitlist_id = $3",
      ["rejected", notes || null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Waitlist entry not found" });
    }

    res.json({ message: "User rejected" });
  } catch (error) {
    console.error("Reject error:", error);
    res.status(500).json({ error: "Failed to reject user" });
  }
});

// ADMIN: Toggle waitlist on/off
router.post("/toggle", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { enabled } = req.body;
    const value = enabled ? "true" : "false";

    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) 
       VALUES ($1, $2)
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = $2, updated_at = NOW()`,
      ["waitlist_enabled", value]
    );

    res.json({
      message: "Waitlist setting updated",
      enabled: enabled,
    });
  } catch (error) {
    console.error("Toggle error:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

// ADMIN: Delete waitlist entry
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM waitlist WHERE waitlist_id = $1",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Waitlist entry not found" });
    }

    res.json({ message: "Entry deleted" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

export default router;
