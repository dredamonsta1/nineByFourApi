import { Router } from "express";
import { pool } from "../connect.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleware.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// POST /api/users/register
router.post("/register", async (req, res) => {
  const { username, password, email, role } = req.body;

  if (!username || !password || !email) {
    return res
      .status(400)
      .json({ message: "Username, password, and email are required." });
  }

  try {
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
router.get("/profile", authenticateToken, (req, res) => {
  res.status(200).json({
    message: `Hello ${req.user.username}, this is your protected profile data!`,
    user: req.user,
    accessTime: new Date().toISOString(),
  });
});

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
    if (result.rowCount === 1) {
      res.status(200).json({
        message: `User ${user_id} was deleted.`,
      });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (err) {
    console.error("Error deleting user:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

export default router;
