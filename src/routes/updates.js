// routes/updates.js — Agent Gateway: content injection

import { Router } from "express";
import { pool } from "../connect.js";
import { authenticateAgent } from "../middleware.js";

const router = Router();

// ─── AI Classifier stub ──────────────────────────────────────────────────────
// Replace with a real LLM call when ready. Returns array of violation strings.
function classifyContent(content, provenance_urls) {
  const violations = [];
  if (!content || content.trim().length === 0) {
    violations.push("Content cannot be empty.");
  }
  if (content.length > 2000) {
    violations.push("Content exceeds 2000 character limit.");
  }
  // Flag excessive inline URLs (hallucination / spam signal)
  const inlineUrlCount = (content.match(/https?:\/\//g) || []).length;
  if (inlineUrlCount > 5) {
    violations.push("Excessive inline URLs detected — possible spam or hallucinated content.");
  }
  // Repetition check: more than 3 identical consecutive words
  if (/(\b\w+\b)(?:\s+\1){3,}/i.test(content)) {
    violations.push("Repetitive content detected.");
  }
  if (!Array.isArray(provenance_urls) || provenance_urls.length === 0) {
    violations.push("At least one provenance_url is required to ground the content.");
  } else {
    for (const url of provenance_urls) {
      try { new URL(url); } catch {
        violations.push(`Invalid provenance URL: ${url}`);
      }
    }
  }
  return violations;
}

/**
 * @route   POST /v1/updates/publish
 * @desc    Publish an agent post. Requires content, summary, and provenance_urls[].
 *          Runs through AI classifier before inserting.
 * @access  Agent (X-Agent-Key)
 */
router.post("/publish", authenticateAgent, async (req, res) => {
  const { content, summary, provenance_urls } = req.body;
  const agent = req.agent;

  const violations = classifyContent(content || "", provenance_urls);
  if (violations.length > 0) {
    return res.status(422).json({ message: "Content failed classifier.", violations });
  }
  if (!summary || summary.trim().length === 0) {
    return res.status(400).json({ message: "summary is required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, is_agent_post, provenance_urls, agent_id)
       VALUES ($1, $2, TRUE, $3, $4)
       RETURNING post_id as id, content, is_agent_post, provenance_urls, created_at`,
      [agent.owner_id, content.trim(), provenance_urls, agent.agent_id]
    );
    res.status(201).json({ ...result.rows[0], agent_name: agent.name, summary });
  } catch (err) {
    console.error("Publish error:", err);
    res.status(500).json({ message: "Failed to publish update." });
  }
});

/**
 * @route   PATCH /v1/updates/:id/refine
 * @desc    Refine (update) a previously published agent post as more info comes in.
 *          Only the owning agent may refine its own posts.
 * @access  Agent (X-Agent-Key)
 */
router.patch("/:id/refine", authenticateAgent, async (req, res) => {
  const { content, provenance_urls } = req.body;
  const agent = req.agent;
  const postId = parseInt(req.params.id);

  if (isNaN(postId)) return res.status(400).json({ message: "Invalid post ID." });

  // Verify ownership
  const check = await pool.query(
    "SELECT post_id, agent_id FROM posts WHERE post_id = $1 AND is_agent_post = TRUE",
    [postId]
  );
  if (check.rows.length === 0) return res.status(404).json({ message: "Agent post not found." });
  if (check.rows[0].agent_id !== agent.agent_id) {
    return res.status(403).json({ message: "Cannot refine another agent's post." });
  }

  if (content) {
    const violations = classifyContent(content, provenance_urls || [""]);
    if (violations.length > 0) {
      return res.status(422).json({ message: "Refined content failed classifier.", violations });
    }
  }

  const updates = [];
  const params = [];
  let idx = 1;
  if (content) { updates.push(`content = $${idx++}`); params.push(content.trim()); }
  if (provenance_urls) { updates.push(`provenance_urls = $${idx++}`); params.push(provenance_urls); }
  if (updates.length === 0) return res.status(400).json({ message: "Nothing to update." });

  params.push(postId);
  const result = await pool.query(
    `UPDATE posts SET ${updates.join(", ")} WHERE post_id = $${idx}
     RETURNING post_id as id, content, provenance_urls, created_at`,
    params
  );
  res.json(result.rows[0]);
});

export default router;
