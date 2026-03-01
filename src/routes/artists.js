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
      const imageUrl = req.file.path;
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
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const search = req.query.search?.trim() || "";
  const genre = req.query.genre?.trim() || "";
  const state = req.query.state?.trim() || "";
  const sort = req.query.sort?.trim() || "clout";

  // Determine ORDER BY clause
  const sortOptions = {
    clout: "a.count DESC, a.artist_name ASC",
    name: "a.artist_name ASC",
    newest: "a.artist_id DESC",
  };
  const orderBy = sortOptions[sort] || sortOptions.clout;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(`a.artist_name % $${paramIndex}`);
    params.push(search);
    paramIndex++;
  }
  if (genre) {
    conditions.push(`a.genre ILIKE $${paramIndex}`);
    params.push(`%${genre}%`);
    paramIndex++;
  }
  if (state) {
    conditions.push(`a.state ILIKE $${paramIndex}`);
    params.push(`%${state}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    // Get total count for pagination metadata
    const countSql = `SELECT COUNT(*) FROM artists AS a ${whereClause}`;
    const countResult = await pool.query(countSql, params);
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Get paginated artists with albums
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
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    const result = await pool.query(sql, [...params, limit, offset]);
    res.json({
      artists: result.rows,
      page,
      limit,
      totalCount,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (err) {
    console.error("Error fetching artists:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

// GET /api/artists/:artist_id
router.get("/:artist_id", async (req, res) => {
  const { artist_id } = req.params;
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
    WHERE a.artist_id = $1;
  `;
  try {
    const result = await pool.query(sql, [artist_id]);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `Artist with ID ${artist_id} not found.` });
    }
    res.json({ artist: result.rows[0] });
  } catch (err) {
    console.error(`Error fetching artist ${artist_id}:`, err.message);
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

// PUT /api/artists/:artist_id/albums/:album_id (to update a specific album)
router.put(
  "/:artist_id/albums/:album_id",
  authenticateToken,
  async (req, res) => {
    const { album_id } = req.params;
    const requestingUser = req.user;

    // Security check: Only allow admins to update albums
    if (requestingUser.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Permission denied. Admin role required." });
    }
    const { album_name, year, certifications } = req.body;

    if (!album_name && !year && !certifications) {
      return res.status(400).json({
        message:
          "At least one field (album_name, year, certifications) is required to update.",
      });
    }

    const fieldsToUpdate = [];
    const values = [];
    let queryIndex = 1;

    if (album_name !== undefined) {
      fieldsToUpdate.push(`album_name = $${queryIndex++}`);
      values.push(album_name);
    }
    if (year !== undefined) {
      fieldsToUpdate.push(`year = $${queryIndex++}`);
      values.push(year);
    }
    if (certifications !== undefined) {
      fieldsToUpdate.push(`certifications = $${queryIndex++}`);
      values.push(certifications);
    }

    values.push(album_id);

    const sql = `UPDATE albums SET ${fieldsToUpdate.join(
      ", "
    )} WHERE album_id = $${queryIndex} RETURNING *`;

    try {
      const result = await pool.query(sql, values);
      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ message: `Album with ID ${album_id} not found.` });
      }
      res.status(200).json({
        message: "Album updated successfully.",
        album: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating album:", err.message);
      res
        .status(500)
        .json({ message: "Failed to update album.", error: err.message });
    }
  }
);

// DELETE /api/artists/:artist_id/albums/:album_id (to delete a specific album)
router.delete(
  "/:artist_id/albums/:album_id",
  authenticateToken,
  async (req, res) => {
    const { album_id } = req.params;
    const requestingUser = req.user;

    // Security check: Only allow admins to delete albums
    if (requestingUser.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Permission denied. Admin role required." });
    }

    const sql = "DELETE FROM albums WHERE album_id = $1";
    try {
      const result = await pool.query(sql, [album_id]);
      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ message: `Album with ID ${album_id} not found.` });
      }
      res.status(200).json({ message: `Album ${album_id} was deleted.` });
    } catch (err) {
      console.error("Error deleting album:", err.message);
      res
        .status(500)
        .json({ message: "Failed to delete album.", error: err.message });
    }
  }
);

// PUT /api/artists/:artist_id (to update artist details)
router.put("/:artist_id", authenticateToken, async (req, res) => {
  const requestingUser = req.user;

  // Security check: Only allow admins to update artist details.
  if (requestingUser.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Permission denied. Admin role required." });
  }

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

// PUT /api/artists/:artist_id/clout/remove
router.put("/:artist_id/clout/remove", authenticateToken, async (req, res) => {
  const { artist_id } = req.params;
  const sql =
    "UPDATE artists SET count = GREATEST(count - 1, 0) WHERE artist_id = $1 RETURNING count";
  try {
    const result = await pool.query(sql, [artist_id]);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `Artist with ID ${artist_id} not found.` });
    }
    res.json({
      message: "Clout removed successfully",
      artist_id: artist_id,
      new_clout_count: result.rows[0].count,
    });
  } catch (err) {
    console.error(
      "Error removing clout for artist ID",
      artist_id,
      ":",
      err.message
    );
    return res
      .status(500)
      .json({ message: "Failed to remove clout", error: err.message });
  }
});

// DELETE /api/artists/:artist_id
router.delete("/:artist_id", authenticateToken, async (req, res) => {
  const requestingUser = req.user;

  // Security check: Only allow users with the 'admin' role to delete artists.
  if (requestingUser.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Permission denied. Admin role required." });
  }

  const { artist_id } = req.params;
  const sql = "DELETE FROM artists WHERE artist_id = $1";
  try {
    const result = await pool.query(sql, [artist_id]);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `Artist with ID ${artist_id} not found.` });
    }
    res.status(200).json({ message: `Artist ${artist_id} was deleted.` });
  } catch (err) {
    console.error("Error deleting Artist", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

export default router;
