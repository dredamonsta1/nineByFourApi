import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import multerCloudinary from "multer-storage-cloudinary";
const { CloudinaryStorage } = multerCloudinary;

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

//-------Cloudinary Image Storage -------
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "9by4/images",
    allowed_formats: ["jpeg", "jpg", "png", "gif"],
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  },
});

export const upload = multer({
  storage: imageStorage,
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

//-------Cloudinary Video Storage -------
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "9by4/videos",
    resource_type: "video",
    allowed_formats: ["mp4", "webm", "mov", "avi"],
  },
});

export const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|webm|mov|avi/;
    const mimetypes = /video\/mp4|video\/webm|video\/quicktime|video\/x-msvideo/;
    const mimetype = mimetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Error: Video files only (mp4, webm, mov, avi)!"));
    }
  },
});

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
