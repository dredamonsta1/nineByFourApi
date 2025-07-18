// src/routes/profileListRoutes.js (on your backend server)
import { Router } from "express";
import { pool } from "../connect.js"; // Assuming this is your DB connection
import { authenticateToken } from "../middleware.js"; // Your auth middleware

const router = Router();

// GET /api/profile/list - Fetch the user's curated list
router.get("/list", authenticateToken, async (req, res) => {
  const userId = req.user.id; // Get user ID from the authenticated token
  try {
    // This query joins your curated list table with the artists table
    // to get the full artist details for each item in the user's list.
    const sql = `
      SELECT a.* FROM artists a
      JOIN user_profile_artists upa ON a.artist_id = upa.artist_id
      WHERE upa.user_id = $1
      ORDER BY a.count DESC;
    `;
    const result = await pool.query(sql, [userId]);
    res.status(200).json({ list: result.rows });
  } catch (error) {
    console.error("Error fetching profile list:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/profile/list/:artistId - Add an artist to the user's list
router.post("/list/:artistId", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { artistId } = req.params;
  try {
    // Use "INSERT ... ON CONFLICT DO NOTHING" to prevent adding duplicates
    const sql = `
      INSERT INTO user_profile_artists (user_id, artist_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, artist_id) DO NOTHING;
    `;
    await pool.query(sql, [userId, artistId]);
    res.status(201).json({ message: "Artist added to profile list." });
  } catch (error) {
    console.error("Error adding artist to profile list:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
