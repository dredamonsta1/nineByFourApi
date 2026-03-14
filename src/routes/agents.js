// routes/agents.js — Agent Gateway: identity & registration

import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateToken, authenticateAgent } from "../middleware.js";
import crypto from "crypto";

const router = Router();

/**
 * @route   POST /v1/agents/register
 * @desc    Register a new agent, linked to the authenticated human owner.
 *          Returns a one-time AGENT_SECRET (stored as SHA-256 hash — never retrievable again).
 * @access  Private (human JWT)
 */
router.post("/register", authenticateToken, async (req, res) => {
  const { name, manifest_url } = req.body;
  const ownerId = req.user.id;

  if (!name || !name.trim()) return res.status(400).json({ message: "Agent name is required." });
  if (!manifest_url) return res.status(400).json({ message: "manifest_url is required." });

  try { new URL(manifest_url); } catch {
    return res.status(400).json({ message: "manifest_url must be a valid URL." });
  }

  // Generate a random secret and store only its hash
  const secret = crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(secret).digest("hex");

  try {
    const result = await pool.query(
      `INSERT INTO agents (owner_id, name, manifest_url, agent_key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING agent_id, name, manifest_url, status, created_at`,
      [ownerId, name.trim(), manifest_url.trim(), keyHash]
    );
    res.status(201).json({
      ...result.rows[0],
      // Return plaintext key once — not stored, cannot be recovered
      AGENT_SECRET: secret,
      message: "Store this AGENT_SECRET securely. It will not be shown again.",
    });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Agent key collision — please retry." });
    console.error("Agent register error:", err);
    res.status(500).json({ message: "Failed to register agent." });
  }
});

/**
 * @route   GET /v1/agents/me
 * @desc    Health check — returns agent status and identity.
 * @access  Agent (X-Agent-Key)
 */
router.get("/me", authenticateAgent, async (req, res) => {
  const { agent_id, name, manifest_url, status, created_at, owner_id } = req.agent;
  res.json({ agent_id, name, manifest_url, status, created_at, owner_id });
});

/**
 * @route   GET /v1/agents — admin: list all agents
 * @access  Private (admin JWT)
 */
router.get("/", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only." });
  const result = await pool.query(
    `SELECT a.agent_id, a.name, a.manifest_url, a.status, a.created_at, u.username as owner
     FROM agents a JOIN users u ON a.owner_id = u.user_id
     ORDER BY a.created_at DESC`
  );
  res.json(result.rows);
});

/**
 * @route   PATCH /v1/agents/:id/status — admin: suspend / rate-limit / reactivate
 * @access  Private (admin JWT)
 */
router.patch("/:id/status", authenticateToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin only." });
  const { status } = req.body;
  const validStatuses = ["active", "rate_limited", "suspended"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${validStatuses.join(", ")}` });
  }
  const result = await pool.query(
    "UPDATE agents SET status = $1 WHERE agent_id = $2 RETURNING agent_id, name, status",
    [status, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ message: "Agent not found." });
  res.json(result.rows[0]);
});

export default router;
