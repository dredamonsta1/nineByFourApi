// import sqlite3 from "sqlite3";
// const sql3 = sqlite3.verbose();
// // import cors from "cors";

// // app.use(cors());
// // const DB = new sqlite3.Database(':memory', sqlite3.OPEN_READWRITE, connected);
// // const DB = new sqlite3.Database('', sqlite3.OPEN_READWRITE, connected);

// const DB = new sql3.Database(
//   "./artist.db",
//   sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
//   connected
// );

// const DB2 = new sql3.Database(
//   "./user.db",
//   sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
//   connected
// );

// const DB3 = new sql3.Database(
//   "./posts.db",
//   sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
//   connected
// );

// function connected(err) {
//   if (err) {
//     console.error("Error connecting to SQLite DB:", err.message);
//     // You might want to add process.exit(1) here in a real application
//     // if a database connection failure is critical.
//     return;
//   }
//   console.log("Connected to SQLite DB(s).");
// }

// let sql = `CREATE TABLE IF NOT EXISTS artists(
// artist_id INTEGER PRIMARY KEY AUTOINCREMENT,
//     artist_name TEXT NOT NULL,
//      aka TEXT,
//      genre TEXT NOT NULL,
//      count INTEGER NOT NULL,
//      state TEXT NOT NULL,
//      region TEXT NOT NULL,
//      label TEXT,
//      mixtape TEXT,
//      album TEXT NOT NULL,
//      year INTEGER NOT NULL,
//      certifications TEXT
// )`;

// let sql2 = `CREATE TABLE IF NOT EXISTS users(
//     user_id INTEGER PRIMARY KEY AUTOINCREMENT,
//     username TEXT UNIQUE NOT NULL,
//     password TEXT NOT NULL,
//     email TEXT UNIQUE NOT NULL,
//     role TEXT NOT NULL DEFAULT 'user'
// )`;

// let sqlPosts = `CREATE TABLE IF NOT EXISTS posts(
//     post_id INTEGER PRIMARY KEY AUTOINCREMENT,
//     user_id INTEGER NOT NULL,
//     content TEXT NOT NULL,
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
// )`;

// DB.run(sql, [], (err) => {
//   //callback function
//   if (err) {
//     console.error("Error creating artists table:", err.message);
//     return;
//   }
//   console.log("Artists table created or already exists.");
// });

// DB2.run(sql2, [], (err) => {
//   //callback function
//   if (err) {
//     console.error("Error creating users table:", err.message);
//     return;
//   }
//   console.log("Users table created or already exists.");
// });

// DB3.run(sqlPosts, [], (err) => {
//   //callback function
//   if (err) {
//     console.error("Error creating posts table:", err.message);
//     return;
//   }
//   console.log("Posts table created or already exists.");
// });
// export { DB, DB2, DB3 };

//************ new code ****************

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

// Export the pool to be used in your index.js
export default pool;

// --- Initial Schema Setup (Example - you might use migrations for this in production) ---
// This function will create tables if they don't exist
async function createTables() {
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
        mixtape VARCHAR(255),
        album VARCHAR(255),
        year INTEGER,
        certifications TEXT,
        image_url VARCHAR(255)
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
      'Tables "users", "artists", and "posts" checked/created successfully.'
    );
  } catch (err) {
    console.error("Error creating tables:", err.message);
    process.exit(1); // Exit if table creation fails
  }
}

// Call createTables when the application starts
// It's crucial this runs before your express app tries to interact with the database
// One common pattern is to wrap your app.listen in a function that's called after createTables
createTables();
