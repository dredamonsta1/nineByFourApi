// backend/connect.js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

// 1. Check if we are local
const isLocal =
  process.env.DATABASE_URL.includes("localhost") ||
  process.env.DATABASE_URL.includes("127.0.0.1");

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
const dbName = process.env.DATABASE_URL.split("/").pop();
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

      // Insert default setting (waitlist enabled)
      await pool.query(`
        INSERT INTO app_settings (setting_key, setting_value) 
        VALUES ('waitlist_enabled', 'true')
        ON CONFLICT (setting_key) DO NOTHING;
      `);

      console.log("Waitlist tables created/verified successfully.");
    } catch (err) {
      console.error("Error creating waitlist tables:", err.message);
      // Don't exit - let other tables still work
    }

    console.log(
      'Tables "users", "artists", "albums", "posts", and "waitlist" checked/created successfully.'
    );
  } catch (err) {
    console.error("Error creating tables:", err.message);
    process.exit(1); // Exit if table creation fails
  }
}

// Export the pool to be used throughout the application
export { pool };
