// src/agent-poster.js
// Fetches hip-hop/music news from RSS feeds and posts them to the feed
// as bot-generated content attributed to the 9by4News agent user.
//
// Usage: node src/agent-poster.js
// Flags: --dry-run  (preview only, no DB writes)
//
// Can also be imported and called as runAgentPoster(pool) from the server.

import pg from "pg";
import Parser from "rss-parser";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const MAX_NEW_POSTS = 5;
const MIN_GAP_HOURS = 2;

const RSS_FEEDS = [
  { name: "HipHopDX",  url: "https://hiphopdx.com/rss/news.xml" },
  { name: "AllHipHop",  url: "https://allhiphop.com/feed/" },
  { name: "XXL",        url: "https://www.xxlmag.com/feed/" },
  { name: "Uproxx",     url: "https://uproxx.com/music/feed/" },
];

const parser = new Parser({ timeout: 10000 });

async function ensureSchema(pool) {
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_agent_post BOOLEAN DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_url TEXT;`);
  await pool.query(`
    INSERT INTO users (username, email, password, role)
    VALUES ('9by4News', 'bot@9by4.internal', 'NOT_A_REAL_PASSWORD', 'agent')
    ON CONFLICT (username) DO NOTHING;
  `);
}

async function getBotUserId(pool) {
  const result = await pool.query(
    "SELECT user_id FROM users WHERE username = '9by4News' LIMIT 1"
  );
  if (result.rows.length === 0) {
    throw new Error("Bot user '9by4News' not found. Run the server once to create it via migrations.");
  }
  return result.rows[0].user_id;
}

async function getLastAgentPostTime(pool) {
  const result = await pool.query(
    "SELECT MAX(created_at) as last_post FROM posts WHERE is_agent_post = TRUE"
  );
  return result.rows[0].last_post || null;
}

async function isUrlAlreadyPosted(pool, sourceUrl) {
  const result = await pool.query(
    "SELECT 1 FROM posts WHERE source_url = $1 LIMIT 1",
    [sourceUrl]
  );
  return result.rows.length > 0;
}

async function fetchFeedArticles(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return (parsed.items || []).map((item) => ({
      title: item.title?.trim() || "",
      summary: (item.contentSnippet || item.summary || "").trim().slice(0, 500),
      sourceUrl: item.link || item.guid || "",
      source: feed.name,
    })).filter((a) => a.title && a.sourceUrl);
  } catch (err) {
    console.warn(`[${feed.name}] Failed to fetch RSS: ${err.message}`);
    return [];
  }
}

// Core logic — accepts a shared pool, returns number of posts created.
export async function runAgentPoster(pool, { dryRun = false } = {}) {
  console.log(`\n9by4 Agent Poster${dryRun ? " [DRY RUN]" : ""}`);
  console.log("=".repeat(40));

  // Check minimum gap between agent posts
  const lastPostTime = await getLastAgentPostTime(pool);
  if (lastPostTime) {
    const hoursSinceLast = (Date.now() - new Date(lastPostTime).getTime()) / 3600000;
    if (hoursSinceLast < MIN_GAP_HOURS) {
      const remaining = (MIN_GAP_HOURS - hoursSinceLast).toFixed(1);
      console.log(`Last agent post was ${hoursSinceLast.toFixed(1)}h ago. Min gap is ${MIN_GAP_HOURS}h. Skipping (${remaining}h remaining).`);
      return 0;
    }
  }

  const botUserId = await getBotUserId(pool);
  console.log(`Bot user_id: ${botUserId}`);

  const feedResults = await Promise.all(RSS_FEEDS.map(fetchFeedArticles));
  const allArticles = feedResults.flat();
  console.log(`Fetched ${allArticles.length} total articles across ${RSS_FEEDS.length} feeds.`);

  let posted = 0;

  for (const article of allArticles) {
    if (posted >= MAX_NEW_POSTS) break;

    const alreadyPosted = await isUrlAlreadyPosted(pool, article.sourceUrl);
    if (alreadyPosted) {
      console.log(`  [SKIP] Already posted: ${article.title.slice(0, 60)}`);
      continue;
    }

    const content = article.summary
      ? `${article.title}\n\n${article.summary}`
      : article.title;

    if (dryRun) {
      console.log(`  [DRY RUN] Would post (${article.source}): ${article.title.slice(0, 70)}`);
      console.log(`            source_url: ${article.sourceUrl}`);
      posted++;
      continue;
    }

    await pool.query(
      `INSERT INTO posts (user_id, content, is_agent_post, source_url)
       VALUES ($1, $2, TRUE, $3)`,
      [botUserId, content, article.sourceUrl]
    );
    console.log(`  [POSTED] (${article.source}): ${article.title.slice(0, 70)}`);
    posted++;
  }

  console.log(`\nDone. ${posted} post(s) ${dryRun ? "would be" : "were"} created.`);
  return posted;
}

// Standalone CLI entrypoint
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const DRY_RUN = process.argv.includes("--dry-run");
  const { Pool } = pg;
  const isLocal =
    process.env.DATABASE_URL?.includes("localhost") ||
    process.env.DATABASE_URL?.includes("127.0.0.1");

  const standalonePool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  ensureSchema(standalonePool)
    .then(() => runAgentPoster(standalonePool, { dryRun: DRY_RUN }))
    .then(() => standalonePool.end())
    .catch((err) => {
      console.error("Agent poster error:", err);
      standalonePool.end();
      process.exit(1);
    });
}
