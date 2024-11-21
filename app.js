const express = require("express");
const bodyParser = require("body-parser");
const res = require("express/lib/response")
// const { Sequelize, Model, Datatypes } = require('sequelize');
const app = express();



const sqlite3 = require('sqlite3');
let sql;
const db =  new sqlite3.Database("./quote.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) return console.error("this is line 12",err);
});

// Define the SQL statement
// const sql = `
// CREATE TABLE IF NOT EXISTS quote (
//     ID INTEGER PRIMARY KEY,
//     artistName TEXT,
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

app.use(bodyParser.json());

// post request
app.post('/quote', (req, res) => {
    try {
        // console.log(req.body.aka)
        const { artistName, aka, genre, count, state, region, label, album, year, certifications } = req.body;
        sql = "INSERT INTO quote(artistName, aka, genre, count, state, region, label, album, year, certifications) VALUES (?,?,?,?,?,?,?,?,?,?)"
        db.run(sql, [artistName, aka, genre, count, state, region, label, album, year, certifications], (err) => {
            if (err) return res.json({ status: 300, success: false, error: err });
            console.log('successful input ', artistName, aka, genre, count, state, region, label, album, year, certifications);
        })
        res.json({
            status: 200,
            success: true,
        })
    }
    catch (error) {
        return res.json({
            status: 400,
            success: false,
        })
    }
})
app.listen(3010);