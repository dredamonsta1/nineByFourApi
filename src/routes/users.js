// POST /api/users/register
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

router.post("/register", async (req, res) => {
  const { username, password, email, invite_code } = req.body;

  if (!username || !password || !email || !invite_code) {
    return res.status(400).json({ message: "All fields are required." });
  }

  // 1. SANITIZE IMMEDIATELY
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = invite_code.trim().toUpperCase();

  try {
    const waitlistActive = await isWaitlistEnabled();

    if (waitlistActive) {
      // 2. DEFENSIVE QUERY: Use TRIM to ignore database-level padding
      const waitlistCheck = await pool.query(
        "SELECT * FROM waitlist WHERE TRIM(email) = $1 AND TRIM(invite_code) = $2 AND status = 'approved'",
        [cleanEmail, cleanCode]
      );

      if (waitlistCheck.rows.length === 0) {
        // High-level log: Check Heroku logs to see exactly what failed
        console.error(
          `AUTH FAILURE: No match for [${cleanEmail}] with code [${cleanCode}]`
        );
        return res.status(403).json({
          message: "Invalid or unapproved invite code for this email.",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query("BEGIN");

    const userSql =
      "INSERT INTO users(username, password, email, role) VALUES ($1,$2,$3,$4) RETURNING user_id";
    const userResult = await pool.query(userSql, [
      username.trim(),
      hashedPassword,
      cleanEmail,
      "user",
    ]);

    if (waitlistActive) {
      await pool.query(
        "UPDATE waitlist SET status = 'registered', invite_code = NULL WHERE TRIM(email) = $1",
        [cleanEmail]
      );
    }

    await pool.query("COMMIT");

    // 3. LOGIC FLOW: Send the email in the background, don't wait for it to respond to the user
    res.status(201).json({
      message: "Welcome to 9by4!",
      userId: userResult.rows[0].user_id,
    });

    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || "9by4 <onboarding@resend.dev>",
        to: [cleanEmail],
        subject: "Welcome to 9by4, Creator!",
        html: `<h1>It's Official.</h1><p>Your account <strong>${username}</strong> is now active.</p>`,
      });
    } catch (emailErr) {
      console.error("Welcome email failed but user was created.");
    }
  } catch (error) {
    await pool.query("ROLLBACK");
    if (error.code === "23505")
      return res
        .status(409)
        .json({ message: "Username or email already exists." });
    res.status(500).json({ message: "Server error during registration." });
  }
});

export default router;
