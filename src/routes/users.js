// src/routes/users.js
import { Router } from "express";
import { pool } from "../connect.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken, upload } from "../middleware.js";
import { isWaitlistEnabled } from "./waitlist.js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// --- ROUTE 1: REGISTER ---
router.post("/register", async (req, res) => {
  const { username, password, email, invite_code } = req.body;
  if (!username || !password || !email || !invite_code) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = invite_code.trim().toUpperCase();

  try {
    const waitlistActive = await isWaitlistEnabled();
    if (waitlistActive) {
      const waitlistCheck = await pool.query(
        "SELECT * FROM waitlist WHERE TRIM(email) = $1 AND TRIM(invite_code) = $2 AND status = 'approved'",
        [cleanEmail, cleanCode]
      );
      if (waitlistCheck.rows.length === 0) {
        return res
          .status(403)
          .json({ message: "Invalid or unapproved invite code." });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("BEGIN");

    const userResult = await pool.query(
      "INSERT INTO users(username, password, email, role) VALUES ($1,$2,$3,$4) RETURNING user_id",
      [username.trim(), hashedPassword, cleanEmail, "user"]
    );

    await pool.query(
      "UPDATE waitlist SET status = 'registered', invite_code = NULL WHERE TRIM(email) = $1",
      [cleanEmail]
    );

    await pool.query("COMMIT");

    // Success response
    res.status(201).json({ message: "Welcome to 9by4!" });

    // Background Email
    try {
      if (process.env.RESEND_API_KEY) {
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "9by4 <onboarding@vedioz.me>",
          to: [cleanEmail],
          subject: "Welcome to 9by4!",
          text: `Welcome, ${username}! You're now part of 9by4.`,
          html: `<h1>Welcome, ${username}!</h1>`,
        });
      }
    } catch (e) {
      console.error("Email failed");
    }
  } catch (error) {
    await pool.query("ROLLBACK");
    if (error.code === "23505")
      return res.status(409).json({ message: "User exists." });
    res.status(500).json({ message: "Server error during registration." });
  }
});

// --- ROUTE 2: LOGIN ---
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE TRIM(username) = $1",
      [username.trim()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(200).json({
      token,
      user: { id: user.user_id, username: user.username, role: user.role, profile_image: user.profile_image },
    });
  } catch (error) {
    res.status(500).json({ message: "Login server error." });
  }
});

// src/routes/users.js
router.get("/me", authenticateToken, async (req, res) => {
  try {
    // req.user comes from your authenticateToken middleware
    const result = await pool.query(
      "SELECT user_id, username, email, role, profile_image FROM users WHERE user_id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user context" });
  }
});

// --- ROUTE: PUBLIC USER PROFILE ---
router.get("/:userId/profile", authenticateToken, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      "SELECT user_id, username, role, profile_image FROM users WHERE user_id = $1",
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json({
      user_id: user.user_id,
      username: user.username,
      role: user.role,
      profile_image: user.profile_image,
    });
  } catch (err) {
    console.error("Error fetching user profile:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// --- ROUTE: UPLOAD PROFILE IMAGE ---
router.post(
  "/profile-image",
  authenticateToken,
  upload.single("profileImage"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided." });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    try {
      await pool.query(
        "UPDATE users SET profile_image = $1 WHERE user_id = $2",
        [imageUrl, req.user.id]
      );
      res.json({ profile_image: imageUrl });
    } catch (err) {
      console.error("Error updating profile image:", err.message);
      res.status(500).json({ message: "Failed to update profile image." });
    }
  }
);

export default router;
