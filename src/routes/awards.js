import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";

const router = Router();

// GET /api/awards/:artistId — get all awards for an artist
router.get("/:artistId", async (req, res) => {
  const { artistId } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM awards WHERE artist_id = $1 ORDER BY year DESC, award_name ASC",
      [artistId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching awards:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/awards — add an award (admin only)
router.post("/", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { artist_id, award_name, show, category, year } = req.body;
  if (!artist_id || !award_name) {
    return res.status(400).json({ message: "artist_id and award_name are required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO awards (artist_id, award_name, show, category, year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [artist_id, award_name, show || null, category || null, year || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding award:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/awards/:awardId — remove an award (admin only)
router.delete("/:awardId", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  const { awardId } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM awards WHERE award_id = $1 RETURNING award_id",
      [awardId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Award not found" });
    }
    res.json({ message: "Award deleted" });
  } catch (err) {
    console.error("Error deleting award:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
