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

// src/routes/users.js

router.post("/register", async (req, res) => {
  const { username, password, email, invite_code } = req.body;

  // 1. Sanitize
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = invite_code.trim().toUpperCase();

  try {
    // 2. Database Handshake
    const waitlistCheck = await pool.query(
      "SELECT * FROM waitlist WHERE TRIM(email) = $1 AND TRIM(invite_code) = $2 AND status = 'approved'",
      [cleanEmail, cleanCode]
    );

    if (waitlistCheck.rows.length === 0) {
      return res
        .status(403)
        .json({ message: "Invalid or unapproved invite code." });
    }

    // 3. Begin Atomic Transaction
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

    // 4. THE ONLY RESPONSE: Send this immediately to the frontend
    res.status(201).json({
      message: "Creator account created successfully!",
      userId: userResult.rows[0].user_id,
    });

    // 5. SIDE EFFECT: Handle email separately so it doesn't block or crash the user
    try {
      if (process.env.RESEND_API_KEY) {
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "onboarding@resend.dev",
          to: [cleanEmail],
          subject: "Welcome to 9by4!",
          html: `<h1>Welcome, ${username}!</h1><p>Your creator account is active.</p>`,
        });
      }
    } catch (emailErr) {
      console.error("Welcome email failed, but user registration succeeded.");
    }
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("CRITICAL REGISTRATION ERROR:", error.message);
    if (error.code === "23505")
      return res.status(409).json({ message: "Username/Email exists." });
    res
      .status(500)
      .json({ message: "Internal server error during registration." });
  }
});
export default router;
