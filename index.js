import { DB } from "./connect.js";

import express from 'express';
import bodyParser from "body-parser";

const app = express();



// const sqlite3 = require('sqlite3');
// let sql;
// const db =  new sqlite3.Database("./quote.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
//     if (err) return console.error("this is line 12",err);
// });

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
// app.post('/quote', async(req, res) => {
//     try {
//         // console.log(req.body.aka)
//         const { artistName, aka, genre, count, state, region, label, album, year, certifications } = req.body;
//         sql = "INSERT INTO quote(artistName, aka, genre, count, state, region, label, album, year, certifications) VALUES (?,?,?,?,?,?,?,?,?,?)"
//         db.run(sql, [artistName, aka, genre, count, state, region, label, album, year, certifications], (err) => {
//            // if (err) {
//              //   return res.send({ status: 300, success: false, error: err });//<--------------server response.json

//             //} //else {
//                 // return;
//             // }
          
//               console.log('successful input ', artistName, aka, genre, count, state, region, label, album, year, certifications);
//         })
//         await res.json({
//             status: 200,
//             success: true,
//         })
//     }
//     catch (error) {
//         return await res.json({
//             status: 400,
//             success: false,
//         })
//     }
// })

app.get('/', async (req, res) => {
    res.status(200);
    res.send('rapper list is up and running');
});

app.get('/api', (req, res) => { 
    //get all rappers from table
    res.set('content-type', 'application/json');
    const sql = 'SELECT * FROM rappers';
    let data = { rappers: [] };
    try {
        DB.all(sql, [], (err, rows) => {
            if (err) {
                throw err; //let catch handle it
            }
            rows.forEach(row => {
                data.rappers.push({id: row.artist_id, name: row.artist_name, genre: row.genre, count: row.count})
            })
        })
    } catch(err){}

});

app.get('/api', (req, res) => { });

app.post('/api', (req, res) => { });

app.delete('/api', (req, res) => { });

app.listen(3010, (err) => {
    if (err) {
        console.log('ERROR:', err.message)
    }
    console.log('LISTENING on port 3010');
});