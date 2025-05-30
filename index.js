import { DB, DB2 } from "./connect.js";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import path from "path"; // Ensure path is imported

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3010;

app.options("*", cors());
app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

// --- FIX 1: Correct the static file serving path ---
// This makes images accessible via URL (e.g., http://localhost:3010/uploads/image.jpg)
// Use path.resolve to ensure correct path regardless of OS
app.use("/uploads", express.static(path.resolve("uploads"))); // ADDED LEADING SLASH

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- JWT Secret ---
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
// Corrected warning condition (from !JWT_SECRET === "your_jwt_secret")
if (JWT_SECRET === "your_jwt_secret") {
  console.warn(
    "JWT_SECRET is not set in environment variables. Using a default. Please set process.env.JWT_SECRET in your .env file."
  );
}

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  console.log("Backend Auth: Raw Authorization Header:", authHeader);
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) {
    console.log("Backend Auth: No token provided or failed extraction.");
    return res.status(401).json({ message: "Authentication token required." });
  }

  console.log("Backend Auth: Token received by backend:", token);
  console.log(
    "Backend Auth: Secret key being used for verification:",
    JWT_SECRET
  );

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("Backend Auth: JWT Verification Error:", err.message);
      if (err.name === "TokenExpiredError") {
        console.log("Backend Auth: Token expired.");
        return res
          .status(401)
          .json({ message: "Authentication token expired." });
      }
      if (err.name === "JsonWebTokenError") {
        // Corrected from jsonWebTokenError (lowercase 'j')
        console.log("Backend Auth: Invalid JWT signature or malformed token.");
        return res
          .status(403)
          .json({ message: "Invalid Authentication token." });
      }
      console.log("Backend Auth Other JWT error:", err.message);
      return res.status(403).json({ message: "Invalid or expired token." });
    }
    req.user = user;
    console.log("Backend Auth: Token successfully verified for user:", user);
    next();
  });
};

//-------Multer Storage Config -------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      // Return an Error object for better error handling, not just a string
      cb(new Error("Error: Images Only Please!"));
    }
  },
});

// --- NEW ROUTE: Upload Artist Image ---
app.post(
  "/api/upload-artist-image",
  authenticateToken,
  upload.single("artistImage"), // Multer expects 'artistImage'
  (req, res) => {
    if (req.file) {
      const imageUrl = `/uploads/${req.file.filename}`;
      res.status(200).json({
        message: "Image uploaded successfully!",
        imageUrl: imageUrl,
        // --- FIX 2: Correct typo from 'reqfile.filename' to 'req.file.filename' ---
        fileName: req.file.filename, // Corrected typo
      });
    } else {
      res
        .status(400)
        .json({ message: "No file uploaded or file type not supported." });
    }
  },
  (err, req, res, next) => {
    // Multer error handling (ensure `err` is consistent and access `err.message`)
    if (err instanceof multer.MulterError) {
      console.error("Multer Error:", err); // Log the full error
      return res.status(400).json({ message: err.message }); // Corrected from `error.message` to `err.message`
    } else if (err) {
      console.error("General Upload Error:", err); // Log the full error
      // If the fileFilter sends a string like 'Error: Images Only Please!',
      // it will be caught here as `err`.
      return res.status(400).json({ message: err.message || err }); // Access message property or use err directly
    }
    next();
  }
);
// ... rest of your index.js (no changes needed for other routes based on this issue)

// index.js (Backend)

// ... (your existing imports and setup) ...

app.put("/api/rappers/:artist_id/clout", (req, res) => {
  const artistId = req.params.artist_id;

  if (!artistId) {
    return res.status(400).json({ message: "Artist ID is required." });
  }

  DB.run(
    "UPDATE rappers SET count = count + 1 WHERE artist_id = ?",
    [artistId],
    function (err) {
      if (err) {
        console.error(
          "Error updating clout for artist ID",
          artistId,
          ":",
          err.message
        );
        return res
          .status(500)
          .json({ message: "Failed to update clout", error: err.message });
      }
      if (this.changes === 0) {
        // No row was updated, meaning artist_id was not found
        return res
          .status(404)
          .json({ message: `Artist with ID ${artistId} not found.` });
      }
      // Successfully updated
      res.json({
        message: "Clout updated successfully",
        artist_id: artistId,
        changes: this.changes,
      });
    }
  );
});

// ... (your other routes and app.listen) ...

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
    "INSERT INTO rappers(artist_name, aka, genre, count, state, region, label, mixtape, album, year, certifications, image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
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
        req.body.image_url,
      ],
      function (err) {
        if (err) {
          console.log("Error inserting new artist:", err.message);
          return res.status(500).json({ code: 500, status: err.message });
        }
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
      if (err) {
        console.error("Error deleting artist:", err.message);
        return res.status(500).json({ code: 500, status: err.message });
      }

      if (this.changes === 1) {
        //one item deleted
        res.status(200).json({
          code: 200,
          message: `artist ${req.query.artist_id} was deleted`,
        });
      } else {
        res.status(404).json({
          code: 404,
          message: "Artist not found or no operation done",
        });
      }
    });
  } catch (err) {
    console.log("Catch error deleting Artist", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

// ---User Authentication and Management API---
//users api

// User Registration
app.post("/api/users/register", async (req, res) => {
  const { username, password, email, role } = req.body;

  if (!username || !password || !email) {
    return res
      .status(400)
      .json({ message: "Username, password, and email are required." });
  }

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10); // 10 salt rounds is a good default

    const sql =
      "INSERT INTO users(username, password, email, role) VALUES (?,?,?,?)";
    DB2.run(
      sql,
      [username, hashedPassword, email, role || "user"],
      function (err) {
        if (err) {
          console.error("Error during user registration:", err.message);
          if (
            err.message.includes(
              "SQLITE_CONSTRAINT: UNIQUE constraint failed: users.username"
            ) ||
            err.message.includes(
              "SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email"
            )
          ) {
            return res
              .status(409)
              .json({ message: "Username or email already exists." });
          }
          return res.status(500).json({ message: "Error registering user." });
        }
        res.status(201).json({
          message: "User registered successfully!",
          userId: this.lastID,
        });
      }
    );
  } catch (error) {
    console.error("Server error during registration:", error);
    res.status(500).json({ message: "Server error during registration." });
  }
});

// User Login (Corrected to use bcrypt and JWT)
app.post("/api/users/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required." });
  }

  DB2.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err) {
        console.error("Error during login (DB query):", err.message);
        return res.status(500).json({ message: "Server error during login." });
      }
      if (!user) {
        // Don't reveal if username exists, just say invalid credentials
        return res
          .status(401)
          .json({ message: "Invalid username or password." });
      }

      try {
        // Compare the provided password with the hashed password in the DB
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          return res
            .status(401)
            .json({ message: "Invalid username or password." });
        }

        // Generate a JWT
        const token = jwt.sign(
          { id: user.user_id, username: user.username, role: user.role },
          JWT_SECRET,
          { expiresIn: "1h" } // Token expires in 1 hour
        );

        res.status(200).json({
          message: `Welcome back, ${user.username}!`,
          token: token,
          user: { id: user.user_id, username: user.username, role: user.role }, // Send back some user info (excluding password)
        });
      } catch (error) {
        console.error(
          "Error during password comparison or JWT generation:",
          error
        );
        res.status(500).json({ message: "Server error during login." });
      }
    }
  );
});

// Example of a Protected Route (only accessible with a valid JWT)
app.get("/api/users/profile", authenticateToken, (req, res) => {
  // req.user will contain the decoded JWT payload (id, username, role)
  res.status(200).json({
    message: `Hello ${req.user.username}, this is your protected profile data!`,
    user: req.user,
    accessTime: new Date().toISOString(),
  });
});

// Other user API endpoints (might need protection too)
app.get("/api/users", authenticateToken, (req, res) => {
  // Protect this endpoint as well
  res.set("content-type", "application/json");
  const sql = "SELECT user_id, username, email, role FROM users"; // Do not return passwords!
  let data = { users: [] };
  try {
    DB2.all(sql, [], (err, rows) => {
      if (err) {
        console.error("Error fetching users:", err.message);
        return res.status(500).json({ code: 500, status: err.message });
      }
      rows.forEach((row) => {
        data.users.push({
          user_id: row.user_id,
          username: row.username,
          email: row.email,
          role: row.role,
        });
      });
      res.json(data);
    });
  } catch (err) {
    console.error("Catch error fetching users:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.delete("/api/users", authenticateToken, (req, res) => {
  // Consider protecting this
  res.set("content-type", "application/json");
  const sql = "DELETE FROM users WHERE user_id = ?";
  try {
    DB2.run(sql, [req.query.user_id], function (err) {
      if (err) {
        console.error("Error deleting user:", err.message);
        return res.status(500).json({ code: 500, status: err.message });
      }
      if (this.changes === 1) {
        res.status(200).json({
          code: 200,
          message: `User ${req.query.user_id} was deleted.`,
        });
      } else {
        res
          .status(404)
          .json({ code: 404, message: "User not found or no operation done." });
      }
    });
  } catch (err) {
    console.error("Catch error deleting user:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.listen(PORT, (err) => {
  if (err) {
    console.log("ERROR:", err.message);
  }
  console.log(`LISTENING on port ${PORT}`);
});
