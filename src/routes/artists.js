import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken, upload, handleMulterError } from "../middleware.js";

const router = Router();

// POST /api/artists/upload-image
router.post(
  "/upload-image",
  authenticateToken,
  upload.single("artistImage"),
  (req, res) => {
    if (req.file) {
      const imageUrl = `/uploads/${req.file.filename}`;
      res.status(200).json({
        message: "Image uploaded successfully!",
        imageUrl: imageUrl,
      });
    } else {
      res
        .status(400)
        .json({ message: "No file uploaded or file type not supported." });
    }
  },
  handleMulterError
);

// GET /api/artists
router.get("/", async (req, res) => {
  const sql = "SELECT * FROM artists ORDER BY artist_name ASC";
  try {
    const result = await pool.query(sql);
    res.json({ artists: result.rows });
  } catch (err) {
    console.error("Error fetching artists:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

// POST /api/artists
router.post("/", authenticateToken, async (req, res) => {
  const sql =
    "INSERT INTO artists(artist_name, aka, genre, count, state, region, label, mixtape, album, year, certifications, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *";
  try {
    const {
      artist_name,
      aka,
      genre,
      count,
      state,
      region,
      label,
      mixtape,
      album,
      year,
      certifications,
      image_url,
    } = req.body;

    const result = await pool.query(sql, [
      artist_name,
      aka,
      genre,
      count || 0,
      state,
      region,
      label,
      mixtape,
      album,
      year,
      certifications,
      image_url,
    ]);
    const newArtist = result.rows[0];
    res
      .status(201)
      .json({
        message: `New artist ${newArtist.artist_id} saved.`,
        artist: newArtist,
      });
  } catch (err) {
    console.error("Error inserting new artist:", err.message);
    if (err.code === "23505") {
      return res.status(409).json({
        message: "An artist with this name already exists.",
        error: err.detail,
      });
    }
    res.status(500).json({ code: 500, status: err.message });
  }
});

// PUT /api/artists/:artist_id/clout
router.put("/:artist_id/clout", async (req, res) => {
  const { artist_id } = req.params;
  const sql =
    "UPDATE artists SET count = count + 1 WHERE artist_id = $1 RETURNING count";
  try {
    const result = await pool.query(sql, [artist_id]);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `Artist with ID ${artist_id} not found.` });
    }
    res.json({
      message: "Clout updated successfully",
      artist_id: artist_id,
      new_clout_count: result.rows[0].count,
    });
  } catch (err) {
    console.error(
      "Error updating clout for artist ID",
      artist_id,
      ":",
      err.message
    );
    return res
      .status(500)
      .json({ message: "Failed to update clout", error: err.message });
  }
});

// DELETE /api/artists/:artist_id
router.delete("/:artist_id", authenticateToken, async (req, res) => {
  const { artist_id } = req.params;
  const sql = "DELETE FROM artists WHERE artist_id = $1";
  try {
    const result = await pool.query(sql, [artist_id]);
    if (result.rowCount === 1) {
      res.status(200).json({
        message: `Artist ${artist_id} was deleted`,
      });
    } else {
      res.status(404).json({
        message: "Artist not found",
      });
    }
  } catch (err) {
    console.error("Error deleting Artist", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

export default router;
