// routes/imagePosts.js

import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pool } from "../connect.js"; // Import your database pool

const router = express.Router();

// --- Multer Configuration ---
// Ensures the 'uploads' directory exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Append extension
  },
});

const upload = multer({ storage: storage });

// --- API Endpoints ---

/**
 * @route   POST /api/image-posts
 * @desc    Create a new image post
 * @access  Private (You might want to add authentication middleware here)
 */
router.post("/", upload.single("image"), async (req, res) => {
  const { caption } = req.body;
  // const userId = req.user.id; // Get user ID from your JWT auth middleware

  if (!req.file) {
    return res.status(400).json({ msg: "Image file is required." });
  }

  // Construct the full URL for the image
  const imageUrl = `/uploads/${req.file.filename}`;

  try {
    const query = `
      INSERT INTO image_posts (image_url, caption, user_id) 
      VALUES ($1, $2, $3) 
      RETURNING *;
    `;
    // Replace '1' with the actual user ID from your auth logic
    const values = [imageUrl, caption, 1];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Database error on image post creation:", err);
    res.status(500).send("Server Error");
  }
});

/**
 * @route   GET /api/image-posts
 * @desc    Get all image posts
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    // Query to get posts and join with users table to get usernames, for example
    const query = `
      SELECT p.*, u.username 
      FROM image_posts p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Database error fetching image posts:", err);
    res.status(500).send("Server Error");
  }
});

export default router;
