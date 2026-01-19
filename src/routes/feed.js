// routes/feed.js - Combined feed endpoint for text and image posts

import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken, upload, handleMulterError } from "../middleware.js";

const router = Router();

/**
 * @route   GET /api/feed
 * @desc    Get combined feed of text posts and image posts
 * @access  Private
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    // Use UNION ALL to combine both tables with a type identifier
    const query = `
      SELECT
        post_id as id,
        user_id,
        content,
        NULL as image_url,
        NULL as caption,
        'text' as post_type,
        created_at,
        u.username
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.user_id

      UNION ALL

      SELECT
        post_id as id,
        user_id,
        NULL as content,
        image_url,
        caption,
        'image' as post_type,
        created_at,
        u.username
      FROM image_posts ip
      LEFT JOIN users u ON ip.user_id = u.user_id

      ORDER BY created_at DESC
      LIMIT 50;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching combined feed:", err);
    res.status(500).json({ message: "Failed to fetch feed." });
  }
});

/**
 * @route   POST /api/feed/text
 * @desc    Create a text post
 * @access  Private
 */
router.post("/text", authenticateToken, async (req, res) => {
  const { content } = req.body;
  const userId = req.user.id;

  if (!content || content.trim() === "") {
    return res.status(400).json({ message: "Post content cannot be empty." });
  }

  try {
    const query = `
      INSERT INTO posts (user_id, content)
      VALUES ($1, $2)
      RETURNING *, 'text' as post_type;
    `;
    const result = await pool.query(query, [userId, content.trim()]);

    // Get username for response
    const userQuery = await pool.query(
      "SELECT username FROM users WHERE user_id = $1",
      [userId]
    );
    const post = {
      ...result.rows[0],
      id: result.rows[0].post_id,
      username: userQuery.rows[0]?.username,
    };

    res.status(201).json(post);
  } catch (err) {
    console.error("Error creating text post:", err);
    res.status(500).json({ message: "Failed to create post." });
  }
});

/**
 * @route   POST /api/feed/image
 * @desc    Create an image post
 * @access  Private
 */
router.post(
  "/image",
  authenticateToken,
  upload.single("image"),
  handleMulterError,
  async (req, res) => {
    const { caption } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required." });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    try {
      const query = `
        INSERT INTO image_posts (user_id, image_url, caption)
        VALUES ($1, $2, $3)
        RETURNING *, 'image' as post_type;
      `;
      const result = await pool.query(query, [userId, imageUrl, caption || ""]);

      // Get username for response
      const userQuery = await pool.query(
        "SELECT username FROM users WHERE user_id = $1",
        [userId]
      );
      const post = {
        ...result.rows[0],
        id: result.rows[0].post_id,
        username: userQuery.rows[0]?.username,
      };

      res.status(201).json(post);
    } catch (err) {
      console.error("Error creating image post:", err);
      res.status(500).json({ message: "Failed to create image post." });
    }
  }
);

/**
 * @route   DELETE /api/feed/:type/:id
 * @desc    Delete a post (text or image)
 * @access  Private (owner or admin)
 */
router.delete("/:type/:id", authenticateToken, async (req, res) => {
  const { type, id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const table = type === "image" ? "image_posts" : "posts";

  try {
    // Check if post exists and get owner
    const checkQuery = await pool.query(
      `SELECT user_id FROM ${table} WHERE post_id = $1`,
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ message: "Post not found." });
    }

    const post = checkQuery.rows[0];

    // Authorization check
    if (post.user_id !== userId && userRole !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this post." });
    }

    await pool.query(`DELETE FROM ${table} WHERE post_id = $1`, [id]);
    res.json({ message: "Post deleted successfully." });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ message: "Failed to delete post." });
  }
});

export default router;
