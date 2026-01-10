// src/routes/users.js

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

// router.post("/register", async (req, res) => {
//   const { username, password, email, invite_code } = req.body;

//   // 1. Sanitize
//   const cleanEmail = email.trim().toLowerCase();
//   const cleanCode = invite_code.trim().toUpperCase();

//   try {
//     // 2. Database Handshake
//     const waitlistCheck = await pool.query(
//       "SELECT * FROM waitlist WHERE TRIM(email) = $1 AND TRIM(invite_code) = $2 AND status = 'approved'",
//       [cleanEmail, cleanCode]
//     );

//     if (waitlistCheck.rows.length === 0) {
//       return res
//         .status(403)
//         .json({ message: "Invalid or unapproved invite code." });
//     }

//     // 3. Begin Atomic Transaction
//     const hashedPassword = await bcrypt.hash(password, 10);
//     await pool.query("BEGIN");

//     const userResult = await pool.query(
//       "INSERT INTO users(username, password, email, role) VALUES ($1,$2,$3,$4) RETURNING user_id",
//       [username.trim(), hashedPassword, cleanEmail, "user"]
//     );

//     await pool.query(
//       "UPDATE waitlist SET status = 'registered', invite_code = NULL WHERE TRIM(email) = $1",
//       [cleanEmail]
//     );

//     await pool.query("COMMIT");

//     // 4. THE ONLY RESPONSE: Send this immediately to the frontend
//     res.status(201).json({
//       message: "Creator account created successfully!",
//       userId: userResult.rows[0].user_id,
//     });

//     // 5. SIDE EFFECT: Handle email separately so it doesn't block or crash the user
//     try {
//       if (process.env.RESEND_API_KEY) {
//         await resend.emails.send({
//           from: process.env.FROM_EMAIL || "onboarding@resend.dev",
//           to: [cleanEmail],
//           subject: "Welcome to 9by4!",
//           html: `<h1>Welcome, ${username}!</h1><p>Your creator account is active.</p>`,
//         });
//       }
//     } catch (emailErr) {
//       console.error("Welcome email failed, but user registration succeeded.");
//     }
//   } catch (error) {
//     await pool.query("ROLLBACK");
//     console.error("CRITICAL REGISTRATION ERROR:", error.message);
//     if (error.code === "23505")
//       return res.status(409).json({ message: "Username/Email exists." });
//     res
//       .status(500)
//       .json({ message: "Internal server error during registration." });
//   }
//   // POST /api/users/login
//   router.post("/login", async (req, res) => {
//     const { username, password } = req.body;

//     // 1. Validation
//     if (!username || !password) {
//       return res
//         .status(400)
//         .json({ message: "Username and password are required." });
//     }

//     try {
//       // 2. Fetch User - Use TRIM() here too to stay consistent with your registration cleanup
//       const result = await pool.query(
//         "SELECT * FROM users WHERE TRIM(username) = $1",
//         [username.trim()]
//       );
//       const user = result.rows[0];

//       // 3. Verify existence and password
//       if (!user) {
//         return res
//           .status(401)
//           .json({ message: "Invalid username or password." });
//       }

//       const isMatch = await bcrypt.compare(password, user.password);
//       if (!isMatch) {
//         return res
//           .status(401)
//           .json({ message: "Invalid username or password." });
//       }

//       // 4. Generate JWT
//       const token = jwt.sign(
//         { id: user.user_id, username: user.username, role: user.role },
//         JWT_SECRET,
//         { expiresIn: "24h" } // Increased to 24h so you don't get kicked out while testing
//       );

//       // 5. Send Response
//       res.status(200).json({
//         message: `Welcome back, ${user.username}!`,
//         token,
//         user: { id: user.user_id, username: user.username, role: user.role },
//       });
//     } catch (error) {
//       console.error("Login Error:", error.message);
//       res.status(500).json({ message: "Server error during login." });
//     }
//   });
// });

// src/routes/users.js

// ... imports and setup ...

// 1. REGISTER ROUTE (Top Level)
router.post("/register", async (req, res) => {
  const { username, password, email, invite_code } = req.body;
  // ... all your register logic ...
  try {
    // ...
    await pool.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Creator account created successfully!" });
  } catch (error) {
    // ...
    return res.status(500).json({ message: "Server error" });
  }
}); // <--- ENSURE THIS CLOSES THE REGISTER ROUTE COMPLETELY

// 2. LOGIN ROUTE (Top Level)
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

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

    return res.status(200).json({
      message: `Welcome back, ${user.username}!`,
      token,
      user: { id: user.user_id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    return res.status(500).json({ message: "Server error during login." });
  }
});

export default router;
// export default router;
