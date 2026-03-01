import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";

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
