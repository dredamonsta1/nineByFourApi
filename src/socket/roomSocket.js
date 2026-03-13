/**
 * socket/roomSocket.js
 *
 * WebRTC signaling server for Live Rooms.
 *
 * Architecture: full-mesh peer connections
 *   - Speakers connect to every other speaker (bidirectional audio)
 *   - Listeners connect receive-only to every speaker
 *   - All signaling (offer/answer/ICE) relayed through this server
 *   - Room state (participants, roles, raised hands) kept in memory per room
 *
 * In-memory roomState shape:
 *   {
 *     [roomId]: {
 *       hostId: number,
 *       participants: Map<socketId, { userId, username, role: 'host'|'speaker'|'listener' }>,
 *       handsUp: Set<socketId>,
 *     }
 *   }
 */

import { pool } from "../connect.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// In-memory room state — shared with REST routes via app.set("roomState", roomState)
const roomState = {};

function getRoom(roomId) {
  return roomState[roomId];
}

function getOrCreateRoom(roomId, hostId) {
  if (!roomState[roomId]) {
    roomState[roomId] = {
      hostId,
      participants: new Map(),
      handsUp: new Set(),
    };
  }
  return roomState[roomId];
}

function participantList(room) {
  return [...room.participants.entries()].map(([socketId, data]) => ({
    socketId,
    ...data,
    hasHandUp: room.handsUp.has(socketId),
  }));
}

export function initRoomSocket(io, app) {
  // Share room state with REST routes (for participant count)
  app.set("roomState", roomState);

  // Authenticate socket connections via JWT in handshake auth
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required."));
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return next(new Error("Invalid token."));
      socket.user = user;
      next();
    });
  });

  io.on("connection", (socket) => {
    const { id: userId, username, role: userRole } = socket.user;

    // ── join-room ──────────────────────────────────────────────────────────
    socket.on("join-room", async ({ roomId }) => {
      try {
        const { rows } = await pool.query(
          "SELECT * FROM rooms WHERE room_id = $1 AND status = 'live'",
          [roomId]
        );
        if (rows.length === 0) {
          socket.emit("error", { message: "Room not found or has ended." });
          return;
        }
        const dbRoom = rows[0];
        const room = getOrCreateRoom(roomId, dbRoom.host_id);

        const isHost = dbRoom.host_id === userId;
        const role = isHost ? "host" : "listener";

        room.participants.set(socket.id, { userId, username, role });
        socket.join(String(roomId));
        socket.data.roomId = roomId;

        // Send the new participant the current participant list
        socket.emit("room-joined", {
          participants: participantList(room),
          room: dbRoom,
          mySocketId: socket.id,
          myRole: role,
        });

        // Tell everyone else about the new participant
        socket.to(String(roomId)).emit("participant-joined", {
          socketId: socket.id,
          userId,
          username,
          role,
          hasHandUp: false,
        });
      } catch (err) {
        console.error("join-room error:", err);
        socket.emit("error", { message: "Failed to join room." });
      }
    });

    // ── WebRTC signaling relay ─────────────────────────────────────────────
    // offer: { targetSocketId, sdp }
    socket.on("offer", ({ targetSocketId, sdp }) => {
      io.to(targetSocketId).emit("offer", { fromSocketId: socket.id, sdp });
    });

    // answer: { targetSocketId, sdp }
    socket.on("answer", ({ targetSocketId, sdp }) => {
      io.to(targetSocketId).emit("answer", { fromSocketId: socket.id, sdp });
    });

    // ice-candidate: { targetSocketId, candidate }
    socket.on("ice-candidate", ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit("ice-candidate", { fromSocketId: socket.id, candidate });
    });

    // ── Raise / lower hand ─────────────────────────────────────────────────
    socket.on("raise-hand", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      if (!room) return;
      room.handsUp.add(socket.id);
      // Notify the host
      for (const [sid, p] of room.participants) {
        if (p.role === "host") {
          io.to(sid).emit("hand-raised", { socketId: socket.id, userId, username });
          break;
        }
      }
    });

    socket.on("lower-hand", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      if (!room) return;
      room.handsUp.delete(socket.id);
      for (const [sid, p] of room.participants) {
        if (p.role === "host") {
          io.to(sid).emit("hand-lowered", { socketId: socket.id });
          break;
        }
      }
    });

    // ── Promote / demote (host only) ───────────────────────────────────────
    socket.on("promote", ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      if (!room) return;
      const me = room.participants.get(socket.id);
      if (me?.role !== "host") return;

      const target = room.participants.get(targetSocketId);
      if (!target) return;
      target.role = "speaker";
      room.handsUp.delete(targetSocketId);

      // Tell the promoted participant to start publishing audio
      io.to(targetSocketId).emit("promoted", { role: "speaker" });
      // Tell everyone about the role change
      io.to(String(roomId)).emit("role-changed", { socketId: targetSocketId, role: "speaker" });
    });

    socket.on("demote", ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      if (!room) return;
      const me = room.participants.get(socket.id);
      if (me?.role !== "host") return;

      const target = room.participants.get(targetSocketId);
      if (!target) return;
      target.role = "listener";

      io.to(targetSocketId).emit("demoted", { role: "listener" });
      io.to(String(roomId)).emit("role-changed", { socketId: targetSocketId, role: "listener" });
    });

    // ── Mute participant (host only) ───────────────────────────────────────
    socket.on("mute-participant", ({ targetSocketId }) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      if (!room) return;
      const me = room.participants.get(socket.id);
      if (me?.role !== "host") return;
      io.to(targetSocketId).emit("force-muted");
    });

    // ── Chat ───────────────────────────────────────────────────────────────
    socket.on("chat-message", ({ text }) => {
      const roomId = socket.data.roomId;
      if (!roomId || !text?.trim()) return;
      io.to(String(roomId)).emit("chat-message", {
        fromSocketId: socket.id,
        userId,
        username,
        text: text.trim(),
        ts: Date.now(),
      });
    });

    // ── End room (host only) ───────────────────────────────────────────────
    socket.on("end-room", async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      if (!room) return;
      const me = room.participants.get(socket.id);
      if (me?.role !== "host") return;

      try {
        await pool.query(
          "UPDATE rooms SET status = 'ended', ended_at = NOW() WHERE room_id = $1",
          [roomId]
        );
      } catch (err) {
        console.error("end-room DB error:", err);
      }

      io.to(String(roomId)).emit("room-ended");
      delete roomState[roomId];
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      if (!room) return;

      room.participants.delete(socket.id);
      room.handsUp.delete(socket.id);

      socket.to(String(roomId)).emit("participant-left", { socketId: socket.id });

      // Clean up empty rooms
      if (room.participants.size === 0) {
        delete roomState[roomId];
      }
    });
  });
}
