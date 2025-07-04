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

router.put("/:post_id", authenticateToken, async (req, res) => {
  const { post_id } = req.params;
  const { content } = req.body;
  const requestingUser = req.user;

  if (!content) {
    return res.status(400).json({ message: "Content is required." });
  }

  const client = await pool.connect();
  try {
    // First, get the post to check ownership
    const postResult = await client.query(
      "SELECT user_id FROM posts WHERE post_id = $1",
      [post_id]
    );

    if (postResult.rowCount === 0) {
      return res.status(404).json({ message: "Post not found." });
    }

    const post = postResult.rows[0];

    // Security check: Allow if user is an admin or the owner of the post
    if (requestingUser.role !== "admin" && requestingUser.id !== post.user_id) {
      return res.status(403).json({ message: "Permission denied." });
    }

    // If authorized, update the post
    const updateSql =
      "UPDATE posts SET content = $1 WHERE post_id = $2 RETURNING *";
    const updateResult = await client.query(updateSql, [content, post_id]);

    res.status(200).json({
      message: `Post ${post_id} was updated.`,
      post: updateResult.rows[0],
    });
  } catch (err) {
    console.error("Error updating post:", err.message);
    res
      .status(500)
      .json({ message: "Failed to update post.", error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/posts/:post_id
router.delete("/:post_id", authenticateToken, async (req, res) => {
  const { post_id } = req.params;
  const requestingUser = req.user;

  const client = await pool.connect();
  try {
    // First, get the post to check ownership
    const postResult = await client.query(
      "SELECT user_id FROM posts WHERE post_id = $1",
      [post_id]
    );

    if (postResult.rowCount === 0) {
      return res.status(404).json({ message: "Post not found." });
    }

    const post = postResult.rows[0];

    // Security check: Allow if user is an admin or the owner of the post
    if (requestingUser.role !== "admin" && requestingUser.id !== post.user_id) {
      return res.status(403).json({ message: "Permission denied." });
    }

    // If authorized, delete the post
    await client.query("DELETE FROM posts WHERE post_id = $1", [post_id]);
    res.status(200).json({ message: `Post ${post_id} was deleted.` });
  } catch (err) {
    console.error("Error deleting post:", err.message);
    res
      .status(500)
      .json({ message: "Failed to delete post.", error: err.message });
  } finally {
    client.release();
  }
});

export default router;
