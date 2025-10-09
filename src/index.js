import { pool, createTables } from "./connect.js"; // Import the PostgreSQL connection pool and createTables
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";

import artistsRouter from "./routes/artists.js";
import usersRouter from "./routes/users.js";
import postsRouter from "./routes/posts.js";
import profileListRoutes from "./routes/profileListRoutes.js";
import imagePostsRouter from "./routes/imagePosts.js";
import artApi from "./routes/artApi.js";
import waitlistRouter from "./routes/waitlist.js";

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

app.use("/api/artists", artistsRouter);
app.use("/api/users", usersRouter);
app.use("/api/posts", postsRouter);
app.use("/api/profile", profileListRoutes);
app.use("/api/image-posts", imagePostsRouter);
app.use("/api/art", artApi);
app.use("/api/waitlist", waitlistRouter);

const startServer = async () => {
  try {
    await createTables(); // Ensure tables are created before starting the server
    app.listen(PORT, () => {
      console.log(`LISTENING on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1); // Exit if server fails to start due to DB issues
  }
};
startServer();
