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

export default router;
