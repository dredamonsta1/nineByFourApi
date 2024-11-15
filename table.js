// import sqlite3 from 'sqlite3';
const sqlite3 = require('sqlite3');

const db =  new sqlite3.Database("./qoute.db", sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.error(err);
});

const sql = `CREATE TABLE quote(ID INTEGER PRIMARY KEY, name, aka, genre, count, state, region, label, album, year, certifications)`;
db.run(sql);