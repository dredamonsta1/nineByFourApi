import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mock the database pool
vi.mock("../../src/connect.js", () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock the middleware
vi.mock("../../src/middleware.js", () => ({
  authenticateToken: vi.fn((req, res, next) => {
    // Default: authenticated user with id property
    req.user = { id: 1, username: "testuser", role: "user" };
    next();
  }),
}));

import profileListRouter from "../../src/routes/profileListRoutes.js";
import { pool } from "../../src/connect.js";
import { authenticateToken } from "../../src/middleware.js";

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/profile", profileListRouter);
  return app;
};

describe("Profile List Routes", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
    // Reset to default authenticated user
    authenticateToken.mockImplementation((req, res, next) => {
      req.user = { id: 1, username: "testuser", role: "user" };
      next();
    });
  });

  describe("GET /api/profile/list", () => {
    it("should fetch the authenticated user's curated artist list", async () => {
      const mockArtistList = [
        {
          artist_id: 1,
          artist_name: "Artist 1",
          aka: "A1",
          genre: "Hip Hop",
          count: 100,
          state: "California",
          region: "West Coast",
          label: "Label 1",
          image_url: "/uploads/artist1.jpg",
        },
        {
          artist_id: 2,
          artist_name: "Artist 2",
          aka: "A2",
          genre: "R&B",
          count: 50,
          state: "New York",
          region: "East Coast",
          label: "Label 2",
          image_url: "/uploads/artist2.jpg",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockArtistList });

      const response = await request(app)
        .get("/api/profile/list")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(200);
      expect(response.body.list).toEqual(mockArtistList);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN user_profile_artists"),
        [1]
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY a.count DESC"),
        [1]
      );
    });

    it("should return empty list when user has no artists", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get("/api/profile/list")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(200);
      expect(response.body.list).toEqual([]);
    });

    it("should return artists ordered by count DESC", async () => {
      const mockArtistList = [
        {
          artist_id: 3,
          artist_name: "Most Popular",
          count: 1000,
        },
        {
          artist_id: 1,
          artist_name: "Medium Popular",
          count: 500,
        },
        {
          artist_id: 2,
          artist_name: "Least Popular",
          count: 100,
        },
      ];

      pool.query.mockResolvedValue({ rows: mockArtistList });

      const response = await request(app)
        .get("/api/profile/list")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(200);
      expect(response.body.list[0].count).toBe(1000);
      expect(response.body.list[1].count).toBe(500);
      expect(response.body.list[2].count).toBe(100);
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app).get("/api/profile/list");

      expect(response.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should only return artists for the authenticated user", async () => {
      const userId = 42;
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: userId, username: "specificuser", role: "user" };
        next();
      });

      pool.query.mockResolvedValue({ rows: [] });

      await request(app)
        .get("/api/profile/list")
        .set("Authorization", "Bearer validtoken123");

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [userId]);
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app)
        .get("/api/profile/list")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(500);
      expect(response.body.message).toBe("Server error");
    });

    it("should handle large artist lists", async () => {
      const largeArtistList = Array.from({ length: 100 }, (_, i) => ({
        artist_id: i + 1,
        artist_name: `Artist ${i + 1}`,
        count: 100 - i,
      }));

      pool.query.mockResolvedValue({ rows: largeArtistList });

      const response = await request(app)
        .get("/api/profile/list")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(200);
      expect(response.body.list).toHaveLength(100);
    });

    it("should include all artist fields in response", async () => {
      const mockArtist = {
        artist_id: 1,
        artist_name: "Complete Artist",
        aka: "CA",
        genre: "Hip Hop",
        count: 75,
        state: "Texas",
        region: "South",
        label: "Test Label",
        image_url: "/uploads/complete.jpg",
      };

      pool.query.mockResolvedValue({ rows: [mockArtist] });

      const response = await request(app)
        .get("/api/profile/list")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(200);
      expect(response.body.list[0]).toEqual(mockArtist);
    });
  });

  describe("POST /api/profile/list/:artistId", () => {
    it("should add an artist to the user's profile list", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Artist added to profile list.");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO user_profile_artists"),
        [1, "5"]
      );
    });

    it("should use ON CONFLICT to prevent duplicate entries", async () => {
      pool.query.mockResolvedValue({ rowCount: 0 }); // No rows inserted (conflict)

      const response = await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("Artist added to profile list.");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT (user_id, artist_id) DO NOTHING"),
        [1, "5"]
      );
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app).post("/api/profile/list/5");

      expect(response.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should associate artist with authenticated user", async () => {
      const userId = 99;
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: userId, username: "uniqueuser", role: "user" };
        next();
      });

      pool.query.mockResolvedValue({ rowCount: 1 });

      await request(app)
        .post("/api/profile/list/10")
        .set("Authorization", "Bearer validtoken123");

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
        userId,
        "10",
      ]);
    });

    it("should handle adding multiple different artists", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const artistIds = [1, 2, 3, 4, 5];
      for (const artistId of artistIds) {
        const response = await request(app)
          .post(`/api/profile/list/${artistId}`)
          .set("Authorization", "Bearer validtoken123");

        expect(response.status).toBe(201);
      }

      expect(pool.query).toHaveBeenCalledTimes(artistIds.length);
    });

    it("should handle adding the same artist twice gracefully", async () => {
      pool.query
        .mockResolvedValueOnce({ rowCount: 1 }) // First time: inserted
        .mockResolvedValueOnce({ rowCount: 0 }); // Second time: conflict, nothing inserted

      const response1 = await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer validtoken123");

      const response2 = await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer validtoken123");

      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(500);
      expect(response.body.message).toBe("Server error");
    });

    it("should handle foreign key constraint errors", async () => {
      const fkError = new Error("violates foreign key constraint");
      fkError.code = "23503";
      pool.query.mockRejectedValue(fkError);

      const response = await request(app)
        .post("/api/profile/list/999")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(500);
      expect(response.body.message).toBe("Server error");
    });

    it("should handle invalid artist IDs", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/profile/list/abc")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(201);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [1, "abc"]);
    });

    it("should handle numeric string artist IDs", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/profile/list/123")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(201);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [1, "123"]);
    });

    it("should handle very large artist IDs", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/profile/list/999999999")
        .set("Authorization", "Bearer validtoken123");

      expect(response.status).toBe(201);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
        1,
        "999999999",
      ]);
    });
  });

  describe("Different User Scenarios", () => {
    it("should keep artist lists separate for different users", async () => {
      // User 1 adds artist
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 1, username: "user1", role: "user" };
        next();
      });

      pool.query.mockResolvedValue({ rowCount: 1 });

      await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer user1token");

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [1, "5"]);

      // User 2 adds same artist
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "user2", role: "user" };
        next();
      });

      pool.query.mockResolvedValue({ rowCount: 1 });

      await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer user2token");

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [2, "5"]);
    });

    it("should handle admin users adding to their list", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 10, username: "admin", role: "admin" };
        next();
      });

      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/profile/list/5")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(201);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [10, "5"]);
    });
  });
});
