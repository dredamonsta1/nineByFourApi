import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import artistsRouter from "../../src/routes/artists.js";

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
    // Default mock: authenticated regular user
    req.user = { user_id: 1, username: "testuser", role: "user" };
    next();
  }),
  upload: {
    single: vi.fn(() => (req, res, next) => {
      // Mock file upload
      req.file = {
        filename: "test-image.jpg",
        path: "/uploads/test-image.jpg",
      };
      next();
    }),
  },
  handleMulterError: vi.fn((req, res, next) => next()),
}));

import { pool } from "../../src/connect.js";
import { authenticateToken } from "../../src/middleware.js";

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/artists", artistsRouter);
  return app;
};

describe("Artists API Routes", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe("GET /api/artists", () => {
    it("should return all artists with their albums", async () => {
      const mockArtists = [
        {
          artist_id: 1,
          artist_name: "Test Artist 1",
          aka: "TA1",
          genre: "Hip Hop",
          count: 5,
          state: "California",
          region: "West Coast",
          label: "Test Label",
          image_url: "/uploads/artist1.jpg",
          albums: [
            { album_id: 1, album_name: "Album 1", year: 2023 },
            { album_id: 2, album_name: "Album 2", year: 2022 },
          ],
        },
        {
          artist_id: 2,
          artist_name: "Test Artist 2",
          aka: "TA2",
          genre: "R&B",
          count: 3,
          albums: [],
        },
      ];

      pool.query.mockResolvedValue({ rows: mockArtists });

      const response = await request(app).get("/api/artists");

      expect(response.status).toBe(200);
      expect(response.body.artists).toEqual(mockArtists);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT")
      );
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database connection failed"));

      const response = await request(app).get("/api/artists");

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("status");
    });
  });

  describe("GET /api/artists/:artist_id", () => {
    it("should return a specific artist with albums", async () => {
      const mockArtist = {
        artist_id: 1,
        artist_name: "Test Artist",
        albums: [{ album_id: 1, album_name: "Test Album", year: 2023 }],
      };

      pool.query.mockResolvedValue({ rows: [mockArtist], rowCount: 1 });

      const response = await request(app).get("/api/artists/1");

      expect(response.status).toBe(200);
      expect(response.body.artist).toEqual(mockArtist);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE a.artist_id = $1"),
        ["1"]
      );
    });

    it("should return 404 when artist not found", async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app).get("/api/artists/999");

      expect(response.status).toBe(404);
      expect(response.body.message).toContain("not found");
    });
  });

  describe("POST /api/artists", () => {
    it("should create a new artist", async () => {
      const newArtistData = {
        artist_name: "New Artist",
        aka: "NA",
        genre: "Hip Hop",
        state: "New York",
        region: "East Coast",
        label: "New Label",
        image_url: "/uploads/new-artist.jpg",
      };

      const mockCreatedArtist = {
        artist_id: 1,
        ...newArtistData,
      };

      pool.query.mockResolvedValue({ rows: [mockCreatedArtist] });

      const response = await request(app)
        .post("/api/artists")
        .send(newArtistData);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain("New artist");
      expect(response.body.artist).toEqual(mockCreatedArtist);
    });

    it("should return 409 when artist name already exists", async () => {
      const duplicateError = new Error("Duplicate key");
      duplicateError.code = "23505";
      duplicateError.detail = "Key (artist_name) already exists";

      pool.query.mockRejectedValue(duplicateError);

      const response = await request(app).post("/api/artists").send({
        artist_name: "Existing Artist",
      });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain("already exists");
    });
  });

  describe("POST /api/artists/:artist_id/albums", () => {
    it("should add a single album to an artist", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ album_id: 1, album_name: "New Album", year: 2024 }],
        }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      pool.connect.mockResolvedValue(mockClient);

      const albumData = {
        album_name: "New Album",
        year: 2024,
        certifications: "Gold",
      };

      const response = await request(app)
        .post("/api/artists/1/albums")
        .send(albumData);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain("Successfully added 1 album");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should add multiple albums to an artist", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ album_id: 1, album_name: "Album 1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ album_id: 2, album_name: "Album 2" }],
        })
        .mockResolvedValueOnce({}); // COMMIT

      pool.connect.mockResolvedValue(mockClient);

      const albumsData = [
        { album_name: "Album 1", year: 2024 },
        { album_name: "Album 2", year: 2023 },
      ];

      const response = await request(app)
        .post("/api/artists/1/albums")
        .send(albumsData);

      expect(response.status).toBe(201);
      expect(response.body.message).toContain("Successfully added 2 album(s)");
      expect(response.body.albums).toHaveLength(2);
    });

    it("should return 400 if album_name is missing", async () => {
      const response = await request(app)
        .post("/api/artists/1/albums")
        .send({ year: 2024 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("must have an album_name");
    });

    it("should rollback transaction on error", async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error("Insert failed")); // INSERT fails

      pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post("/api/artists/1/albums")
        .send({ album_name: "Test Album" });

      expect(response.status).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("PUT /api/artists/:artist_id/albums/:album_id", () => {
    beforeEach(() => {
      // Mock admin user for these tests
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 1, username: "admin", role: "admin" };
        next();
      });
    });

    it("should update an album", async () => {
      const updatedAlbum = {
        album_id: 1,
        album_name: "Updated Album",
        year: 2024,
        certifications: "Platinum",
      };

      pool.query.mockResolvedValue({ rows: [updatedAlbum], rowCount: 1 });

      const response = await request(app)
        .put("/api/artists/1/albums/1")
        .send({ album_name: "Updated Album", year: 2024 });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("updated successfully");
      expect(response.body.album).toEqual(updatedAlbum);
    });

    it("should return 403 for non-admin users", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app)
        .put("/api/artists/1/albums/1")
        .send({ album_name: "Updated Album" });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain("Permission denied");
    });

    it("should return 400 if no fields to update", async () => {
      const response = await request(app)
        .put("/api/artists/1/albums/1")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("At least one field");
    });

    it("should return 404 if album not found", async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .put("/api/artists/1/albums/999")
        .send({ album_name: "Updated Album" });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain("not found");
    });
  });

  describe("DELETE /api/artists/:artist_id/albums/:album_id", () => {
    beforeEach(() => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 1, username: "admin", role: "admin" };
        next();
      });
    });

    it("should delete an album", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app).delete("/api/artists/1/albums/1");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("was deleted");
    });

    it("should return 403 for non-admin users", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app).delete("/api/artists/1/albums/1");

      expect(response.status).toBe(403);
      expect(response.body.message).toContain("Permission denied");
    });

    it("should return 404 if album not found", async () => {
      pool.query.mockResolvedValue({ rowCount: 0 });

      const response = await request(app).delete("/api/artists/1/albums/999");

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/artists/:artist_id", () => {
    beforeEach(() => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 1, username: "admin", role: "admin" };
        next();
      });
    });

    it("should update artist details", async () => {
      const updatedArtist = {
        artist_id: 1,
        artist_name: "Updated Artist",
        genre: "Pop",
      };

      pool.query.mockResolvedValue({ rows: [updatedArtist], rowCount: 1 });

      const response = await request(app)
        .put("/api/artists/1")
        .send({ artist_name: "Updated Artist", genre: "Pop" });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("updated successfully");
      expect(response.body.artist).toEqual(updatedArtist);
    });

    it("should return 403 for non-admin users", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app)
        .put("/api/artists/1")
        .send({ artist_name: "Updated Artist" });

      expect(response.status).toBe(403);
    });

    it("should return 400 if no valid fields provided", async () => {
      const response = await request(app)
        .put("/api/artists/1")
        .send({ invalid_field: "value" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("No valid fields");
    });
  });

  describe("PUT /api/artists/:artist_id/clout", () => {
    it("should increment artist clout count", async () => {
      pool.query.mockResolvedValue({ rows: [{ count: 6 }], rowCount: 1 });

      const response = await request(app).put("/api/artists/1/clout");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("Clout updated successfully");
      expect(response.body.new_clout_count).toBe(6);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("count = count + 1"),
        ["1"]
      );
    });

    it("should return 404 if artist not found", async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app).put("/api/artists/999/clout");

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/artists/:artist_id", () => {
    beforeEach(() => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 1, username: "admin", role: "admin" };
        next();
      });
    });

    it("should delete an artist", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app).delete("/api/artists/1");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("was deleted");
    });

    it("should return 403 for non-admin users", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { user_id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app).delete("/api/artists/1");

      expect(response.status).toBe(403);
      expect(response.body.message).toContain("Permission denied");
    });

    it("should return 404 if artist not found", async () => {
      pool.query.mockResolvedValue({ rowCount: 0 });

      const response = await request(app).delete("/api/artists/999");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/artists/upload-image", () => {
    it("should upload an image successfully", async () => {
      const response = await request(app)
        .post("/api/artists/upload-image")
        .attach("artistImage", Buffer.from("fake image"), "test.jpg");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("uploaded successfully");
      expect(response.body.imageUrl).toContain("/uploads/");
    });
  });

  describe("PUT /api/artists/:artist_id/image", () => {
    it("should update artist image", async () => {
      const updatedArtist = {
        artist_id: 1,
        image_url: "/uploads/test-image.jpg",
      };

      pool.query.mockResolvedValue({ rows: [updatedArtist], rowCount: 1 });

      const response = await request(app)
        .put("/api/artists/1/image")
        .attach("artistImage", Buffer.from("fake image"), "test.jpg");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("updated successfully");
    });

    it("should return 404 if artist not found", async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .put("/api/artists/999/image")
        .attach("artistImage", Buffer.from("fake image"), "test.jpg");

      expect(response.status).toBe(404);
    });
  });
});
