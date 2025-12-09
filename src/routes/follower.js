import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";

const router = Router();

// POST /api/users/:id/follow
// Action: The logged-in user follows the user specified by :id
router.post("/:id/follow", authenticateToken, async (req, res) => {
  const followerId = req.user.id; // From your JWT middleware
  const followingId = req.params.id;

  if (followerId == followingId) {
    return res.status(400).json({ message: "You cannot follow yourself." });
  }

  try {
    // The query automatically fails if the link already exists due to PRIMARY KEY
    await pool.query(
      "INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)",
      [followerId, followingId]
    );

    res.status(200).json({ message: "Followed successfully." });
  } catch (err) {
    if (err.code === "23505") {
      // Postgres error code for unique violation
      return res
        .status(400)
        .json({ message: "You are already following this user." });
    }
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// DELETE /api/users/:id/unfollow
// Action: The logged-in user unfollows the user specified by :id
router.delete("/:id/unfollow", authenticateToken, async (req, res) => {
  const followerId = req.user.id;
  const followingId = req.params.id;

  try {
    const result = await pool.query(
      "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2",
      [followerId, followingId]
    );

    if (result.rowCount === 0) {
      return res
        .status(400)
        .json({ message: "You were not following this user." });
    }

    res.status(200).json({ message: "Unfollowed successfully." });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// GET /api/users/:id/followers
// Returns a list of users who follow the target user
router.get("/:id/followers", async (req, res) => {
  try {
    const { id } = req.params;

    // We join 'follows' with 'users' to get the actual profile data of the follower
    const followers = await pool.query(
      `SELECT u.user_id, u.username, u.email 
       FROM users u 
       INNER JOIN follows f ON u.user_id = f.follower_id 
       WHERE f.following_id = $1`,
      [id]
    );

    res.json(followers.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// GET /api/users/:id/following
// Returns a list of users that the target user is following
router.get("/:id/following", async (req, res) => {
  try {
    const { id } = req.params;

    // This time we join on 'following_id' to see who they are chasing
    const following = await pool.query(
      `SELECT u.user_id, u.username, u.email 
       FROM users u 
       INNER JOIN follows f ON u.user_id = f.following_id 
       WHERE f.follower_id = $1`,
      [id]
    );

    res.json(following.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

export default router;
