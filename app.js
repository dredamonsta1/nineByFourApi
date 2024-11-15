const express = require('express');
const bodyParser = require('body-parser')
const app = express();



const sqlite3 = require('sqlite3');

const db =  new sqlite3.Database("./qoute.db", sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.error(err);
});

app.use(bodyParser.json);

// post request
app.listen(3010);