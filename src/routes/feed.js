// routes/feed.js - Combined feed endpoint for text and image posts

import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken, upload, videoUpload, handleMulterError } from "../middleware.js";

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
        p.post_id as id,
        p.user_id,
        p.content,
        NULL as image_url,
        NULL as caption,
        NULL as video_url,
        NULL as video_type,
        'text' as post_type,
        p.created_at,
        u.username
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.user_id

      UNION ALL

      SELECT
        ip.id,
        ip.user_id,
        NULL as content,
        ip.image_url,
        ip.caption,
        NULL as video_url,
        NULL as video_type,
        'image' as post_type,
        ip.created_at,
        u.username
      FROM image_posts ip
      LEFT JOIN users u ON ip.user_id = u.user_id

      UNION ALL

      SELECT
        vp.id,
        vp.user_id,
        NULL as content,
        NULL as image_url,
        vp.caption,
        vp.video_url,
        vp.video_type,
        'video' as post_type,
        vp.created_at,
        u.username
      FROM video_posts vp
      LEFT JOIN users u ON vp.user_id = u.user_id

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
 * @route   POST /api/feed/video
 * @desc    Upload a video file post
 * @access  Private
 */
router.post(
  "/video",
  authenticateToken,
  videoUpload.single("video"),
  handleMulterError,
  async (req, res) => {
    const { caption } = req.body;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "Video file is required." });
    }

    const videoUrl = `/uploads/${req.file.filename}`;

    try {
      const query = `
        INSERT INTO video_posts (user_id, video_url, video_type, caption)
        VALUES ($1, $2, 'upload', $3)
        RETURNING *, 'video' as post_type;
      `;
      const result = await pool.query(query, [userId, videoUrl, caption || ""]);

      const userQuery = await pool.query(
        "SELECT username FROM users WHERE user_id = $1",
        [userId]
      );
      const post = {
        ...result.rows[0],
        username: userQuery.rows[0]?.username,
      };

      res.status(201).json(post);
    } catch (err) {
      console.error("Error creating video post:", err);
      res.status(500).json({ message: "Failed to create video post." });
    }
  }
);

/**
 * @route   POST /api/feed/video-url
 * @desc    Create a video post from a URL (YouTube, etc.)
 * @access  Private
 */
router.post("/video-url", authenticateToken, async (req, res) => {
  const { videoUrl, caption } = req.body;
  const userId = req.user.id;

  if (!videoUrl || videoUrl.trim() === "") {
    return res.status(400).json({ message: "Video URL is required." });
  }

  // Detect YouTube URLs and extract video ID
  let finalUrl = videoUrl.trim();
  let videoType = "url";

  const youtubeMatch = finalUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (youtubeMatch) {
    finalUrl = youtubeMatch[1]; // Store just the video ID
    videoType = "youtube";
  }

  try {
    const query = `
      INSERT INTO video_posts (user_id, video_url, video_type, caption)
      VALUES ($1, $2, $3, $4)
      RETURNING *, 'video' as post_type;
    `;
    const result = await pool.query(query, [
      userId,
      finalUrl,
      videoType,
      caption || "",
    ]);

    const userQuery = await pool.query(
      "SELECT username FROM users WHERE user_id = $1",
      [userId]
    );
    const post = {
      ...result.rows[0],
      username: userQuery.rows[0]?.username,
    };

    res.status(201).json(post);
  } catch (err) {
    console.error("Error creating video URL post:", err);
    res.status(500).json({ message: "Failed to create video post." });
  }
});

/**
 * @route   DELETE /api/feed/:type/:id
 * @desc    Delete a post (text, image, or video)
 * @access  Private (owner or admin)
 */
router.delete("/:type/:id", authenticateToken, async (req, res) => {
  const { type, id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  let table, idColumn;
  if (type === "image") {
    table = "image_posts";
    idColumn = "id";
  } else if (type === "video") {
    table = "video_posts";
    idColumn = "id";
  } else {
    table = "posts";
    idColumn = "post_id";
  }

  try {
    // Check if post exists and get owner
    const checkQuery = await pool.query(
      `SELECT user_id FROM ${table} WHERE ${idColumn} = $1`,
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

    await pool.query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [id]);
    res.json({ message: "Post deleted successfully." });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ message: "Failed to delete post." });
  }
});

export default router;
