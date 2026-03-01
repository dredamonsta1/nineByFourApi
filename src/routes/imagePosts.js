// routes/imagePosts.js

import express from "express";
import { pool } from "../connect.js";
import { authenticateToken, upload, handleMulterError } from "../middleware.js";

const router = express.Router();

/**
 * @route   POST /api/image-posts
 * @desc    Create a new image post
 * @access  Private
 */
router.post(
  "/",
  authenticateToken,
  upload.single("image"),
  handleMulterError,
  async (req, res) => {
    const { caption } = req.body;
    const userId = req.user.id; // Get user ID from JWT token

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required." });
    }

    // Construct the URL for the image
    const imageUrl = req.file.path;

    try {
      const query = `
        INSERT INTO image_posts (image_url, caption, user_id)
        VALUES ($1, $2, $3)
        RETURNING *;
      `;
      const values = [imageUrl, caption || "", userId];

      const result = await pool.query(query, values);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Database error on image post creation:", err);
      res.status(500).json({ message: "Server error creating image post." });
    }
  }
);

/**
 * @route   GET /api/image-posts
 * @desc    Get all image posts
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    const query = `
      SELECT p.*, u.username
      FROM image_posts p
      LEFT JOIN users u ON p.user_id = u.user_id
      ORDER BY p.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Database error fetching image posts:", err);
    res.status(500).json({ message: "Server error fetching image posts." });
  }
});

/**
 * @route   DELETE /api/image-posts/:id
 * @desc    Delete an image post
 * @access  Private (owner or admin)
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Check if post exists and belongs to user (or user is admin)
    const postCheck = await pool.query(
      "SELECT * FROM image_posts WHERE post_id = $1",
      [id]
    );

    if (postCheck.rows.length === 0) {
      return res.status(404).json({ message: "Post not found." });
    }

    const post = postCheck.rows[0];
    if (post.user_id !== userId && userRole !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this post." });
    }

    await pool.query("DELETE FROM image_posts WHERE post_id = $1", [id]);
    res.json({ message: "Post deleted successfully." });
  } catch (err) {
    console.error("Database error deleting image post:", err);
    res.status(500).json({ message: "Server error deleting image post." });
  }
});

export default router;
