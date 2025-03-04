import { DB, DB2 } from "./connect.js";
// import { DB2 } from "./connect.js";

import express from "express";
import bodyParser from "body-parser";

import cors from "cors";
const app = express();

app.use(cors());
app.use(bodyParser.json());

app.get("/api", (req, res) => {
  //get all artists from table
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM rappers";
  let data = { rappers: [] };
  try {
    DB.all(sql, [], (err, rows) => {
      if (err) {
        throw err; //let catch handle it
      }
      rows.forEach((row) => {
        data.rappers.push({
          artist_id: row.artist_id,
          name: row.artist_name,
          genre: row.genre,
          count: row.count,
          state: row.state,
          region: row.region,
          label: row.label,
          mixtape: row.mixtape,
          album: row.album,
          year: row.year,
          certifications: row.certifications,
        });
      });
      let content = JSON.stringify(data);
      res.send(content);
    });
  } catch (err) {
    console.log(err.message);
    res.status(467);
    res.send(`{ 'code':467, 'status':'${err.message}' }`);
  }
});

// app.get("/api", (req, res) => {
//   //post request
//   res.set("content-type", "application/json");
//   const sql = "SELECT * FROM rappers";
// });

app.post("/api", (req, res) => {
  res.set("content-type", "application/json");
  const sql =
    "INSERT INTO rappers(artist_name, aka, genre, count, state, region, label, mixtape, album, year, certifications) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
  let newArtistId;

  try {
    DB.run(
      sql,
      [
        req.body.artist_name,
        req.body.aka,
        req.body.genre,
        req.body.count,
        req.body.state,
        req.body.region,
        req.body.label,
        req.body.mixtape,
        req.body.album,
        req.body.year,
        req.body.certifications,
      ],
      function (err) {
        if (err) throw err;

        newArtistId = this.lastID; //this refers to the last row inserted or provides the auto increment value

        res.status(201);
        let data = { status: 201, message: `new artist ${newArtistId} saved.` };
        let content = JSON.stringify(data);
        res.send(content);
      }
    );
  } catch (err) {
    console.log(err.message);
    res.status(468);
    res.send(`{ 'code':468, 'status':'${err.message}' }`);
  }
});

app.delete("/api", (req, res) => {
  res.set("content-type", "application/json");
  const sql = "DELETE FROM rappers WHERE artist_id = ?";
  try {
    DB.run(sql, [req.query.artist_id], function (err) {
      if (err) throw err;
      if (this.changes === 1) {
        //one item deleted
        res.status(204);
        res.send(
          `{ 'code':204, 'message':'rapper ${req.query.artist_id}was deleted'}`
        );
      } else {
        //no item deleted
        res.status(204);
        res.send(`{ 'code':204, 'message':'no operation done' }`);
      }
    });
  } catch (err) {
    console.log(err.message);
    res.status(469);
    res.send(`{ 'code':469, 'status':'${err.message}' }`);
  }
});

//users api

app.get("/api/users", (req, res) => {
  //get all users
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM users";
  let data = { users: [] };
  try {
    DB2.all(sql, [], (err, rows) => {
      if (err) {
        throw err; //let catch handle it
      }
      rows.forEach((row) => {
        data.users.push({
          user_id: row.user_id,
          username: row.username,
          password: row.password,
          email: row.email,
          role: row.role,
        });
      });
      let content = JSON.stringify(data);
      res.send(content);
    });
  } catch (err) {
    console.log(err.message);
    res.status(467);
    res.send(`{ 'code':467, 'status':'${err.message}' }`);
  }
});

app.post("/api/users", (req, res) => {
  res.set("content-type", "application/json");
  const sql =
    "INSERT INTO users(username, password, email, role) VALUES (?,?,?,?)";
  let newUserId;

  try {
    DB2.run(
      sql,
      [req.body.username, req.body.password, req.body.email, req.body.role],
      function (err) {
        if (err) throw err;

        newUserId = this.lastID; //this refers to the last row inserted or provides the auto increment value

        res.status(201);
        let data = { status: 201, message: `new user ${newUserId} saved.` };
        let content = JSON.stringify(data);
        res.send(content);
      }
    );
  } catch (err) {
    console.log(err.message);
    res.status(468);
    res.send(`{ 'code':468, 'status':'${err.message}' }`);
  }
});

app.delete("/api/users", (req, res) => {
  res.set("content-type", "application/json");
  const sql = "DELETE FROM users WHERE user_id = ?";
  try {
    DB2.run(sql, [req.query.user_id], function (err) {
      if (err) throw err;
      if (this.changes === 1) {
        //one item deleted
        res.status(204);
        res.send(
          `{ 'code':204, 'message':'user ${req.query.user_id}was deleted'}`
        );
      } else {
        //no item deleted
        res.status(204);
        res.send(`{ 'code':204, 'message':'no operation done' }`);
      }
    });
  } catch (err) {
    console.log(err.message);
    res.status(469);
    res.send(`{ 'code':469, 'status':'${err.message}' }`);
  }
});

app.listen(process.env.PORT || 3010, (err) => {
  if (err) {
    console.log("ERROR:", err.message);
  }
  console.log("LISTENING on port 3010");
});
