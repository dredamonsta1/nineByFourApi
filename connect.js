import sqlite3 from "sqlite3";
const sql3 = sqlite3.verbose();

// const DB = new sqlite3.Database(':memory', sqlite3.OPEN_READWRITE, connected);
// const DB = new sqlite3.Database('', sqlite3.OPEN_READWRITE, connected);

const DB = new sql3.Database("./rapper.db", sqlite3.OPEN_READWRITE, connected);
const DB2 = new sql3.Database(
  "./user.db",
  sqlite3.OPEN_READWRITE || sqlite3.OPEN_CREATE,
  connected
);

function connected(err) {
  if (err) {
    console.log(err.message);
    return;
  }
  console.log("Created the DB or SQLite DB does already exist");
}

let sql = `CREATE TABLE IF NOT EXISTS rappers(
artist_id INTEGER PRIMARY KEY,
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
    user_id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL
)`;

DB.run(sql, [], (err) => {
  //callback function
  if (err) {
    console.log(err, "error creating rappers table");
    return;
  }
  console.log("CREATED TABLE");
});

DB2.run(sql2, [], (err) => {
  //callback function
  if (err) {
    console.log(err, "error creating users table");
    return;
  }
  console.log("CREATED TABLE");
});
export { DB, DB2 };
