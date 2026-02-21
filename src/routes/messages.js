import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";

const router = Router();

// Helper: check if two users mutually follow each other
async function areMutualFollowers(userA, userB) {
  const result = await pool.query(
    `SELECT COUNT(*) AS cnt FROM follows
     WHERE (follower_id = $1 AND following_id = $2)
        OR (follower_id = $2 AND following_id = $1)`,
    [userA, userB]
  );
  return parseInt(result.rows[0].cnt) === 2;
}

// GET /api/messages/unread-count
// Returns total unread message count for the logged-in user
router.get("/unread-count", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM messages m
       JOIN conversations c ON m.conversation_id = c.conversation_id
       WHERE (c.user_one = $1 OR c.user_two = $1)
         AND m.sender_id != $1
         AND m.is_read = FALSE`,
      [userId]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("Unread count error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/messages/check-dm/:userId
// Check if current user can DM target user (mutual follow) + get existing conversation
router.get("/check-dm/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = parseInt(req.params.userId);

    if (currentUserId === targetUserId) {
      return res.json({ canDM: false, reason: "Cannot message yourself" });
    }

    const mutual = await areMutualFollowers(currentUserId, targetUserId);
    if (!mutual) {
      return res.json({ canDM: false, reason: "Mutual follow required" });
    }

    // Check for existing conversation
    const [smaller, larger] = [currentUserId, targetUserId].sort((a, b) => a - b);
    const conv = await pool.query(
      `SELECT conversation_id FROM conversations WHERE user_one = $1 AND user_two = $2`,
      [smaller, larger]
    );

    res.json({
      canDM: true,
      conversationId: conv.rows.length > 0 ? conv.rows[0].conversation_id : null,
    });
  } catch (err) {
    console.error("Check DM error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/messages/conversations
// List all conversations for the logged-in user with last message + unread count
router.get("/conversations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT
        c.conversation_id,
        c.user_one,
        c.user_two,
        c.updated_at,
        u.username AS other_username,
        u.user_id AS other_user_id,
        u.profile_image AS other_profile_image,
        last_msg.content AS last_message,
        last_msg.created_at AS last_message_at,
        last_msg.sender_id AS last_sender_id,
        COALESCE(unread.count, 0) AS unread_count
      FROM conversations c
      JOIN users u ON u.user_id = CASE WHEN c.user_one = $1 THEN c.user_two ELSE c.user_one END
      LEFT JOIN LATERAL (
        SELECT content, created_at, sender_id FROM messages
        WHERE conversation_id = c.conversation_id
        ORDER BY created_at DESC LIMIT 1
      ) last_msg ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count FROM messages
        WHERE conversation_id = c.conversation_id
          AND sender_id != $1 AND is_read = FALSE
      ) unread ON true
      WHERE c.user_one = $1 OR c.user_two = $1
      ORDER BY c.updated_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List conversations error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/messages/conversations
// Create or get existing conversation with a recipient (requires mutual follow)
router.post("/conversations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { recipient_id } = req.body;

    if (!recipient_id) {
      return res.status(400).json({ message: "recipient_id is required" });
    }

    if (userId === recipient_id) {
      return res.status(400).json({ message: "Cannot create conversation with yourself" });
    }

    const mutual = await areMutualFollowers(userId, recipient_id);
    if (!mutual) {
      return res.status(403).json({ message: "Mutual follow required to start a conversation" });
    }

    const [smaller, larger] = [userId, recipient_id].sort((a, b) => a - b);

    // Try to find existing conversation first
    const existing = await pool.query(
      `SELECT conversation_id FROM conversations WHERE user_one = $1 AND user_two = $2`,
      [smaller, larger]
    );

    if (existing.rows.length > 0) {
      return res.json({ conversation_id: existing.rows[0].conversation_id, created: false });
    }

    // Create new conversation
    const result = await pool.query(
      `INSERT INTO conversations (user_one, user_two) VALUES ($1, $2) RETURNING conversation_id`,
      [smaller, larger]
    );

    res.status(201).json({ conversation_id: result.rows[0].conversation_id, created: true });
  } catch (err) {
    console.error("Create conversation error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/messages/conversations/:id
// Get messages for a conversation (cursor pagination with ?before=<id>&limit=30)
router.get("/conversations/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);
    const before = req.query.before ? parseInt(req.query.before) : null;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    // Verify user is part of this conversation
    const conv = await pool.query(
      `SELECT * FROM conversations WHERE conversation_id = $1 AND (user_one = $2 OR user_two = $2)`,
      [conversationId, userId]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    let query, params;
    if (before) {
      query = `SELECT m.*, u.username AS sender_username FROM messages m
               JOIN users u ON u.user_id = m.sender_id
               WHERE m.conversation_id = $1 AND m.message_id < $2
               ORDER BY m.created_at DESC LIMIT $3`;
      params = [conversationId, before, limit];
    } else {
      query = `SELECT m.*, u.username AS sender_username FROM messages m
               JOIN users u ON u.user_id = m.sender_id
               WHERE m.conversation_id = $1
               ORDER BY m.created_at DESC LIMIT $2`;
      params = [conversationId, limit];
    }

    const result = await pool.query(query, params);
    res.json({
      messages: result.rows.reverse(),
      hasMore: result.rows.length === limit,
    });
  } catch (err) {
    console.error("Get messages error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/messages/conversations/:id
// Send a message in a conversation (re-verifies mutual follow)
router.post("/conversations/:id", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Message content is required" });
    }

    // Verify user is part of this conversation
    const conv = await pool.query(
      `SELECT * FROM conversations WHERE conversation_id = $1 AND (user_one = $2 OR user_two = $2)`,
      [conversationId, userId]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Re-verify mutual follow
    const otherUserId = conv.rows[0].user_one === userId ? conv.rows[0].user_two : conv.rows[0].user_one;
    const mutual = await areMutualFollowers(userId, otherUserId);
    if (!mutual) {
      return res.status(403).json({ message: "Mutual follow required to send messages" });
    }

    // Insert message
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [conversationId, userId, content.trim()]
    );

    // Update conversation timestamp
    await pool.query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE conversation_id = $1`,
      [conversationId]
    );

    // Get sender username for response
    const user = await pool.query(`SELECT username FROM users WHERE user_id = $1`, [userId]);

    res.status(201).json({
      ...result.rows[0],
      sender_username: user.rows[0].username,
    });
  } catch (err) {
    console.error("Send message error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/messages/conversations/:id/read
// Mark all messages in a conversation as read (messages not sent by current user)
router.patch("/conversations/:id/read", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = parseInt(req.params.id);

    // Verify user is part of this conversation
    const conv = await pool.query(
      `SELECT * FROM conversations WHERE conversation_id = $1 AND (user_one = $2 OR user_two = $2)`,
      [conversationId, userId]
    );

    if (conv.rows.length === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    await pool.query(
      `UPDATE messages SET is_read = TRUE
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
      [conversationId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
