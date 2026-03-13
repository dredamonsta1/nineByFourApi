// routes/rooms.js
import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const router = Router();

const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

function getRoomService() {
  return new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

/**
 * Build a LiveKit access token.
 * canPublish = true  → speaker/host
 * canPublish = false → listener (subscribe only)
 */
function buildToken({ identity, name, roomName, canPublish, metadata = "" }) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    metadata,
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true, // everyone can send data messages (raise hand, chat)
  });
  return at.toJwt();
}

/**
 * @route   GET /api/rooms
 * @desc    List all live rooms with participant count from LiveKit
 * @access  Private
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.username as host_username
       FROM rooms r
       JOIN users u ON r.host_id = u.user_id
       WHERE r.status = 'live'
       ORDER BY r.created_at DESC`
    );

    // Fetch participant counts from LiveKit for each room
    let livekitRooms = [];
    try {
      const svc = getRoomService();
      livekitRooms = await svc.listRooms();
    } catch (_) {
      // LiveKit may not be configured yet — degrade gracefully
    }

    const countMap = {};
    for (const lr of livekitRooms) {
      countMap[lr.name] = lr.numParticipants;
    }

    const rooms = rows.map((r) => ({
      ...r,
      participant_count: countMap[r.livekit_room_name] ?? 0,
    }));

    res.json(rooms);
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ message: "Failed to fetch rooms." });
  }
});

/**
 * @route   POST /api/rooms
 * @desc    Create a new live room (host)
 * @access  Private
 */
router.post("/", authenticateToken, async (req, res) => {
  const { title, description } = req.body;
  const userId = req.user.id;
  const username = req.user.username;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: "Room title is required." });
  }

  const roomName = `room_${userId}_${Date.now()}`;

  try {
    // Create the room in LiveKit
    try {
      const svc = getRoomService();
      await svc.createRoom({ name: roomName, emptyTimeout: 300, maxParticipants: 500 });
    } catch (lkErr) {
      console.warn("LiveKit createRoom failed (keys not set yet?):", lkErr.message);
    }

    const { rows } = await pool.query(
      `INSERT INTO rooms (host_id, title, description, livekit_room_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, title.trim(), description?.trim() || null, roomName]
    );

    const room = rows[0];

    // Generate host token
    const token = await buildToken({
      identity: String(userId),
      name: username,
      roomName,
      canPublish: true,
      metadata: JSON.stringify({ role: "host" }),
    });

    res.status(201).json({ ...room, token, host_username: username });
  } catch (err) {
    console.error("Error creating room:", err);
    res.status(500).json({ message: "Failed to create room." });
  }
});

/**
 * @route   GET /api/rooms/:id
 * @desc    Get a single room's details
 * @access  Private
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.username as host_username
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
 * @route   POST /api/rooms/:id/token
 * @desc    Join a room — returns a LiveKit token
 *          Hosts and existing speakers get canPublish=true; listeners get false.
 *          Pass { role: "speaker" } in body to request speaker access (host approval still needed).
 * @access  Private
 */
router.post("/:id/token", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const username = req.user.username;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM rooms WHERE room_id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Room not found." });
    const room = rows[0];
    if (room.status === "ended") return res.status(410).json({ message: "Room has ended." });

    const isHost = room.host_id === userId;
    // Hosts always get publish rights; others start as listeners
    const canPublish = isHost;
    const role = isHost ? "host" : "listener";

    const token = await buildToken({
      identity: String(userId),
      name: username,
      roomName: room.livekit_room_name,
      canPublish,
      metadata: JSON.stringify({ role, userId, username }),
    });

    res.json({ token, role, livekit_url: LIVEKIT_URL, room });
  } catch (err) {
    console.error("Error generating token:", err);
    res.status(500).json({ message: "Failed to generate token." });
  }
});

/**
 * @route   POST /api/rooms/:id/promote/:userId
 * @desc    Host promotes a listener to speaker (grants publish permission)
 * @access  Private (host only)
 */
router.post("/:id/promote/:targetUserId", authenticateToken, async (req, res) => {
  const requesterId = req.user.id;
  const { targetUserId } = req.params;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM rooms WHERE room_id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Room not found." });
    const room = rows[0];

    if (room.host_id !== requesterId) {
      return res.status(403).json({ message: "Only the host can promote participants." });
    }

    try {
      const svc = getRoomService();
      await svc.updateParticipant(room.livekit_room_name, String(targetUserId), {
        permission: { canPublish: true, canSubscribe: true, canPublishData: true },
        metadata: JSON.stringify({ role: "speaker", userId: targetUserId }),
      });
    } catch (lkErr) {
      console.warn("LiveKit updateParticipant failed:", lkErr.message);
    }

    res.json({ message: "Participant promoted to speaker." });
  } catch (err) {
    console.error("Error promoting participant:", err);
    res.status(500).json({ message: "Failed to promote participant." });
  }
});

/**
 * @route   POST /api/rooms/:id/demote/:targetUserId
 * @desc    Host demotes a speaker back to listener (revokes publish permission)
 * @access  Private (host only)
 */
router.post("/:id/demote/:targetUserId", authenticateToken, async (req, res) => {
  const requesterId = req.user.id;
  const { targetUserId } = req.params;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM rooms WHERE room_id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Room not found." });
    const room = rows[0];

    if (room.host_id !== requesterId) {
      return res.status(403).json({ message: "Only the host can demote participants." });
    }

    try {
      const svc = getRoomService();
      await svc.updateParticipant(room.livekit_room_name, String(targetUserId), {
        permission: { canPublish: false, canSubscribe: true, canPublishData: true },
        metadata: JSON.stringify({ role: "listener", userId: targetUserId }),
      });
    } catch (lkErr) {
      console.warn("LiveKit updateParticipant failed:", lkErr.message);
    }

    res.json({ message: "Participant demoted to listener." });
  } catch (err) {
    console.error("Error demoting participant:", err);
    res.status(500).json({ message: "Failed to demote participant." });
  }
});

/**
 * @route   POST /api/rooms/:id/end
 * @desc    Host ends the room
 * @access  Private (host only)
 */
router.post("/:id/end", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM rooms WHERE room_id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Room not found." });
    const room = rows[0];

    if (room.host_id !== userId && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only the host can end this room." });
    }

    try {
      const svc = getRoomService();
      await svc.deleteRoom(room.livekit_room_name);
    } catch (lkErr) {
      console.warn("LiveKit deleteRoom failed:", lkErr.message);
    }

    await pool.query(
      "UPDATE rooms SET status = 'ended', ended_at = NOW() WHERE room_id = $1",
      [room.room_id]
    );

    res.json({ message: "Room ended." });
  } catch (err) {
    console.error("Error ending room:", err);
    res.status(500).json({ message: "Failed to end room." });
  }
});

export default router;
