// import sqlite3 from 'sqlite3';
const sqlite3 = require('sqlite3');

const db =  new sqlite3.Database("./quote.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) return console.error(err);
});

const sql = `CREATE TABLE quote(ID INTEGER PRIMARY KEY, name, aka, genre, count, state, region, label, album, year, certifications)`;
db.run(sql);

// Define the SQL statement
// const sql = `
// CREATE TABLE IF NOT EXISTS quote (
//     ID INTEGER PRIMARY KEY,
//     name TEXT,
//     aka TEXT,
//     genre TEXT,
//     count INTEGER,
//     state TEXT,
//     region TEXT,
//     label TEXT,
//     album TEXT,
//     year INTEGER,
//     certifications TEXT
// )`;