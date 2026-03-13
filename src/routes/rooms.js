// routes/rooms.js — REST layer for room persistence (signaling is in socket/roomSocket.js)
import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";

const router = Router();

/**
 * GET /api/rooms
 * List all live rooms. Participant counts come from the in-memory socket state
 * injected onto `req.app` by the Socket.io setup in index.js.
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.username AS host_username
       FROM rooms r
       JOIN users u ON r.host_id = u.user_id
       WHERE r.status = 'live'
       ORDER BY r.created_at DESC`
    );

    const roomState = req.app.get("roomState") || {};
    const rooms = rows.map((r) => ({
      ...r,
      participant_count: roomState[r.room_id]?.participants.size ?? 0,
    }));

    res.json(rooms);
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ message: "Failed to fetch rooms." });
  }
});

/**
 * POST /api/rooms
 * Create a new room. Returns the room record — the client then connects via Socket.io.
 */
router.post("/", authenticateToken, async (req, res) => {
  const { title, description } = req.body;
  const userId = req.user.id;
  const username = req.user.username;

  if (!title?.trim()) {
    return res.status(400).json({ message: "Room title is required." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO rooms (host_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, title.trim(), description?.trim() || null]
    );
    res.status(201).json({ ...rows[0], host_username: username });
  } catch (err) {
    console.error("Error creating room:", err);
    res.status(500).json({ message: "Failed to create room." });
  }
});

/**
 * GET /api/rooms/:id
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.username AS host_username
       FROM rooms r
       JOIN users u ON r.host_id = u.user_id
       WHERE r.room_id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Room not found." });
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching room:", err);
    res.status(500).json({ message: "Failed to fetch room." });
  }
});

/**
 * POST /api/rooms/:id/end
 * Host or admin ends the room in the DB. Socket.io handles notifying participants.
 */
router.post("/:id/end", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await pool.query("SELECT * FROM rooms WHERE room_id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Room not found." });
    if (rows[0].host_id !== userId && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only the host can end this room." });
    }
    await pool.query(
      "UPDATE rooms SET status = 'ended', ended_at = NOW() WHERE room_id = $1",
      [req.params.id]
    );
    res.json({ message: "Room ended." });
  } catch (err) {
    console.error("Error ending room:", err);
    res.status(500).json({ message: "Failed to end room." });
  }
});

export default router;
