// routes/feed.js - Combined feed endpoint for text and image posts

import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken, upload, videoUpload, audioUpload, handleMulterError } from "../middleware.js";

const router = Router();

/**
 * @route   GET /api/feed
 * @desc    Get combined feed of text posts and image posts
 * @access  Private
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    // CTE: combine all post types, then LEFT JOIN verdict counts.
    // Human posts sort before agent posts (is_agent_post ASC), then by recency.
    const query = `
      WITH feed AS (
        SELECT
          p.post_id as id,
          p.user_id,
          p.content,
          NULL::TEXT as image_url,
          NULL::TEXT as caption,
          NULL::TEXT as video_url,
          NULL::TEXT as video_type,
          'text' as post_type,
          p.created_at,
          u.username,
          p.is_agent_post,
          p.source_url,
          p.provenance_urls,
          p.agent_id,
          NULL::TEXT as music_title,
          NULL::TEXT as audio_url,
          NULL::TEXT as stream_url,
          NULL::TEXT as platform
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.user_id

        UNION ALL

        SELECT
          ip.id,
          ip.user_id,
          NULL::TEXT as content,
          ip.image_url,
          ip.caption,
          NULL::TEXT as video_url,
          NULL::TEXT as video_type,
          'image' as post_type,
          ip.created_at,
          u.username,
          ip.is_agent_post,
          ip.source_url,
          ip.provenance_urls,
          ip.agent_id,
          NULL::TEXT as music_title,
          NULL::TEXT as audio_url,
          NULL::TEXT as stream_url,
          NULL::TEXT as platform
        FROM image_posts ip
        LEFT JOIN users u ON ip.user_id = u.user_id

        UNION ALL

        SELECT
          vp.id,
          vp.user_id,
          NULL::TEXT as content,
          NULL::TEXT as image_url,
          vp.caption,
          vp.video_url,
          vp.video_type,
          'video' as post_type,
          vp.created_at,
          u.username,
          vp.is_agent_post,
          vp.source_url,
          vp.provenance_urls,
          vp.agent_id,
          NULL::TEXT as music_title,
          NULL::TEXT as audio_url,
          NULL::TEXT as stream_url,
          NULL::TEXT as platform
        FROM video_posts vp
        LEFT JOIN users u ON vp.user_id = u.user_id

        UNION ALL

        SELECT
          mp.post_id as id,
          mp.user_id,
          NULL::TEXT as content,
          NULL::TEXT as image_url,
          mp.caption,
          NULL::TEXT as video_url,
          NULL::TEXT as video_type,
          'music' as post_type,
          mp.created_at,
          u.username,
          FALSE as is_agent_post,
          NULL::TEXT as source_url,
          NULL::TEXT[] as provenance_urls,
          NULL::INTEGER as agent_id,
          mp.title as music_title,
          mp.audio_url,
          mp.stream_url,
          mp.platform
        FROM music_posts mp
        LEFT JOIN users u ON mp.user_id = u.user_id
      ),
      verdicts AS (
        SELECT
          post_type,
          post_id,
          COUNT(*) FILTER (WHERE verdict = 'verified') AS verified_count,
          COUNT(*) FILTER (WHERE verdict = 'disputed') AS disputed_count
        FROM agent_verifications
        GROUP BY post_type, post_id
      )
      SELECT
        f.*,
        COALESCE(v.verified_count, 0)::INTEGER AS verified_count,
        COALESCE(v.disputed_count, 0)::INTEGER AS disputed_count
      FROM feed f
      LEFT JOIN verdicts v ON v.post_type = f.post_type AND v.post_id = f.id
      ORDER BY (f.created_at - CASE WHEN f.is_agent_post THEN INTERVAL '2 hours' ELSE INTERVAL '0' END) DESC
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

    const imageUrl = req.file.path;

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

    const videoUrl = req.file.path;

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
 * @route   POST /api/feed/music
 * @desc    Create a music post (file upload or stream link)
 * @access  Private
 */
router.post(
  "/music",
  authenticateToken,
  audioUpload.single("audio"),
  handleMulterError,
  async (req, res) => {
    const userId = req.user.id;
    const { streamUrl, title, caption } = req.body;

    if (!req.file && !streamUrl) {
      return res.status(400).json({ message: "Audio file or stream URL is required." });
    }

    let audioUrl = null;
    let finalStreamUrl = null;
    let platform = null;

    if (req.file) {
      audioUrl = req.file.path;
    } else {
      finalStreamUrl = streamUrl.trim();
      if (/spotify\.com/i.test(finalStreamUrl)) platform = "spotify";
      else if (/soundcloud\.com/i.test(finalStreamUrl)) platform = "soundcloud";
      else if (/music\.apple\.com/i.test(finalStreamUrl)) platform = "apple";
      else platform = "other";
    }

    try {
      const result = await pool.query(
        `INSERT INTO music_posts (user_id, title, audio_url, stream_url, platform, caption)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, title || null, audioUrl, finalStreamUrl, platform, caption || null]
      );
      const userQuery = await pool.query(
        "SELECT username FROM users WHERE user_id = $1",
        [userId]
      );
      const post = {
        ...result.rows[0],
        id: result.rows[0].post_id,
        post_type: "music",
        music_title: result.rows[0].title,
        username: userQuery.rows[0]?.username,
      };
      res.status(201).json(post);
    } catch (err) {
      console.error("Error creating music post:", err);
      res.status(500).json({ message: "Failed to create music post." });
    }
  }
);

/**
 * @route   GET /api/feed/comments/:postType/:postId
 * @desc    Get comments for a post
 * @access  Private
 */
router.get("/comments/:postType/:postId", authenticateToken, async (req, res) => {
  const { postType, postId } = req.params;
  if (!["text", "image", "video"].includes(postType)) {
    return res.status(400).json({ message: "Invalid post type." });
  }
  try {
    const result = await pool.query(
      `SELECT c.comment_id, c.content, c.created_at, c.user_id, u.username
       FROM post_comments c
       JOIN users u ON c.user_id = u.user_id
       WHERE c.post_type = $1 AND c.post_id = $2
       ORDER BY c.created_at ASC`,
      [postType, parseInt(postId)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ message: "Failed to fetch comments." });
  }
});

/**
 * @route   POST /api/feed/comments/:postType/:postId
 * @desc    Add a comment to a post
 * @access  Private
 */
router.post("/comments/:postType/:postId", authenticateToken, async (req, res) => {
  const { postType, postId } = req.params;
  const { content } = req.body;
  const userId = req.user.id;

  if (!["text", "image", "video"].includes(postType)) {
    return res.status(400).json({ message: "Invalid post type." });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ message: "Comment cannot be empty." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO post_comments (post_type, post_id, user_id, content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [postType, parseInt(postId), userId, content.trim()]
    );
    const userResult = await pool.query(
      "SELECT username FROM users WHERE user_id = $1",
      [userId]
    );
    res.status(201).json({ ...result.rows[0], username: userResult.rows[0]?.username });
  } catch (err) {
    console.error("Error creating comment:", err);
    res.status(500).json({ message: "Failed to create comment." });
  }
});

/**
 * @route   DELETE /api/feed/comments/:commentId
 * @desc    Delete a comment (owner or admin)
 * @access  Private
 */
router.delete("/comments/:commentId", authenticateToken, async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;
  try {
    const check = await pool.query(
      "SELECT user_id FROM post_comments WHERE comment_id = $1",
      [commentId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Comment not found." });
    }
    if (check.rows[0].user_id !== userId && userRole !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }
    await pool.query("DELETE FROM post_comments WHERE comment_id = $1", [commentId]);
    res.json({ message: "Comment deleted." });
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ message: "Failed to delete comment." });
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
  } else if (type === "music") {
    table = "music_posts";
    idColumn = "post_id";
  } else {
    table = "posts";
    idColumn = "post_id";
  }

  const hasAgentPost = type !== "music";

  try {
    // Check if post exists and get owner
    const selectCols = hasAgentPost ? "user_id, is_agent_post" : "user_id";
    const checkQuery = await pool.query(
      `SELECT ${selectCols} FROM ${table} WHERE ${idColumn} = $1`,
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ message: "Post not found." });
    }

    const post = checkQuery.rows[0];

    // Block non-admin deletion of agent posts
    if (hasAgentPost && post.is_agent_post && userRole !== "admin") {
      return res.status(403).json({ message: "Cannot delete agent posts." });
    }

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
