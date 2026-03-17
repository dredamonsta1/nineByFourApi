// backend/connect.js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

// 1. Check if we are local
const isLocal =
  process.env.DATABASE_URL?.includes("localhost") ||
  process.env.DATABASE_URL?.includes("127.0.0.1");

const { Pool } = pg;

// Use DATABASE_URL in production (Heroku), otherwise use local config
const connectionOptions = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal
        ? false
        : {
            rejectUnauthorized: false, // Required for Heroku connections
          },
    }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT || 5432,
    };

const pool = new Pool(connectionOptions);

// Test the connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database!");
});
//********************   */
pool.on("connect", () => {
  console.log("Database connected!");
});
const dbName = process.env.DATABASE_URL?.split("/").pop() ?? "unknown";
console.log("---------------------");
console.log("🚨 APP IS CONNECTED TO DATABASE:", dbName);
console.log("---------------------");
//********************   */
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1); // Exit process if database connection has a fatal error
});

// --- Initial Schema Setup (Example - you might use migrations for this in production) ---
// This function will create tables if they don't exist
export async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS artists (
        artist_id SERIAL PRIMARY KEY,
        artist_name VARCHAR(255) UNIQUE NOT NULL,
        aka VARCHAR(255),
        genre VARCHAR(100),
        count INTEGER DEFAULT 0,
        state VARCHAR(100),
        region VARCHAR(100),
        label VARCHAR(255),
        image_url VARCHAR(255)
      );
    `);
    await pool.query(`
  CREATE TABLE IF NOT EXISTS user_profile_artists (
    user_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, artist_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE
  );
`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS albums (
        album_id SERIAL PRIMARY KEY,
        artist_id INTEGER NOT NULL,
        album_name VARCHAR(255) NOT NULL,
        year INTEGER,
        certifications TEXT,
        FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE
      );
    `);

    // Migrations: add album_image_url, widen image_url, add profile_image
    try {
      await pool.query(`ALTER TABLE albums ADD COLUMN IF NOT EXISTS album_image_url TEXT;`);
      await pool.query(`ALTER TABLE artists ALTER COLUMN image_url TYPE TEXT;`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;`);
      console.log("Image columns verified.");
    } catch (migErr) {
      console.log("Migration note:", migErr.message);
    }

    // Migrations: agent post columns
    try {
      await pool.query(`ALTER TABLE posts       ADD COLUMN IF NOT EXISTS is_agent_post BOOLEAN DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE posts       ADD COLUMN IF NOT EXISTS source_url TEXT;`);
      await pool.query(`ALTER TABLE image_posts ADD COLUMN IF NOT EXISTS is_agent_post BOOLEAN DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE image_posts ADD COLUMN IF NOT EXISTS source_url TEXT;`);
      await pool.query(`ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS is_agent_post BOOLEAN DEFAULT FALSE;`);
      await pool.query(`ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS source_url TEXT;`);
      console.log("Agent post columns verified.");
    } catch (migErr) {
      console.log("Agent post migration note:", migErr.message);
    }

    // Artist indexes for pagination & search performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(artist_name);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_artists_genre ON artists(genre);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_artists_state ON artists(state);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_artists_count ON artists(count DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums(artist_id);`);

    // Trigram index for ILIKE search (requires pg_trgm extension)
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON artists USING gin(artist_name gin_trgm_ops);`);
    } catch (trgmErr) {
      console.log("pg_trgm extension not available, skipping trigram index:", trgmErr.message);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        post_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );
    `);

    await pool.query(`
  CREATE TABLE IF NOT EXISTS image_posts (
    post_id SERIAL PRIMARY KEY,
    image_url VARCHAR(255) NOT NULL,
    caption TEXT,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );
`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        video_url VARCHAR(512) NOT NULL,
        video_type VARCHAR(20) NOT NULL DEFAULT 'upload',
        caption TEXT,
        thumbnail_url VARCHAR(512),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );
    `);

    // === WAITLIST TABLES ===
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS waitlist (
          waitlist_id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          full_name VARCHAR(255),
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'registered')),
          invite_code VARCHAR(50) UNIQUE,
          requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          approved_at TIMESTAMP WITH TIME ZONE,
          approved_by INTEGER,
          notes TEXT,
          FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL
        );
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_waitlist_invite_code ON waitlist(invite_code);
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          setting_id SERIAL PRIMARY KEY,
          setting_key VARCHAR(100) UNIQUE NOT NULL,
          setting_value VARCHAR(255) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Insert default settings
      const defaultSettings = [
        ['waitlist_enabled', 'true'],
        ['agent_posts_enabled', 'true'],
        ['agent_penalty_hours', '2'],
        ['feed_limit', '50'],
      ];
      for (const [key, value] of defaultSettings) {
        await pool.query(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO NOTHING`,
          [key, value]
        );
      }

      console.log("Waitlist tables created/verified successfully.");
    } catch (err) {
      console.error("Error creating waitlist tables:", err.message);
      // Don't exit - let other tables still work
    }

    // Bot user for agent posts
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';`);
    } catch (_) { /* column may already exist */ }
    await pool.query(`
      INSERT INTO users (username, email, password, role)
      VALUES ('9by4News', 'bot@9by4.internal', 'NOT_A_REAL_PASSWORD', 'agent')
      ON CONFLICT (username) DO NOTHING;
    `);

    // === FOLLOWS TABLE (required by follower.js routes) ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follower_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        following_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (follower_id, following_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);`);

    // === DM TABLES ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id SERIAL PRIMARY KEY,
        user_one INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        user_two INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_one, user_two),
        CHECK (user_one < user_two)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user_one ON conversations(user_one);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user_two ON conversations(user_two);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, is_read) WHERE is_read = FALSE;`);

    // === AWARDS TABLE ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS awards (
        award_id SERIAL PRIMARY KEY,
        artist_id INTEGER NOT NULL,
        award_name VARCHAR(255) NOT NULL,
        show VARCHAR(255),
        category VARCHAR(255),
        year INTEGER,
        FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_awards_artist_id ON awards(artist_id);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS post_comments (
        comment_id SERIAL PRIMARY KEY,
        post_type VARCHAR(10) NOT NULL CHECK (post_type IN ('text', 'image', 'video')),
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_type, post_id);`);

    // Music posts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS music_posts (
        post_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR(255),
        audio_url TEXT,
        stream_url TEXT,
        platform VARCHAR(50),
        caption TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Events
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        event_id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        event_date DATE NOT NULL,
        event_time TIME,
        venue VARCHAR(255),
        city VARCHAR(255),
        flyer_url TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date ASC);`);

    // Live Rooms
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id SERIAL PRIMARY KEY,
        host_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
        livekit_room_name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMPTZ
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_id);`);

    // Agent Gateway
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        manifest_url TEXT NOT NULL,
        agent_key_hash TEXT UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rate_limited', 'suspended')),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_key ON agents(agent_key_hash);`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_verifications (
        verification_id SERIAL PRIMARY KEY,
        post_type VARCHAR(20) NOT NULL,
        post_id INTEGER NOT NULL,
        verifier_agent_id INTEGER NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
        verdict VARCHAR(20) NOT NULL CHECK (verdict IN ('verified', 'disputed')),
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_type, post_id, verifier_agent_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_verifications_post ON agent_verifications(post_type, post_id);`);

    // Agent gateway migrations: provenance_urls + agent_id on post tables
    try {
      await pool.query(`ALTER TABLE posts       ADD COLUMN IF NOT EXISTS provenance_urls TEXT[];`);
      await pool.query(`ALTER TABLE posts       ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(agent_id);`);
      await pool.query(`ALTER TABLE image_posts ADD COLUMN IF NOT EXISTS provenance_urls TEXT[];`);
      await pool.query(`ALTER TABLE image_posts ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(agent_id);`);
      await pool.query(`ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS provenance_urls TEXT[];`);
      await pool.query(`ALTER TABLE video_posts ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(agent_id);`);
      console.log("Agent gateway columns verified.");
    } catch (migErr) {
      console.log("Agent gateway migration note:", migErr.message);
    }

    // Stripe / creator-tier migrations
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_tier VARCHAR(20) DEFAULT 'free';`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_type VARCHAR(20);`);
      console.log("Creator tier columns verified.");
    } catch (migErr) {
      console.log("Creator tier migration note:", migErr.message);
    }

    // Moderation migrations
    try {
      await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'clean';`);
      await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_reason TEXT;`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_moderation ON posts(moderation_status) WHERE moderation_status = 'flagged';`);
      console.log("Moderation columns verified.");
    } catch (migErr) {
      console.log("Moderation migration note:", migErr.message);
    }

    // Seed internal fact-checker agent (owned by 9by4News bot)
    try {
      await pool.query(`
        INSERT INTO agents (owner_id, name, manifest_url, agent_key_hash, status)
        SELECT u.user_id, '9by4FactChecker', 'https://vedioz.netlify.app/agents/factchecker',
               'internal-system-agent', 'active'
        FROM users u WHERE u.username = '9by4News'
        ON CONFLICT (agent_key_hash) DO NOTHING;
      `);
      console.log("9by4FactChecker agent seeded.");
    } catch (migErr) {
      console.log("FactChecker agent seed note:", migErr.message);
    }

    console.log(
      'Tables "users", "artists", "albums", "posts", "waitlist", "follows", "conversations", "messages", "awards", "music_posts", "events", "rooms", "agents", and "agent_verifications" checked/created successfully.'
    );
  } catch (err) {
    console.error("Error creating tables:", err.message);
    process.exit(1); // Exit if table creation fails
  }
}

// Export the pool to be used throughout the application
export { pool };
