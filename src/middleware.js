import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";
import { pool } from "./connect.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// --- Authentication Middleware ---
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res.status(401).json({ message: "Authentication token required." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      if (err.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ message: "Authentication token expired." });
      }
      if (err.name === "JsonWebTokenError") {
        return res
          .status(403)
          .json({ message: "Invalid Authentication token." });
      }
      return res.status(403).json({ message: "Invalid or expired token." });
    }
    req.user = user;
    next();
  });
};

// --- Cloudinary upload helper ---
const streamUpload = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    Readable.from(buffer).pipe(stream);
  });

// --- Image upload (memory → Cloudinary) ---
const imageMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Error: Images Only Please!"));
  },
});

export const upload = {
  single: (fieldName) => (req, res, next) => {
    imageMulter.single(fieldName)(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file) return next();
      try {
        const result = await streamUpload(req.file.buffer, {
          folder: "9by4/images",
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        });
        req.file.path = result.secure_url;
        next();
      } catch (uploadErr) {
        console.error("Cloudinary image upload error:", uploadErr.message || uploadErr);
        next(uploadErr);
      }
    });
  },
};

// --- Video upload (memory → Cloudinary) ---
const videoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|webm|mov|avi/;
    const mimetypes = /video\/mp4|video\/webm|video\/quicktime|video\/x-msvideo/;
    if (mimetypes.test(file.mimetype) && filetypes.test(path.extname(file.originalname).toLowerCase())) {
      return cb(null, true);
    }
    cb(new Error("Error: Video files only (mp4, webm, mov, avi)!"));
  },
});

export const videoUpload = {
  single: (fieldName) => (req, res, next) => {
    videoMulter.single(fieldName)(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file) return next();
      try {
        const result = await streamUpload(req.file.buffer, {
          folder: "9by4/videos",
          resource_type: "video",
        });
        req.file.path = result.secure_url;
        next();
      } catch (uploadErr) {
        next(uploadErr);
      }
    });
  },
};

// --- Audio upload (memory → Cloudinary) ---
const audioMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /mp3|wav|flac|m4a|ogg/;
    const mimetypes = /audio\/mpeg|audio\/wav|audio\/flac|audio\/mp4|audio\/ogg|audio\/x-m4a/;
    if (mimetypes.test(file.mimetype) && filetypes.test(path.extname(file.originalname).toLowerCase())) {
      return cb(null, true);
    }
    cb(new Error("Error: Audio files only (mp3, wav, flac, m4a, ogg)!"));
  },
});

export const audioUpload = {
  single: (fieldName) => (req, res, next) => {
    audioMulter.single(fieldName)(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file) return next();
      try {
        const result = await streamUpload(req.file.buffer, {
          folder: "9by4/audio",
          resource_type: "auto",
        });
        req.file.path = result.secure_url;
        next();
      } catch (uploadErr) {
        next(uploadErr);
      }
    });
  },
};

// --- Agent authentication middleware ---
export const authenticateAgent = async (req, res, next) => {
  const key = req.headers["x-agent-key"];
  if (!key) return res.status(401).json({ message: "X-Agent-Key header required." });

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  try {
    const result = await pool.query(
      "SELECT * FROM agents WHERE agent_key_hash = $1",
      [hash]
    );
    if (result.rows.length === 0) return res.status(401).json({ message: "Invalid agent key." });
    const agent = result.rows[0];
    if (agent.status === "suspended") return res.status(403).json({ message: "Agent suspended." });
    if (agent.status === "rate_limited") return res.status(429).json({ message: "Agent rate limited." });
    req.agent = agent;
    next();
  } catch (err) {
    console.error("Agent auth error:", err);
    res.status(500).json({ message: "Authentication error." });
  }
};

// Multer error handler middleware
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("Multer Error:", err);
    return res.status(400).json({ message: err.message });
  } else if (err) {
    console.error("General Upload Error:", err);
    return res.status(400).json({ message: err.message || err });
  }
  next();
};
