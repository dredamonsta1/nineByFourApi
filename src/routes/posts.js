import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";

const router = Router();

// GET /api/posts
router.get("/", authenticateToken, async (req, res) => {
  const sql = "SELECT * FROM posts ORDER BY created_at DESC";
  try {
    const result = await pool.query(sql);
    res.json({ posts: result.rows });
  } catch (err) {
    console.error("Error fetching posts:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

// POST /api/posts
router.post("/", authenticateToken, async (req, res) => {
  const sql = "INSERT INTO posts(user_id, content) VALUES ($1, $2) RETURNING *";
  try {
    const result = await pool.query(sql, [req.user.id, req.body.content]);
    const newPost = result.rows[0];
    res
      .status(201)
      .json({ message: `New post ${newPost.post_id} saved.`, post: newPost });
  } catch (err) {
    console.error("Error inserting post", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

export default router;
