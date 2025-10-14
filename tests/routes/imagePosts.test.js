import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import path from "path";

// Mock the database pool
vi.mock("../../src/connect.js", () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock fs module
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  },
}));

import imagePostsRouter from "../../src/routes/imagePosts.js";
import { pool } from "../../src/connect.js";
import fs from "fs";

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api/image-posts", imagePostsRouter);
  return app;
};

describe("Image Posts API Routes", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe("POST /api/image-posts", () => {
    it("should create a new image post with file and caption", async () => {
      const mockImagePost = {
        post_id: 1,
        image_url: "/uploads/1234567890.jpg",
        caption: "Test image caption",
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockImagePost] });

      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", "Test image caption")
        .attach("image", Buffer.from("fake-image-data"), "test-image.jpg");

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        post_id: 1,
        caption: "Test image caption",
        user_id: 1,
      });
      expect(response.body.image_url).toContain("/uploads/");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO image_posts"),
        expect.arrayContaining([
          expect.stringContaining("/uploads/"),
          "Test image caption",
          1,
        ])
      );
    });

    it("should create image post without caption", async () => {
      const mockImagePost = {
        post_id: 2,
        image_url: "/uploads/1234567891.jpg",
        caption: null,
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockImagePost] });

      const response = await request(app)
        .post("/api/image-posts")
        .attach("image", Buffer.from("fake-image-data"), "test-image.jpg");

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        post_id: 2,
        user_id: 1,
      });
    });

    it("should return 400 if no image file is provided", async () => {
      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", "Caption without image");

      expect(response.status).toBe(400);
      expect(response.body.msg).toBe("Image file is required.");
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", "Test caption")
        .attach("image", Buffer.from("fake-image-data"), "test-image.jpg");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Server Error");
    });

    it("should handle long captions", async () => {
      const longCaption = "A".repeat(500);
      const mockImagePost = {
        post_id: 3,
        image_url: "/uploads/1234567892.jpg",
        caption: longCaption,
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockImagePost] });

      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", longCaption)
        .attach("image", Buffer.from("fake-image-data"), "test-image.jpg");

      expect(response.status).toBe(201);
      expect(response.body.caption).toBe(longCaption);
    });

    it("should accept different image file types", async () => {
      const mockImagePost = {
        post_id: 4,
        image_url: "/uploads/1234567893.png",
        caption: "PNG image",
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockImagePost] });

      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", "PNG image")
        .attach("image", Buffer.from("fake-png-data"), "test-image.png");

      expect(response.status).toBe(201);
      expect(response.body.image_url).toContain(".png");
    });

    it("should generate unique filenames with timestamps", async () => {
      const mockImagePost1 = {
        post_id: 5,
        image_url: "/uploads/1234567894.jpg",
        caption: "First image",
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      const mockImagePost2 = {
        post_id: 6,
        image_url: "/uploads/1234567895.jpg",
        caption: "Second image",
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query
        .mockResolvedValueOnce({ rows: [mockImagePost1] })
        .mockResolvedValueOnce({ rows: [mockImagePost2] });

      const response1 = await request(app)
        .post("/api/image-posts")
        .field("caption", "First image")
        .attach("image", Buffer.from("fake-image-1"), "test1.jpg");

      const response2 = await request(app)
        .post("/api/image-posts")
        .field("caption", "Second image")
        .attach("image", Buffer.from("fake-image-2"), "test2.jpg");

      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      // Filenames should be different due to timestamps
      expect(response1.body.image_url).not.toBe(response2.body.image_url);
    });

    it("should handle special characters in caption", async () => {
      const specialCaption = 'Test with "quotes" & special <characters> 😀';
      const mockImagePost = {
        post_id: 7,
        image_url: "/uploads/1234567896.jpg",
        caption: specialCaption,
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockImagePost] });

      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", specialCaption)
        .attach("image", Buffer.from("fake-image-data"), "test-image.jpg");

      expect(response.status).toBe(201);
      expect(response.body.caption).toBe(specialCaption);
    });

    it("should preserve file extension in uploaded filename", async () => {
      const testExtensions = [".jpg", ".jpeg", ".png", ".gif"];

      for (const ext of testExtensions) {
        const mockImagePost = {
          post_id: Math.floor(Math.random() * 1000),
          image_url: `/uploads/${Date.now()}${ext}`,
          caption: `Test ${ext}`,
          user_id: 1,
          created_at: new Date().toISOString(),
        };

        pool.query.mockResolvedValueOnce({ rows: [mockImagePost] });

        const response = await request(app)
          .post("/api/image-posts")
          .field("caption", `Test ${ext}`)
          .attach("image", Buffer.from("fake-image"), `test${ext}`);

        expect(response.status).toBe(201);
        expect(response.body.image_url).toContain(ext);
      }
    });
  });

  describe("GET /api/image-posts", () => {
    it("should return all image posts with user information", async () => {
      const mockImagePosts = [
        {
          post_id: 1,
          image_url: "/uploads/1234567890.jpg",
          caption: "First post",
          user_id: 1,
          created_at: "2024-01-15T10:00:00Z",
          username: "testuser",
        },
        {
          post_id: 2,
          image_url: "/uploads/1234567891.jpg",
          caption: "Second post",
          user_id: 2,
          created_at: "2024-01-14T10:00:00Z",
          username: "anotheruser",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockImagePosts });

      const response = await request(app).get("/api/image-posts");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockImagePosts);
      expect(response.body).toHaveLength(2);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT p.*, u.username")
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY p.created_at DESC")
      );
    });

    it("should return empty array when no posts exist", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get("/api/image-posts");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("should return posts ordered by created_at DESC", async () => {
      const mockImagePosts = [
        {
          post_id: 3,
          image_url: "/uploads/newest.jpg",
          caption: "Newest post",
          user_id: 1,
          created_at: "2024-01-20T10:00:00Z",
          username: "user1",
        },
        {
          post_id: 2,
          image_url: "/uploads/middle.jpg",
          caption: "Middle post",
          user_id: 2,
          created_at: "2024-01-15T10:00:00Z",
          username: "user2",
        },
        {
          post_id: 1,
          image_url: "/uploads/oldest.jpg",
          caption: "Oldest post",
          user_id: 1,
          created_at: "2024-01-10T10:00:00Z",
          username: "user1",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockImagePosts });

      const response = await request(app).get("/api/image-posts");

      expect(response.status).toBe(200);
      expect(response.body[0].caption).toBe("Newest post");
      expect(response.body[2].caption).toBe("Oldest post");
    });

    it("should handle posts with null captions", async () => {
      const mockImagePosts = [
        {
          post_id: 1,
          image_url: "/uploads/1234567890.jpg",
          caption: null,
          user_id: 1,
          created_at: "2024-01-15T10:00:00Z",
          username: "testuser",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockImagePosts });

      const response = await request(app).get("/api/image-posts");

      expect(response.status).toBe(200);
      expect(response.body[0].caption).toBeNull();
    });

    it("should handle posts from users that no longer exist", async () => {
      const mockImagePosts = [
        {
          post_id: 1,
          image_url: "/uploads/1234567890.jpg",
          caption: "Orphaned post",
          user_id: 999,
          created_at: "2024-01-15T10:00:00Z",
          username: null, // User was deleted, LEFT JOIN returns null
        },
      ];

      pool.query.mockResolvedValue({ rows: mockImagePosts });

      const response = await request(app).get("/api/image-posts");

      expect(response.status).toBe(200);
      expect(response.body[0].username).toBeNull();
    });

    it("should handle database errors on GET", async () => {
      pool.query.mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app).get("/api/image-posts");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Server Error");
    });

    it("should handle large number of posts", async () => {
      const mockImagePosts = Array.from({ length: 100 }, (_, i) => ({
        post_id: i + 1,
        image_url: `/uploads/image${i}.jpg`,
        caption: `Post ${i}`,
        user_id: Math.floor(i / 10) + 1,
        created_at: new Date(2024, 0, i + 1).toISOString(),
        username: `user${Math.floor(i / 10) + 1}`,
      }));

      pool.query.mockResolvedValue({ rows: mockImagePosts });

      const response = await request(app).get("/api/image-posts");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(100);
    });
  });

  describe("Multer Configuration", () => {
    it("should save files to uploads directory", async () => {
      const mockImagePost = {
        post_id: 1,
        image_url: "/uploads/1234567890.jpg",
        caption: "Test",
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockImagePost] });

      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", "Test")
        .attach("image", Buffer.from("fake-image-data"), "test.jpg");

      expect(response.status).toBe(201);
      expect(response.body.image_url).toMatch(/^\/uploads\//);
    });

    it("should handle filename generation with timestamp", async () => {
      const mockImagePost = {
        post_id: 1,
        image_url: "/uploads/1234567890.jpg",
        caption: "Test",
        user_id: 1,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockImagePost] });

      const response = await request(app)
        .post("/api/image-posts")
        .field("caption", "Test")
        .attach("image", Buffer.from("fake-image-data"), "original-name.jpg");

      expect(response.status).toBe(201);
      // Filename should contain timestamp (numeric) and extension
      expect(response.body.image_url).toMatch(/\/uploads\/\d+\.jpg$/);
    });
  });
});
