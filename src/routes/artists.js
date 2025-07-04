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
  const sql = `
    SELECT
      a.*,
      COALESCE(
        (SELECT json_agg(alb ORDER BY alb.year DESC, alb.album_name ASC)
         FROM albums AS alb
         WHERE alb.artist_id = a.artist_id),
        '[]'::json
      ) AS albums
    FROM artists AS a
    ORDER BY a.artist_name ASC;
  `;
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
  const columns = [
    "artist_name",
    "aka",
    "genre",
    "state",
    "region",
    "label",
    "image_url",
  ];

  const values = columns.map((col) => {
    return req.body[col];
  });

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO artists(${columns.join(
    ", "
  )}) VALUES (${placeholders}) RETURNING *`;

  try {
    const result = await pool.query(sql, values);
    const newArtist = result.rows[0];
    res.status(201).json({
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

// POST /api/artists/:artist_id/albums
router.post("/:artist_id/albums", authenticateToken, async (req, res) => {
  const { artist_id } = req.params;
  // The body can be a single album object or an array of album objects
  const albums = Array.isArray(req.body) ? req.body : [req.body];

  if (albums.some((album) => !album.album_name)) {
    return res
      .status(400)
      .json({ message: "Each album must have an album_name." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN"); // Start transaction

    const insertedAlbums = [];
    for (const album of albums) {
      const { album_name, year, certifications } = album;
      const sql =
        "INSERT INTO albums(artist_id, album_name, year, certifications) VALUES ($1, $2, $3, $4) RETURNING *";
      const result = await client.query(sql, [
        artist_id,
        album_name,
        year,
        certifications,
      ]);
      insertedAlbums.push(result.rows[0]);
    }

    await client.query("COMMIT"); // Commit transaction
    res.status(201).json({
      message: `Successfully added ${insertedAlbums.length} album(s) to artist ${artist_id}.`,
      albums: insertedAlbums,
    });
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback on error
    console.error("Error adding album(s):", err.message);
    res
      .status(500)
      .json({ message: "Failed to add album(s).", error: err.message });
  } finally {
    client.release(); // Release the client back to the pool
  }
});

// PUT /api/artists/:artist_id (to update artist details)
router.put("/:artist_id", authenticateToken, async (req, res) => {
  const { artist_id } = req.params;
  const fields = req.body;

  // Define which columns are allowed to be updated
  const allowedColumns = [
    "artist_name",
    "aka",
    "genre",
    "state",
    "region",
    "label",
    "image_url",
  ];

  const columnsToUpdate = Object.keys(fields).filter((key) =>
    allowedColumns.includes(key)
  );

  if (columnsToUpdate.length === 0) {
    return res
      .status(400)
      .json({ message: "No valid fields provided for update." });
  }

  // Build the SQL query dynamically
  const setClause = columnsToUpdate
    .map((col, i) => `${col} = $${i + 1}`)
    .join(", ");
  const values = columnsToUpdate.map((col) => fields[col]);
  values.push(artist_id); // Add artist_id for the WHERE clause

  const sql = `UPDATE artists SET ${setClause} WHERE artist_id = $${
    columnsToUpdate.length + 1
  } RETURNING *`;

  try {
    const result = await pool.query(sql, values);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `Artist with ID ${artist_id} not found.` });
    }
    res.status(200).json({
      message: `Artist ${artist_id} updated successfully.`,
      artist: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating artist:", err.message);
    res
      .status(500)
      .json({ message: "Failed to update artist.", error: err.message });
  }
});

// A more direct way to upload and assign an image in one step
router.put(
  "/:artist_id/image",
  authenticateToken,
  upload.single("artistImage"),
  handleMulterError, // Handles errors from multer
  async (req, res) => {
    const { artist_id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided." });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const sql =
      "UPDATE artists SET image_url = $1 WHERE artist_id = $2 RETURNING *";

    try {
      const result = await pool.query(sql, [imageUrl, artist_id]);
      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ message: `Artist with ID ${artist_id} not found.` });
      }
      res.status(200).json({
        message: `Image for artist ${artist_id} updated successfully.`,
        artist: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating artist image:", err.message);
      res.status(500).json({
        message: "Failed to update artist image.",
        error: err.message,
      });
    }
  }
);

// PUT /api/artists/:artist_id/clout
router.put("/:artist_id/clout", authenticateToken, async (req, res) => {
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
