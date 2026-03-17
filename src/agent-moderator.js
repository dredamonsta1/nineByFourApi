// src/agent-moderator.js
// Fire-and-forget content moderation using Claude Haiku.
// Called after a human text post is inserted — never blocks the HTTP response.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a content moderator for a music artist social platform.
Determine if the following post should be flagged for admin review.

FLAG for: spam, hate speech, harassment, threats, illegal content, explicit sexual content.
ALLOW: opinions, rap lyrics, profanity in artistic context, artist criticism, debates.

Respond with ONLY valid JSON — no markdown, no commentary:
{"status":"clean","reason":null}
or
{"status":"flagged","reason":"brief reason here"}`;

export async function moderatePost(pool, { postId, content }) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) return;

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      console.error('[moderator] non-JSON response:', text);
      return;
    }

    if (!['clean', 'flagged'].includes(result.status)) return;

    await pool.query(
      `UPDATE posts SET moderation_status = $1, moderation_reason = $2 WHERE post_id = $3`,
      [result.status, result.reason || null, postId]
    );

    if (result.status === 'flagged') {
      console.log(`[moderator] post ${postId} flagged: ${result.reason}`);
    }
  } catch (err) {
    console.error('[moderator] error:', err.message);
  }
}
