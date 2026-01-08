//
import { Router } from "express";
import { pool } from "../connect.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleware.js";
import { isWaitlistEnabled } from "./waitlist.js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// POST /api/users/register
router.post("/register", async (req, res) => {
  const { username, password, email, invite_code } = req.body;

  if (!username || !password || !email) {
    return res
      .status(400)
      .json({ message: "Username, password, and email are required." });
  }

  try {
    const waitlistActive = await isWaitlistEnabled();

    if (waitlistActive) {
      if (!invite_code) {
        return res.status(403).json({
          error: "Registration is currently invite-only",
          waitlist_enabled: true,
          message: "Please join our waitlist to get an invite code",
        });
      }

      // Verify invite code matches this specific email
      const waitlistCheck = await pool.query(
        "SELECT * FROM waitlist WHERE email = $1 AND invite_code = $2 AND status = 'approved'",
        [email, invite_code]
      );

      if (waitlistCheck.rows.length === 0) {
        return res.status(403).json({
          message: "Invalid or unapproved invite code for this email.",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Begin Transaction to ensure both user creation and waitlist update happen together
    await pool.query("BEGIN");

    const userSql =
      "INSERT INTO users(username, password, email, role) VALUES ($1,$2,$3,$4) RETURNING user_id";
    const userResult = await pool.query(userSql, [
      username,
      hashedPassword,
      email,
      "user",
    ]);

    if (waitlistActive) {
      await pool.query(
        "UPDATE waitlist SET status = 'registered', invite_code = NULL WHERE email = $1",
        [email]
      );
    }

    await pool.query("COMMIT");

    res.status(201).json({
      message: "Creator account created successfully!",
      userId: userResult.rows[0].user_id,
    });
    // --- NEW: SEND WELCOME EMAIL ---
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || "9by4 <onboarding@resend.dev>",
        to: [email.toLowerCase()],
        subject: "Welcome to 9by4, Creator!",
        html: `
          <div style="font-family: sans-serif; color: #111;">
            <h1>It's Official.</h1>
            <p>Your account <strong>${username}</strong> is now active.</p>
            <p>You can now start posting to the image feed and connecting with other creators.</p>
            <a href="https://your-app-url.com/login" 
               style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px;">
               Enter the Dashboard
            </a>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error(
        "Welcome email failed to send, but user was created:",
        emailErr.message
      );
    }

    return res.status(201).json({ message: "Welcome to 9by4!" });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Registration Error:", error.message);
    if (error.code === "23505")
      return res
        .status(409)
        .json({ message: "Username or email already exists." });
    res.status(500).json({ message: "Server error during registration." });
  }
});

// POST /api/users/login (Removed email requirement here)
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      token,
      user: { id: user.user_id, username: user.username, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error during login." });
  }
});

export default router;
