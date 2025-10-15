import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mock the database pool
vi.mock("../../src/connect.js", () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

// Mock the middleware
vi.mock("../../src/middleware.js", () => ({
  authenticateToken: vi.fn((req, res, next) => {
    req.user = { id: 1, username: "testuser", role: "user" };
    next();
  }),
}));

import postsRouter from "../../src/routes/posts.js";
import { pool } from "../../src/connect.js";
import { authenticateToken } from "../../src/middleware.js";

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/posts", postsRouter);
  return app;
};

describe("Posts API Routes", () => {
  let app;
  let mockClient;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();

    // Mock client for pool.connect()
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    pool.connect.mockResolvedValue(mockClient);

    // Reset to default authenticated user
    authenticateToken.mockImplementation((req, res, next) => {
      req.user = { id: 1, username: "testuser", role: "user" };
      next();
    });
  });

  describe("GET /api/posts", () => {
    it("should return all posts ordered by created_at DESC", async () => {
      const mockPosts = [
        {
          post_id: 2,
          user_id: 1,
          content: "Latest post",
          created_at: "2024-01-15T10:00:00Z",
        },
        {
          post_id: 1,
          user_id: 2,
          content: "Older post",
          created_at: "2024-01-14T10:00:00Z",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockPosts });

      const response = await request(app)
        .get("/api/posts")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(200);
      expect(response.body.posts).toEqual(mockPosts);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY created_at DESC")
      );
    });

    it("should return empty array when no posts exist", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get("/api/posts")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(200);
      expect(response.body.posts).toEqual([]);
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app).get("/api/posts");

      expect(response.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .get("/api/posts")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(500);
      expect(response.body.code).toBe(500);
    });

    it("should handle large number of posts", async () => {
      const largePosts = Array.from({ length: 100 }, (_, i) => ({
        post_id: i + 1,
        user_id: Math.floor(i / 10) + 1,
        content: `Post content ${i}`,
        created_at: new Date(2024, 0, i + 1).toISOString(),
      }));

      pool.query.mockResolvedValue({ rows: largePosts });

      const response = await request(app)
        .get("/api/posts")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(200);
      expect(response.body.posts).toHaveLength(100);
    });
  });

  describe("POST /api/posts", () => {
    it("should create a new post successfully", async () => {
      const mockNewPost = {
        post_id: 1,
        user_id: 1,
        content: "This is a new post",
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockNewPost] });

      const response = await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "This is a new post" });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain("New post 1 saved");
      expect(response.body.post).toEqual(mockNewPost);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO posts"),
        [1, "This is a new post"]
      );
    });

    it("should return 400 if content is empty", async () => {
      const response = await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("cannot be empty");
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should return 400 if content is only whitespace", async () => {
      const response = await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "   " });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("cannot be empty");
    });

    it("should return 400 if content is missing", async () => {
      const response = await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("cannot be empty");
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app)
        .post("/api/posts")
        .send({ content: "Test post" });

      expect(response.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should associate post with authenticated user", async () => {
      const userId = 42;
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: userId, username: "specificuser", role: "user" };
        next();
      });

      const mockNewPost = {
        post_id: 1,
        user_id: userId,
        content: "Test post",
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockNewPost] });

      await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Test post" });

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
        userId,
        "Test post",
      ]);
    });

    it("should handle long content", async () => {
      const longContent = "A".repeat(5000);
      const mockNewPost = {
        post_id: 1,
        user_id: 1,
        content: longContent,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockNewPost] });

      const response = await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({ content: longContent });

      expect(response.status).toBe(201);
      expect(response.body.post.content).toBe(longContent);
    });

    it("should handle special characters in content", async () => {
      const specialContent =
        'Test with "quotes" & <html> tags 😀 #hashtag @mention';
      const mockNewPost = {
        post_id: 1,
        user_id: 1,
        content: specialContent,
        created_at: new Date().toISOString(),
      };

      pool.query.mockResolvedValue({ rows: [mockNewPost] });

      const response = await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({ content: specialContent });

      expect(response.status).toBe(201);
      expect(response.body.post.content).toBe(specialContent);
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .post("/api/posts")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Test post" });

      expect(response.status).toBe(500);
    });
  });

  describe("PUT /api/posts/:post_id", () => {
    it("should allow user to update their own post", async () => {
      const mockPost = {
        post_id: 1,
        user_id: 1,
        content: "Original content",
      };

      const updatedPost = {
        post_id: 1,
        user_id: 1,
        content: "Updated content",
        created_at: new Date().toISOString(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 }) // Check ownership
        .mockResolvedValueOnce({ rows: [updatedPost] }); // Update

      const response = await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Updated content" });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("was updated");
      expect(response.body.post.content).toBe("Updated content");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should prevent user from updating another user's post", async () => {
      const mockPost = {
        post_id: 1,
        user_id: 999, // Different user
        content: "Someone else's post",
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 });

      const response = await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Trying to update" });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Permission denied.");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should allow admin to update any post", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "admin", role: "admin" };
        next();
      });

      const mockPost = {
        post_id: 1,
        user_id: 999, // Different user
        content: "Original content",
      };

      const updatedPost = {
        post_id: 1,
        user_id: 999,
        content: "Updated by admin",
        created_at: new Date().toISOString(),
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [updatedPost] });

      const response = await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer admintoken")
        .send({ content: "Updated by admin" });

      expect(response.status).toBe(200);
      expect(response.body.post.content).toBe("Updated by admin");
    });

    it("should return 404 if post not found", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .put("/api/posts/999")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Updated content" });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Post not found.");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should return 400 if content is missing", async () => {
      const response = await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer validtoken")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Content is required.");
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app)
        .put("/api/posts/1")
        .send({ content: "Updated content" });

      expect(response.status).toBe(401);
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it("should handle database errors and release client", async () => {
      mockClient.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Updated content" });

      expect(response.status).toBe(500);
      expect(response.body.message).toContain("Failed to update post");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should release client even on error", async () => {
      mockClient.query.mockRejectedValue(new Error("Error"));

      await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Test" });

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/posts/:post_id", () => {
    it("should allow user to delete their own post", async () => {
      const mockPost = {
        post_id: 1,
        user_id: 1,
        content: "Post to delete",
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 }) // Check ownership
        .mockResolvedValueOnce({ rowCount: 1 }); // Delete

      const response = await request(app)
        .delete("/api/posts/1")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("was deleted");
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM posts"),
        ["1"]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should prevent user from deleting another user's post", async () => {
      const mockPost = {
        post_id: 1,
        user_id: 999, // Different user
        content: "Someone else's post",
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 });

      const response = await request(app)
        .delete("/api/posts/1")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Permission denied.");
      expect(mockClient.query).toHaveBeenCalledTimes(1); // Only ownership check
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should allow admin to delete any post", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "admin", role: "admin" };
        next();
      });

      const mockPost = {
        post_id: 1,
        user_id: 999, // Different user
        content: "Post to delete",
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const response = await request(app)
        .delete("/api/posts/1")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("was deleted");
    });

    it("should return 404 if post not found", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .delete("/api/posts/999")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Post not found.");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app).delete("/api/posts/1");

      expect(response.status).toBe(401);
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it("should handle database errors and release client", async () => {
      mockClient.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .delete("/api/posts/1")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(500);
      expect(response.body.message).toContain("Failed to delete post");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should release client even on error", async () => {
      mockClient.query.mockRejectedValue(new Error("Error"));

      await request(app)
        .delete("/api/posts/1")
        .set("Authorization", "Bearer validtoken");

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("Authorization and Ownership", () => {
    it("should enforce ownership for regular users on update", async () => {
      const mockPost = { post_id: 1, user_id: 5 };
      mockClient.query.mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 });

      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 10, username: "otheruser", role: "user" };
        next();
      });

      const response = await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer validtoken")
        .send({ content: "Trying to update" });

      expect(response.status).toBe(403);
    });

    it("should enforce ownership for regular users on delete", async () => {
      const mockPost = { post_id: 1, user_id: 5 };
      mockClient.query.mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 });

      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 10, username: "otheruser", role: "user" };
        next();
      });

      const response = await request(app)
        .delete("/api/posts/1")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(403);
    });

    it("should allow admin to bypass ownership checks", async () => {
      const mockPost = { post_id: 1, user_id: 999 };

      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 1, username: "admin", role: "admin" };
        next();
      });

      // Test update
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ ...mockPost, content: "Updated" }] });

      const updateResponse = await request(app)
        .put("/api/posts/1")
        .set("Authorization", "Bearer admintoken")
        .send({ content: "Updated by admin" });

      expect(updateResponse.status).toBe(200);

      // Reset mocks for delete test
      vi.clearAllMocks();
      pool.connect.mockResolvedValue(mockClient);
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 1, username: "admin", role: "admin" };
        next();
      });

      // Test delete
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPost], rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const deleteResponse = await request(app)
        .delete("/api/posts/1")
        .set("Authorization", "Bearer admintoken");

      expect(deleteResponse.status).toBe(200);
    });
  });
});
