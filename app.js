const express = require('express');
const bodyParser = require('body-parser')
const app = express();



const sqlite3 = require('sqlite3');

const db =  new sqlite3.Database("./quote.db", sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.error(err);
});

app.use(bodyParser.json());

// post request
app.post('/quote', (req, res) => {
    try {
        console.log(req.body.name)
        res.json({
            status: 200,
            success: true,
        })
    }
    catch (error) {
        return res.json({
            statu: 400,
            success: false,
        })
    }
})
app.listen(3010);