// backend/connect.js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

const { Pool } = pg;

// Database connection configuration for PostgreSQL
// These values will be read from your .env file or Docker environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432, // Default PostgreSQL port
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false, // For Heroku/Cloud providers, might need SSL
});

// Test the connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database!");
});

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

    console.log(
      'Tables "users", "artists", "albums", and "posts" checked/created successfully.'
    );
  } catch (err) {
    console.error("Error creating tables:", err.message);
    process.exit(1); // Exit if table creation fails
  }
}

// Export the pool to be used throughout the application
export { pool };
