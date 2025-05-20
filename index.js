import { DB, DB2 } from "./connect.js";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3010;
app.options("*", cors()); // Enable CORS preflight for all routes

app.use(
  cors({
    origin: "*", // Allow all origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    // preflightContinue: false,
  })
);
// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*"); // or 'http://localhost:3000'
//   res.header(
//     "Access-Control-Allow-Headers",
//     "Origin, X-Requested-With, Content-Type, Accept"
//   );
//   res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
//   next();
// });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Keep this for URL-encoded bodies

// --- JWT Secret ---
// Store this in a .env file! Never hardcode in production.
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
if (!JWT_SECRET === "your_jwt_secret") {
  console.warn(
    "JWT_SECRET is not set in environment variables. Using a default. Please set process.env.JWT_SECRET in your .env file."
  );
  // console.error("JWT_SECRET is not set. Please set it in your .env file.");
  // process.exit(1);
}

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.header["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Expects "Bearer TOKEN"
  if (token == null) {
    return res.status(401).json({ message: "Authentication token required." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("Token verification error:", err.message);
      // Return a 403 for invalid/expired tokens
      return res.status(403).json({ message: "Invalid or expired token." });
    }
    req.user = user; // Attach user payload to request
    next();
  });
};
// --- Routes ---
app.get("/api", (req, res) => {
  //get all artists from table
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM rappers";
  let data = { rappers: [] };
  try {
    DB.all(sql, [], (err, rows) => {
      if (err) {
        console.error("Error fetching rappers:", err.message);
        //throw err; //let catch handle it
        return res.status(500).json({ code: 500, status: err.message });
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
      let content = JSON.stringify(data); // <-------------might change
      res.send(content);
    });
  } catch (err) {
    console.log("Catch error fetching rappers", err.message);
    res.status(500).json({ code: 500, status: err.message });
    // res.send(`{ 'code':467, 'status':'${err.message}' }`);
  }
});

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
        if (err) {
          console.log("Error inserting new artist:", err.message);
          return res.status(500).json({ code: 500, status: err.message });
        }
        // throw err;
        res
          .status(201)
          .json({ status: 201, message: `New artist ${this.lastID} saved.` });

        // newArtistId = this.lastID; //this refers to the last row inserted or provides the auto increment value

        // res.status(201);
        // let data = { status: 201, message: `new artist ${newArtistId} saved.` };
        // let content = JSON.stringify(data);
        // res.send(content);
      }
    );
  } catch (err) {
    console.error("catch error inserting artist", err.message);
    res.status(500).json({ code: 500, status: err.message });
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
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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

// ********* new code below ******

app.post("/api/users/login", (req, res) => {
  const { username, password } = req.body;
  DB2.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (err) return res.status(500).json({ message: "Server error" });
      if (!user)
        return res.status(401).json({ message: "Invalid credentials" });

      res.status(200).json({ message: `Welcome back, ${user.username}` });
    }
  );
});

app.get("/api/users/login/:id", (req, res) => {
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM users WHERE user_id = ?";
  let data = { users: [] };
  try {
    DB2.all(sql, [req.params.id], (err, rows) => {
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
app.get("/api/users/login", (req, res) => {
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM users WHERE username = ?";
  let data = { users: [] };
  try {
    DB2.all(sql, [req.query.username], (err, rows) => {
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
app.get("/api/users/login/:username", (req, res) => {
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM users WHERE username = ?";
  let data = { users: [] };
  try {
    DB2.all(sql, [req.params.username], (err, rows) => {
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
app.get("/api/users/login/:username/:password", (req, res) => {
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM users WHERE username = ? AND password = ?";
  let data = { users: [] };
  try {
    DB2.all(sql, [req.params.username, req.params.password], (err, rows) => {
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
//********* new code above ******
app.listen(process.env.PORT || 3010, (err) => {
  if (err) {
    console.log("ERROR:", err.message);
  }
  console.log("LISTENING on port 3010");
});
