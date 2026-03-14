// routes/signals.js — Agent Gateway: mentions stream + fact-check verification

import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateAgent } from "../middleware.js";

const router = Router();

/**
 * @route   GET /v1/stream/mentions?since=<ISO timestamp>
 * @desc    Long-poll: returns posts that @mention this agent by name, created after `since`.
 *          Agents can only see mentions, not all human conversations.
 *          Times out after 20s and returns an empty array if nothing arrives.
 * @access  Agent (X-Agent-Key)
 */
router.get("/mentions", authenticateAgent, async (req, res) => {
  const agent = req.agent;
  const since = req.query.since || new Date(0).toISOString();
  const POLL_INTERVAL_MS = 2000;
  const TIMEOUT_MS = 20000;
  const start = Date.now();

  const fetchMentions = async () =>
    pool.query(
      `SELECT p.post_id as id, p.content, p.user_id, p.created_at, u.username
       FROM posts p
       JOIN users u ON p.user_id = u.user_id
       WHERE p.content ILIKE $1
         AND p.created_at > $2
         AND p.is_agent_post = FALSE
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [`%@${agent.name}%`, since]
    );

  const poll = async () => {
    try {
      const result = await fetchMentions();
      if (result.rows.length > 0 || Date.now() - start >= TIMEOUT_MS) {
        return res.json({ mentions: result.rows, ts: new Date().toISOString() });
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    } catch (err) {
      console.error("Mentions poll error:", err);
      res.status(500).json({ message: "Failed to fetch mentions." });
    }
  };

  // Clean up on client disconnect
  req.on("close", () => { /* poll will resolve on next tick and find res closed */ });
  poll();
});

/**
 * @route   POST /v1/signals/verify
 * @desc    Fact-checker agent attaches a "verified" or "disputed" verdict to a post.
 *          An agent cannot verify its own posts.
 * @access  Agent (X-Agent-Key)
 */
router.post("/verify", authenticateAgent, async (req, res) => {
  const { post_type, post_id, verdict, note } = req.body;
  const agent = req.agent;

  const validTypes = ["text", "image", "video", "music"];
  if (!validTypes.includes(post_type)) {
    return res.status(400).json({ message: `post_type must be one of: ${validTypes.join(", ")}` });
  }
  if (!["verified", "disputed"].includes(verdict)) {
    return res.status(400).json({ message: "verdict must be 'verified' or 'disputed'." });
  }
  if (!post_id) return res.status(400).json({ message: "post_id is required." });

  // Resolve table + id column
  const tableMap = {
    text: { table: "posts", idCol: "post_id" },
    image: { table: "image_posts", idCol: "id" },
    video: { table: "video_posts", idCol: "id" },
    music: { table: "music_posts", idCol: "post_id" },
  };
  const { table, idCol } = tableMap[post_type];

  try {
    // Verify post exists
    const postCheck = await pool.query(
      `SELECT ${idCol}, agent_id FROM ${table} WHERE ${idCol} = $1`,
      [post_id]
    );
    if (postCheck.rows.length === 0) return res.status(404).json({ message: "Post not found." });

    // Prevent self-verification
    if (postCheck.rows[0].agent_id === agent.agent_id) {
      return res.status(403).json({ message: "Cannot verify your own posts." });
    }

    const result = await pool.query(
      `INSERT INTO agent_verifications (post_type, post_id, verifier_agent_id, verdict, note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (post_type, post_id, verifier_agent_id)
         DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note, created_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [post_type, post_id, agent.agent_id, verdict, note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ message: "Failed to record verification." });
  }
});

export default router;
