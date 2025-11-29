import { Router } from "express";
import { pool } from "../connect.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleware.js";
import { isWaitlistEnabled } from "./waitlist.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// POST /api/users/register
router.post("/register", async (req, res) => {
  const { username, password, email, role, invite_code } = req.body;

  if (!username || !password || !email) {
    return res
      .status(400)
      .json({ message: "Username, password, and email are required." });
  }

  try {
    // ===== NEW: Check if waitlist is enabled =====
    const waitlistActive = await isWaitlistEnabled();

    if (waitlistActive) {
      // Require invite code when waitlist is active
      if (!invite_code) {
        return res.status(403).json({
          error: "Registration is currently invite-only",
          waitlist_enabled: true,
          message: "Please join our waitlist to get an invite code",
        });
      }

      // Verify invite code matches this email
      const waitlistResult = await pool.query(
        `SELECT waitlist_id, email, status 
         FROM waitlist 
         WHERE invite_code = $1 AND status = $2 AND email = $3`,
        [invite_code, "approved", email]
      );

      if (waitlistResult.rows.length === 0) {
        return res.status(403).json({
          error: "Invalid invite code or email mismatch",
          waitlist_enabled: true,
          message: "Please use the email associated with your invite code",
        });
      }
    }
    // ===== END NEW CODE =====

    const hashedPassword = await bcrypt.hash(password, 10);
    const sql =
      "INSERT INTO users(username, password, email, role) VALUES ($1,$2,$3,$4) RETURNING user_id";
    const result = await pool.query(sql, [
      username,
      hashedPassword,
      email,
      role || "user",
    ]);
    const newUserId = result.rows[0].user_id;

    // ===== NEW: Mark invite code as used =====
    if (waitlistActive && invite_code) {
      await pool.query(
        `UPDATE waitlist 
         SET invite_code = NULL, 
             notes = COALESCE(notes || ' - ', '') || 'Used by user on ' || NOW()::TEXT
         WHERE invite_code = $1`,
        [invite_code]
      );
    }
    // ===== END NEW CODE =====

    res.status(201).json({
      message: "User registered successfully!",
      userId: newUserId,
    });
  } catch (error) {
    console.error("Error during user registration:", error.message);
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "Username or email already exists." });
    }
    res.status(500).json({ message: "Server error during registration." });
  }
});

// POST /api/users/register
// router.post("/register", async (req, res) => {
//   const { username, password, email, role } = req.body;

//   if (!username || !password || !email) {
//     return res
//       .status(400)
//       .json({ message: "Username, password, and email are required." });
//   }

//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const sql =
//       "INSERT INTO users(username, password, email, role) VALUES ($1,$2,$3,$4) RETURNING user_id";
//     const result = await pool.query(sql, [
//       username,
//       hashedPassword,
//       email,
//       role || "user",
//     ]);
//     const newUserId = result.rows[0].user_id;

//     res.status(201).json({
//       message: "User registered successfully!",
//       userId: newUserId,
//     });
//   } catch (error) {
//     console.error("Error during user registration:", error.message);
//     if (error.code === "23505") {
//       return res
//         .status(409)
//         .json({ message: "Username or email already exists." });
//     }
//     res.status(500).json({ message: "Server error during registration." });
//   }
// });

// POST /api/users/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

  const sql = "SELECT * FROM users WHERE username = $1";
  try {
    const result = await pool.query(sql, [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: `Welcome back, ${user.username}!`,
      token: token,
      user: { id: user.user_id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).json({ message: "Server error during login." });
  }
});

// GET /api/users/profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const sql =
      "SELECT user_id, username, email, role FROM users WHERE user_id = $1";
    const result = await pool.query(sql, [req.user.id]);

    if (result.rowCount === 0) {
      // This case is unlikely if the token is valid, but good to handle.
      return res.status(404).json({ message: "User not found." });
    }

    const userProfile = result.rows[0];
    res.status(200).json({
      message: `Hello ${userProfile.username}, this is your protected profile data!`,
      user: userProfile,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error.message);
    res.status(500).json({ message: "Server error while fetching profile." });
  }
});

// PUT /api/users/:user_id (to update user details)
router.put("/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;
  const requestingUser = req.user;
  const { email, role, password } = req.body;

  // Security check: Allow if the user is an 'admin' OR if they are updating their own account.
  if (
    requestingUser.role !== "admin" &&
    requestingUser.id.toString() !== user_id
  ) {
    return res.status(403).json({ message: "Permission denied." });
  }

  // Prevent non-admins from changing roles.
  if (role && requestingUser.role !== "admin") {
    return res
      .status(403)
      .json({ message: "You are not authorized to change user roles." });
  }

  const fieldsToUpdate = [];
  const values = [];
  let queryIndex = 1;

  if (email) {
    fieldsToUpdate.push(`email = $${queryIndex++}`);
    values.push(email);
  }
  if (role && requestingUser.role === "admin") {
    fieldsToUpdate.push(`role = $${queryIndex++}`);
    values.push(role);
  }
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    fieldsToUpdate.push(`password = $${queryIndex++}`);
    values.push(hashedPassword);
  }

  if (fieldsToUpdate.length === 0) {
    return res
      .status(400)
      .json({ message: "No valid fields provided for update." });
  }

  values.push(user_id);
  const sql = `UPDATE users SET ${fieldsToUpdate.join(
    ", "
  )} WHERE user_id = $${queryIndex} RETURNING user_id, username, email, role`;

  try {
    const result = await pool.query(sql, values);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `User with ID ${user_id} not found.` });
    }
    res.status(200).json({
      message: `User ${user_id} updated successfully.`,
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating user:", err.message);
    if (err.code === "23505") {
      return res.status(409).json({ message: "Email already in use." });
    }
    res
      .status(500)
      .json({ message: "Failed to update user.", error: err.message });
  }
});

// POST /api/users/register-admin
// USE THIS ONCE, THEN DELETE THE ROUTE OR PROTECT IT
// router.post("/register-admin", async (req, res) => {
// 1. EXTRACT EMAIL FROM BODY
// const { username, password, email } = req.body;

//   if (!username || !password || !email) {
//     return res
//       .status(400)
//       .json({ message: "Username, email, and password required" });
//   }

//   try {
//     const userCheck = await pool.query(
//       "SELECT * FROM users WHERE username = $1",
//       [username]
//     );
//     if (userCheck.rows.length > 0) {
//       return res.status(400).json({ message: "User already exists" });
//     }

//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(password, salt);

//     // 2. UPDATE SQL TO INSERT EMAIL
//     const newUser = await pool.query(
//       "INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING user_id, username, role",
//       [username, email, hashedPassword, "admin"]
//     );

//     res.status(201).json(newUser.rows[0]);
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).send("Server Error");
//   }
// });

// GET /api/users
router.get("/", authenticateToken, async (req, res) => {
  // Security check: Only allow users with the 'admin' role to view all users.
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Permission denied. Admin role required." });
  }

  const sql = "SELECT user_id, username, email, role FROM users";
  try {
    const result = await pool.query(sql);
    res.json({ users: result.rows });
  } catch (err) {
    console.error("Error fetching users:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

// DELETE /api/users/:user_id
router.delete("/:user_id", authenticateToken, async (req, res) => {
  const { user_id } = req.params;
  const requestingUser = req.user;

  // Security check:
  // Allow if the user is an 'admin' OR if the user is deleting their own account.
  if (
    requestingUser.role !== "admin" &&
    requestingUser.id.toString() !== user_id
  ) {
    return res.status(403).json({ message: "Permission denied." });
  }

  const sql = "DELETE FROM users WHERE user_id = $1";
  try {
    const result = await pool.query(sql, [user_id]);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `User with ID ${user_id} not found.` });
    }
    res.status(200).json({ message: `User ${user_id} was deleted.` });
  } catch (err) {
    console.error("Error deleting user:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

export default router;
