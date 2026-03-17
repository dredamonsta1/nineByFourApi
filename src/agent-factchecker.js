// src/agent-factchecker.js
// Fire-and-forget fact-checking using Claude Sonnet.
// Checks verifiable claims in text posts, upserts agent_verifications,
// and posts a 🔍 comment on disputed posts as the 9by4News bot.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a fact-checker for a music artist social platform.

Only check verifiable factual claims such as: release dates, chart positions, award wins,
certifications (gold/platinum/diamond), biographical facts about real artists.
IGNORE: opinions, preferences, subjective statements, predictions, and anything unverifiable.

If there are no verifiable factual claims, return verdict "verified" with a neutral note.

Respond with ONLY valid JSON — no markdown, no commentary:
{"verdict":"verified","note":"brief note","comment":null}
or
{"verdict":"disputed","note":"what the claim got wrong","comment":"friendly explanation for the community (1-2 sentences)"}`;

export async function factCheckPost(pool, { postId, content }) {
  try {
    // Look up the 9by4News bot and 9by4FactChecker agent
    const [userResult, agentResult] = await Promise.all([
      pool.query(`SELECT user_id FROM users WHERE username = '9by4News' LIMIT 1`),
      pool.query(`SELECT agent_id FROM agents WHERE name = '9by4FactChecker' LIMIT 1`),
    ]);

    if (userResult.rows.length === 0 || agentResult.rows.length === 0) {
      console.warn('[factchecker] 9by4News bot or 9by4FactChecker agent not found — skipping');
      return;
    }

    const botUserId = userResult.rows[0].user_id;
    const agentId = agentResult.rows[0].agent_id;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) return;

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      console.error('[factchecker] non-JSON response:', text);
      return;
    }

    if (!['verified', 'disputed'].includes(result.verdict)) return;

    // Upsert verification record
    await pool.query(
      `INSERT INTO agent_verifications (post_type, post_id, verifier_agent_id, verdict, note)
       VALUES ('text', $1, $2, $3, $4)
       ON CONFLICT (post_type, post_id, verifier_agent_id)
       DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note`,
      [postId, agentId, result.verdict, result.note || null]
    );

    // Post a comment on disputed posts
    if (result.verdict === 'disputed' && result.comment) {
      await pool.query(
        `INSERT INTO post_comments (post_type, post_id, user_id, content)
         VALUES ('text', $1, $2, $3)`,
        [postId, botUserId, `🔍 Fact-check: ${result.comment}`]
      );
      console.log(`[factchecker] post ${postId} disputed: ${result.note}`);
    }
  } catch (err) {
    console.error('[factchecker] error:', err.message);
  }
}
