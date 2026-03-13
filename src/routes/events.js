// routes/events.js
import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken, upload, handleMulterError } from "../middleware.js";

const router = Router();

/**
 * @route   GET /api/events
 * @desc    Get upcoming events (event_date >= today)
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, u.username
       FROM events e
       LEFT JOIN users u ON e.user_id = u.user_id
       WHERE e.event_date >= CURRENT_DATE
       ORDER BY e.event_date ASC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ message: "Failed to fetch events." });
  }
});

/**
 * @route   POST /api/events
 * @desc    Create an event (optional flyer image)
 * @access  Private
 */
router.post(
  "/",
  authenticateToken,
  upload.single("flyer"),
  handleMulterError,
  async (req, res) => {
    const userId = req.user.id;
    const { title, event_date, event_time, venue, city } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ message: "Title and date are required." });
    }

    const flyerUrl = req.file ? req.file.path : null;

    try {
      const result = await pool.query(
        `INSERT INTO events (user_id, title, event_date, event_time, venue, city, flyer_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, title, event_date, event_time || null, venue || null, city || null, flyerUrl]
      );
      const userQuery = await pool.query(
        "SELECT username FROM users WHERE user_id = $1",
        [userId]
      );
      res.status(201).json({
        ...result.rows[0],
        username: userQuery.rows[0]?.username,
      });
    } catch (err) {
      console.error("Error creating event:", err);
      res.status(500).json({ message: "Failed to create event." });
    }
  }
);

/**
 * @route   DELETE /api/events/:id
 * @desc    Delete an event (owner or admin)
 * @access  Private
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const check = await pool.query(
      "SELECT user_id FROM events WHERE event_id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Event not found." });
    }
    if (check.rows[0].user_id !== userId && userRole !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete this event." });
    }
    await pool.query("DELETE FROM events WHERE event_id = $1", [id]);
    res.json({ message: "Event deleted successfully." });
  } catch (err) {
    console.error("Error deleting event:", err);
    res.status(500).json({ message: "Failed to delete event." });
  }
});

export default router;
