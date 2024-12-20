import sqlite3 from 'sqlite3';
const sql3 = sqlite3.verbose();

// const DB = new sqlite3.Database(':memory', sqlite3.OPEN_READWRITE, connected);
// const DB = new sqlite3.Database('', sqlite3.OPEN_READWRITE, connected);
const DB = new sql3.Database('./rapper.db', sqlite3.OPEN_READWRITE, connected);

function connected(err) {
    if (err) {
        console.log(err.message);
        return;
    }
    console.log('Created the DB or SQLite DB does already exist');
}

let sql = `CREATE TABLE rappers(
artist_id INTEGER PRIMARY KEY,
    artist_name TEXT,
     aka TEXT,
     genre TEXT,
     count INTEGER,
     state TEXT,
     region TEXT,
     label TEXT,
     mixtape TEXT,
     album TEXT,
     year INTEGER,
     certifications TEXT
)`;
DB.run(sql, [], (err) => {
    //callback function
    if (err) {
        console.log(err,'error creating rappers table');
        return;
    }
    console.log('CREATED TABLE');
    
})
export { DB };