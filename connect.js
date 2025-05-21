import sqlite3 from "sqlite3";
const sql3 = sqlite3.verbose();
// import cors from "cors";

// app.use(cors());
// const DB = new sqlite3.Database(':memory', sqlite3.OPEN_READWRITE, connected);
// const DB = new sqlite3.Database('', sqlite3.OPEN_READWRITE, connected);

const DB = new sql3.Database(
  "./rapper.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  connected
);

const DB2 = new sql3.Database(
  "./user.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  connected
);

function connected(err) {
  if (err) {
    console.error("Error connecting to SQLite DB:", err.message);
    // You might want to add process.exit(1) here in a real application
    // if a database connection failure is critical.
    return;
  }
  console.log("Connected to SQLite DB(s).");
}

let sql = `CREATE TABLE IF NOT EXISTS rappers(
artist_id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_name TEXT NOT NULL,
     aka TEXT,
     genre TEXT NOT NULL,
     count INTEGER NOT NULL,
     state TEXT NOT NULL,
     region TEXT NOT NULL,
     label TEXT,
     mixtape TEXT,
     album TEXT NOT NULL,
     year INTEGER NOT NULL,
     certifications TEXT
)`;

let sql2 = `CREATE TABLE IF NOT EXISTS users(
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
)`;

DB.run(sql, [], (err) => {
  //callback function
  if (err) {
    console.error("Error creating rappers table:", err.message);
    return;
  }
  console.log("Rappers table created or already exists.");
});

DB2.run(sql2, [], (err) => {
  //callback function
  if (err) {
    console.error("Error creating users table:", err.message);
    return;
  }
  console.log("Users table created or already exists.");
});
export { DB, DB2 };
