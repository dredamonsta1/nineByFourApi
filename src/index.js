// import { DB, DB2, DB3 } from "./connect.js";
// import express from "express";
// import bodyParser from "body-parser";
// import cors from "cors";
// import bcrypt from "bcrypt";
// import jwt from "jsonwebtoken";
// import dotenv from "dotenv";
// import multer from "multer";
// import path from "path";

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 3010;

// app.options("*", cors());
// app.use(
//   cors({
//     origin: "*",
//     methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
//     credentials: true,
//   })
// );

// app.use("/uploads", express.static(path.resolve("uploads")));

// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

// const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
// if (JWT_SECRET === "your_jwt_secret") {
//   console.warn(
//     "JWT_SECRET is not set in environment variables. Using a default. Please set process.env.JWT_SECRET in your .env file."
//   );
// }

// // --- Authentication Middleware ---
// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers["authorization"];
//   console.log("Backend Auth: Raw Authorization Header:", authHeader);
//   const token = authHeader && authHeader.split(" ")[1];
//   if (token == null) {
//     console.log("Backend Auth: No token provided or failed extraction.");
//     return res.status(401).json({ message: "Authentication token required." });
//   }

//   console.log("Backend Auth: Token received by backend:", token);
//   console.log(
//     "Backend Auth: Secret key being used for verification:",
//     JWT_SECRET
//   );

//   jwt.verify(token, JWT_SECRET, (err, user) => {
//     if (err) {
//       console.error("Backend Auth: JWT Verification Error:", err.message);
//       if (err.name === "TokenExpiredError") {
//         console.log("Backend Auth: Token expired.");
//         return res
//           .status(401)
//           .json({ message: "Authentication token expired." });
//       }
//       if (err.name === "JsonWebTokenError") {
//         console.log("Backend Auth: Invalid JWT signature or malformed token.");
//         return res
//           .status(403)
//           .json({ message: "Invalid Authentication token." });
//       }
//       console.log("Backend Auth Other JWT error:", err.message);
//       return res.status(403).json({ message: "Invalid or expired token." });
//     }
//     req.user = user;
//     console.log("Backend Auth: Token successfully verified for user:", user);
//     next();
//   });
// };

// //-------Multer Storage Config -------
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, "uploads/");
//   },
//   filename: function (req, file, cb) {
//     cb(
//       null,
//       file.fieldname + "-" + Date.now() + path.extname(file.originalname)
//     );
//   },
// });

// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
//   fileFilter: (req, file, cb) => {
//     const filetypes = /jpeg|jpg|png|gif/;
//     const mimetype = filetypes.test(file.mimetype);
//     const extname = filetypes.test(
//       path.extname(file.originalname).toLowerCase()
//     );

//     if (mimetype && extname) {
//       return cb(null, true);
//     } else {
//       cb(new Error("Error: Images Only Please!"));
//     }
//   },
// });

// // --- NEW ROUTE: Upload Artist Image ---
// app.post(
//   "/api/upload-artist-image",
//   authenticateToken,
//   upload.single("artistImage"),
//   (req, res) => {
//     if (req.file) {
//       const imageUrl = `/uploads/${req.file.filename}`;
//       res.status(200).json({
//         message: "Image uploaded successfully!",
//         imageUrl: imageUrl,
//         fileName: req.file.filename,
//       });
//     } else {
//       res
//         .status(400)
//         .json({ message: "No file uploaded or file type not supported." });
//     }
//   },
//   (err, req, res, next) => {
//     if (err instanceof multer.MulterError) {
//       console.error("Multer Error:", err);
//       return res.status(400).json({ message: err.message });
//     } else if (err) {
//       console.error("General Upload Error:", err);
//       return res.status(400).json({ message: err.message || err });
//     }
//     next();
//   }
// );

// // --- START: MOVED THIS ROUTE UP ---
// // This should be one of the first routes for /api
// app.get("/api", (req, res) => {
//   res.set("content-type", "application/json");
//   const sql = "SELECT * FROM artists";
//   let data = { artists: [] };
//   try {
//     DB.all(sql, [], (err, rows) => {
//       if (err) {
//         console.error("Error fetching artists:", err.message);
//         return res.status(500).json({ code: 500, status: err.message });
//       }
//       rows.forEach((row) => {
//         data.artists.push({
//           artist_id: row.artist_id,
//           name: row.artist_name,
//           genre: row.genre,
//           count: row.count,
//           state: row.state,
//           region: row.region,
//           label: row.label,
//           mixtape: row.mixtape,
//           album: row.album,
//           year: row.year,
//           certifications: row.certifications,
//           image_url: row.image_url, // Ensure image_url is included here if it's in DB
//         });
//       });
//       let content = JSON.stringify(data);
//       res.send(content);
//     });
//   } catch (err) {
//     console.log("Catch error fetching artists", err.message);
//     res.status(500).json({ code: 500, status: err.message });
//   }
// });
// // --- END: MOVED THIS ROUTE UP ---

// // --- Artist API Endpoints ---
// app.put("/api/artists/:artist_id/clout", (req, res) => {
//   const artistId = req.params.artist_id;

//   if (!artistId) {
//     return res.status(400).json({ message: "Artist ID is required." });
//   }

//   DB.run(
//     "UPDATE artists SET count = count + 1 WHERE artist_id = ?",
//     [artistId],
//     function (err) {
//       if (err) {
//         console.error(
//           "Error updating clout for artist ID",
//           artistId,
//           ":",
//           err.message
//         );
//         return res
//           .status(500)
//           .json({ message: "Failed to update clout", error: err.message });
//       }
//       if (this.changes === 0) {
//         return res
//           .status(404)
//           .json({ message: `Artist with ID ${artistId} not found.` });
//       }
//       res.json({
//         message: "Clout updated successfully",
//         artist_id: artistId,
//         changes: this.changes,
//       });
//     }
//   );
// });

// app.post("/api", (req, res) => {
//   res.set("content-type", "application/json");
//   const sql =
//     "INSERT INTO artists(artist_name, aka, genre, count, state, region, label, mixtape, album, year, certifications, image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
//   try {
//     DB.run(
//       sql,
//       [
//         req.body.artist_name,
//         req.body.aka,
//         req.body.genre,
//         req.body.count,
//         req.body.state,
//         req.body.region,
//         req.body.label,
//         req.body.mixtape,
//         req.body.album,
//         req.body.year,
//         req.body.certifications,
//         req.body.image_url,
//       ],
//       function (err) {
//         if (err) {
//           console.log("Error inserting new artist:", err.message);
//           return res.status(500).json({ code: 500, status: err.message });
//         }
//         res
//           .status(201)
//           .json({ status: 201, message: `New artist ${this.lastID} saved.` });
//       }
//     );
//   } catch (err) {
//     console.error("catch error inserting artist", err.message);
//     res.status(500).json({ code: 500, status: err.message });
//   }
// });

// app.delete("/api", (req, res) => {
//   res.set("content-type", "application/json");
//   const sql = "DELETE FROM artists WHERE artist_id = ?";
//   try {
//     DB.run(sql, [req.query.artist_id], function (err) {
//       if (err) {
//         console.error("Error deleting artist:", err.message);
//         return res.status(500).json({ code: 500, status: err.message });
//       }

//       if (this.changes === 1) {
//         res.status(200).json({
//           code: 200,
//           message: `artist ${req.query.artist_id} was deleted`,
//         });
//       } else {
//         res.status(404).json({
//           code: 404,
//           message: "Artist not found or no operation done",
//         });
//       }
//     });
//   } catch (err) {
//     console.log("Catch error deleting Artist", err.message);
//     res.status(500).json({ code: 500, status: err.message });
//   }
// });

// // ---User Authentication and Management API---
// // ... (User authentication and management routes - no changes needed here for the 404 issue) ...
// // User Registration
// app.post("/api/users/register", async (req, res) => {
//   const { username, password, email, role } = req.body;

//   if (!username || !password || !email) {
//     return res
//       .status(400)
//       .json({ message: "Username, password, and email are required." });
//   }

//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);

//     const sql =
//       "INSERT INTO users(username, password, email, role) VALUES (?,?,?,?)";
//     DB2.run(
//       sql,
//       [username, hashedPassword, email, role || "user"],
//       function (err) {
//         if (err) {
//           console.error("Error during user registration:", err.message);
//           if (
//             err.message.includes(
//               "SQLITE_CONSTRAINT: UNIQUE constraint failed: users.username"
//             ) ||
//             err.message.includes(
//               "SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email"
//             )
//           ) {
//             return res
//               .status(409)
//               .json({ message: "Username or email already exists." });
//           }
//           return res.status(500).json({ message: "Error registering user." });
//         }
//         res.status(201).json({
//           message: "User registered successfully!",
//           userId: this.lastID,
//         });
//       }
//     );
//   } catch (error) {
//     console.error("Server error during registration:", error);
//     res.status(500).json({ message: "Server error during registration." });
//   }
// });

// // User Login (Corrected to use bcrypt and JWT)
// app.post("/api/users/login", async (req, res) => {
//   const { username, password } = req.body;

//   if (!username || !password) {
//     return res
//       .status(400)
//       .json({ message: "Username and password are required." });
//   }

//   DB2.get(
//     "SELECT * FROM users WHERE username = ?",
//     [username],
//     async (err, user) => {
//       if (err) {
//         console.error("Error during login (DB query):", err.message);
//         return res.status(500).json({ message: "Server error during login." });
//       }
//       if (!user) {
//         return res
//           .status(401)
//           .json({ message: "Invalid username or password." });
//       }

//       try {
//         const isMatch = await bcrypt.compare(password, user.password);

//         if (!isMatch) {
//           return res
//             .status(401)
//             .json({ message: "Invalid username or password." });
//         }

//         const token = jwt.sign(
//           { id: user.user_id, username: user.username, role: user.role },
//           JWT_SECRET,
//           { expiresIn: "1h" }
//         );

//         res.status(200).json({
//           message: `Welcome back, ${user.username}!`,
//           token: token,
//           user: { id: user.user_id, username: user.username, role: user.role },
//         });
//       } catch (error) {
//         console.error(
//           "Error during password comparison or JWT generation:",
//           error
//         );
//         res.status(500).json({ message: "Server error during login." });
//       }
//     }
//   );
// });

// // Example of a Protected Route (only accessible with a valid JWT)
// app.get("/api/users/profile", authenticateToken, (req, res) => {
//   res.status(200).json({
//     message: `Hello ${req.user.username}, this is your protected profile data!`,
//     user: req.user,
//     accessTime: new Date().toISOString(),
//   });
// });

// // Other user API endpoints (might need protection too)
// app.get("/api/users", authenticateToken, (req, res) => {
//   res.set("content-type", "application/json");
//   const sql = "SELECT user_id, username, email, role FROM users";
//   let data = { users: [] };
//   try {
//     DB2.all(sql, [], (err, rows) => {
//       if (err) {
//         console.error("Error fetching users:", err.message);
//         return res.status(500).json({ code: 500, status: err.message });
//       }
//       rows.forEach((row) => {
//         data.users.push({
//           user_id: row.user_id,
//           username: row.username,
//           email: row.email,
//           role: row.role,
//         });
//       });
//       res.json(data);
//     });
//   } catch (err) {
//     console.error("Catch error fetching users:", err.message);
//     res.status(500).json({ code: 500, status: err.message });
//   }
// });

// app.delete("/api/users", authenticateToken, (req, res) => {
//   res.set("content-type", "application/json");
//   const sql = "DELETE FROM users WHERE user_id = ?";
//   try {
//     DB2.run(sql, [req.query.user_id], function (err) {
//       if (err) {
//         console.error("Error deleting user:", err.message);
//         return res.status(500).json({ code: 500, status: err.message });
//       }
//       if (this.changes === 1) {
//         res.status(200).json({
//           code: 200,
//           message: `User ${req.query.user_id} was deleted.`,
//         });
//       } else {
//         res
//           .status(404)
//           .json({ code: 404, message: "User not found or no operation done." });
//       }
//     });
//   } catch (err) {
//     console.error("Catch error deleting user:", err.message);
//     res.status(500).json({ code: 500, status: err.message });
//   }
// });

// app.get("/api/posts", authenticateToken, (req, res) => {
//   res.set("content-type", "application/json");
//   const sql = "SELECT * FROM posts";
//   let data = { posts: [] };
//   try {
//     DB3.all(sql, [], (err, rows) => {
//       if (err) {
//         console.error("Error fetching posts:", err.message);
//         return res.status(500).json({ code: 500, status: err.message });
//       }
//       rows.forEach((row) => {
//         data.posts.push({
//           post_id: row.post_id,
//           user_id: row.user_id,
//           content: row.content,
//           created_at: row.created_at,
//         });
//       });
//       res.json(data);
//     });
//   } catch (err) {
//     console.error("Catch error fetching posts:", err.message);
//     res.status(500).json({ code: 500, status: err.message });
//   }
// });

// app.post("/api/posts", authenticateToken, (req, res) => {
//   res.set("content-type", "application/json");
//   const sql = "INSERT INTO posts(user_id, content) VALUES (?, ?)";
//   try {
//     DB3.run(sql, [req.user.id, req.body.content], function (err) {
//       if (err) {
//         console.error("Error inserting new post:", err.message);
//         return res.status(500).json({ code: 500, status: err.message });
//       }
//       res
//         .status(201)
//         .json({ status: 201, message: `New post ${this.lastID} saved.` });
//     });
//   } catch (err) {
//     console.error("Catch error inserting post", err.message);
//     res.status(500).json({ code: 500, status: err.message });
//   }
// });

// app.listen(PORT, (err) => {
//   if (err) {
//     console.log("ERROR:", err.message);
//   }
//   console.log(`LISTENING on port ${PORT}`);
// });

// *************** new code ****************

import pool from "./connect.js"; // Import the PostgreSQL connection pool
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

app.options("*", cors());
app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

app.use("/uploads", express.static(path.resolve("uploads")));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
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
      cb(new Error("Error: Images Only Please!"));
    }
  },
});

// --- NEW ROUTE: Upload Artist Image ---
app.post(
  "/api/upload-artist-image",
  authenticateToken,
  upload.single("artistImage"),
  (req, res) => {
    if (req.file) {
      const imageUrl = `/uploads/${req.file.filename}`;
      res.status(200).json({
        message: "Image uploaded successfully!",
        imageUrl: imageUrl,
        fileName: req.file.filename,
      });
    } else {
      res
        .status(400)
        .json({ message: "No file uploaded or file type not supported." });
    }
  },
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      console.error("Multer Error:", err);
      return res.status(400).json({ message: err.message });
    } else if (err) {
      console.error("General Upload Error:", err);
      return res.status(400).json({ message: err.message || err });
    }
    next();
  }
);

// --- Artist API Endpoints ---
app.get("/api", async (req, res) => {
  res.set("content-type", "application/json");
  // For PostgreSQL, artist_id is typically a SERIAL primary key
  const sql = "SELECT * FROM artists";
  try {
    const result = await pool.query(sql);
    let data = { artists: [] };
    result.rows.forEach((row) => {
      data.artists.push({
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
        image_url: row.image_url,
      });
    });
    res.json(data);
  } catch (err) {
    console.error("Error fetching artists:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.put("/api/artists/:artist_id/clout", async (req, res) => {
  const artistId = req.params.artist_id;

  if (!artistId) {
    return res.status(400).json({ message: "Artist ID is required." });
  }

  const sql = "UPDATE artists SET count = count + 1 WHERE artist_id = $1";
  try {
    const result = await pool.query(sql, [artistId]);
    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: `Artist with ID ${artistId} not found.` });
    }
    res.json({
      message: "Clout updated successfully",
      artist_id: artistId,
      changes: result.rowCount, // Equivalent to this.changes in SQLite
    });
  } catch (err) {
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
});

app.post("/api", async (req, res) => {
  res.set("content-type", "application/json");
  // For PostgreSQL, use RETURNING artist_id to get the newly inserted ID
  const sql =
    "INSERT INTO artists(artist_name, aka, genre, count, state, region, label, mixtape, album, year, certifications, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING artist_id";
  try {
    const result = await pool.query(sql, [
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
    ]);
    const newArtistId = result.rows[0].artist_id; // Get the ID from the returned row
    res
      .status(201)
      .json({ status: 201, message: `New artist ${newArtistId} saved.` });
  } catch (err) {
    console.error("Error inserting new artist:", err.message);
    // Check for unique constraint violation
    if (err.code === "23505") {
      // PostgreSQL unique violation error code
      return res.status(409).json({
        message: "Artist with this name already exists.",
        error: err.message,
      });
    }
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.delete("/api", async (req, res) => {
  res.set("content-type", "application/json");
  const sql = "DELETE FROM artists WHERE artist_id = $1";
  try {
    const result = await pool.query(sql, [req.query.artist_id]);
    if (result.rowCount === 1) {
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
  } catch (err) {
    console.error("Error deleting Artist", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

// ---User Authentication and Management API---
app.post("/api/users/register", async (req, res) => {
  const { username, password, email, role } = req.body;

  if (!username || !password || !email) {
    return res
      .status(400)
      .json({ message: "Username, password, and email are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql =
      "INSERT INTO users(username, password, email, role) VALUES ($1,$2,$3,$4) RETURNING user_id";
    const result = await pool.query(sql, [
      username,
      hashedPassword,
      email,
      role || "user",
    ]);
    const newUserId = result.rows[0].user_id;

    res.status(201).json({
      message: "User registered successfully!",
      userId: newUserId,
    });
  } catch (error) {
    console.error("Error during user registration:", error.message);
    if (error.code === "23505") {
      // PostgreSQL unique violation error code
      return res
        .status(409)
        .json({ message: "Username or email already exists." });
    }
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

  const sql = "SELECT * FROM users WHERE username = $1";
  try {
    const result = await pool.query(sql, [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: user.user_id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: `Welcome back, ${user.username}!`,
      token: token,
      user: { id: user.user_id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error("Error during login:", error.message);
    res.status(500).json({ message: "Server error during login." });
  }
});

// Example of a Protected Route (only accessible with a valid JWT)
app.get("/api/users/profile", authenticateToken, (req, res) => {
  res.status(200).json({
    message: `Hello ${req.user.username}, this is your protected profile data!`,
    user: req.user,
    accessTime: new Date().toISOString(),
  });
});

// Other user API endpoints (might need protection too)
app.get("/api/users", authenticateToken, async (req, res) => {
  res.set("content-type", "application/json");
  const sql = "SELECT user_id, username, email, role FROM users";
  try {
    const result = await pool.query(sql);
    let data = { users: [] };
    result.rows.forEach((row) => {
      data.users.push({
        user_id: row.user_id,
        username: row.username,
        email: row.email,
        role: row.role,
      });
    });
    res.json(data);
  } catch (err) {
    console.error("Error fetching users:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.delete("/api/users", authenticateToken, async (req, res) => {
  res.set("content-type", "application/json");
  const sql = "DELETE FROM users WHERE user_id = $1";
  try {
    const result = await pool.query(sql, [req.query.user_id]);
    if (result.rowCount === 1) {
      res.status(200).json({
        code: 200,
        message: `User ${req.query.user_id} was deleted.`,
      });
    } else {
      res
        .status(404)
        .json({ code: 404, message: "User not found or no operation done." });
    }
  } catch (err) {
    console.error("Error deleting user:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.get("/api/posts", authenticateToken, async (req, res) => {
  res.set("content-type", "application/json");
  const sql = "SELECT * FROM posts";
  try {
    const result = await pool.query(sql);
    let data = { posts: [] };
    result.rows.forEach((row) => {
      data.posts.push({
        post_id: row.post_id,
        user_id: row.user_id,
        content: row.content,
        created_at: row.created_at,
      });
    });
    res.json(data);
  } catch (err) {
    console.error("Error fetching posts:", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.post("/api/posts", authenticateToken, async (req, res) => {
  res.set("content-type", "application/json");
  const sql =
    "INSERT INTO posts(user_id, content) VALUES ($1, $2) RETURNING post_id";
  try {
    const result = await pool.query(sql, [req.user.id, req.body.content]);
    const newPostId = result.rows[0].post_id;
    res
      .status(201)
      .json({ status: 201, message: `New post ${newPostId} saved.` });
  } catch (err) {
    console.error("Error inserting post", err.message);
    res.status(500).json({ code: 500, status: err.message });
  }
});

app.listen(PORT, (err) => {
  if (err) {
    console.log("ERROR:", err.message);
  }
  console.log(`LISTENING on port ${PORT}`);
});
