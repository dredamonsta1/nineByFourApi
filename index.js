import { DB, DB2 } from "./connect.js";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";

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
app.use("uploads", express.static(path.resolve("uploads")));

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
  const authHeader = req.headers["authorization"];
  // const authHeader = req.headers.authorization;
  console.log("Backend Auth: Raw Authorization Header:", authHeader); // Debugging
  const token = authHeader && authHeader.split(" ")[1]; // Expects "Bearer TOKEN"
  if (token == null) {
    console.log("Backend Auth: No token provided or failed extraction."); // Debugging
    return res.status(401).json({ message: "Authentication token required." });
  }

  console.log("Backend Auth: Token received by backend:", token); // Debugging
  console.log(
    "Backend Auth: Secret key being used for verification:",
    JWT_SECRET
  ); // Debugging

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("Backend Auth: JWT Verification Error:", err.message);
      // Return a 403 for invalid/expired tokens
      if (err.name === "TokenExpiredError") {
        console.log("Backend Auth: Token expired."); // Debugging
        return res
          .status(401)
          .json({ message: "Authentication token expired." });
      }
      if (err.name === "jsonWebTokenError") {
        console.log("Backend Auth: Invalid JWT signature or malformed token."); // Debugging
        return res
          .status(403)
          .json({ message: "Invalid Authentication token." });
      }
      console.log("Backend Auth Other JWT error:", err.message); // Debugging for other errors
      return res.status(403).json({ message: "Invalid or expired token." }); // Generic error message for other JWT errors

      // return res.status(403).json({ message: "Invalid or expired token." });
    }
    req.user = user; // Attach user payload to request
    console.log("Backend Auth: Token successfully verified for user:", user); // Debugging
    next();
  });
};

//-------Multer Storage Config -------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Images will be saved in the 'uploads' directory
  },
  filename: function (req, file, cb) {
    // create a unique file name using current timestamp and og extension
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

// Create the multer upload middleware
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb("Error: Images Only Plese!");
    }
  },
});

// --- NEW ROUTE: Upload Rapper Image ---
// This route will handle uploading a single image for a artist.
// You might want to protect this route with authenticateToken if only logged-in users can upload.
app.post(
  "/api/upload-artist-image",
  authenticateToken,
  upload.single("artistImage"),
  (req, res) => {
    if (req.file) {
      //req.file contains information about the uploaded file
      const imageUrl = `/uploads/${req.file.filename}`; // This is the URL to access image
      res.status(200).json({
        message: "Image uploaded successfully!",
        imageUrl: imageUrl, // Send back the URL where the image can be accessed
        fileName: reqfile.filename, // OG file name
      });
    } else {
      res
        .status(400)
        .json({ message: "No file uploaded or file type not supported." });
    }
  },
  (err, req, res, next) => {
    // Multer error handling
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: error.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next(); // Pass to the next middleware if no error
  }
);
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
