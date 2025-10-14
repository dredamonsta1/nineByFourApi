import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mock crypto
vi.mock("crypto", () => ({
  default: {
    randomBytes: vi.fn((size) => ({
      toString: vi.fn(() => "mock_invite_code_123456789abcdef"),
    })),
  },
}));

// Mock the database pool
vi.mock("../../src/connect.js", () => ({
  pool: {
    query: vi.fn(),
  },
}));

// Mock the middleware
vi.mock("../../src/middleware.js", () => ({
  authenticateToken: vi.fn((req, res, next) => {
    req.user = { id: 1, username: "admin", role: "admin" };
    next();
  }),
}));

import waitlistRouter, {
  isWaitlistEnabled,
} from "../../src/routes/waitlist.js";
import { pool } from "../../src/connect.js";
import { authenticateToken } from "../../src/middleware.js";

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/waitlist", waitlistRouter);
  return app;
};

describe("Waitlist API Routes", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
    // Reset to default admin user
    authenticateToken.mockImplementation((req, res, next) => {
      req.user = { id: 1, username: "admin", role: "admin" };
      next();
    });
  });

  describe("isWaitlistEnabled function", () => {
    it("should return true when waitlist is enabled", async () => {
      pool.query.mockResolvedValue({
        rows: [{ setting_value: "true" }],
      });

      const result = await isWaitlistEnabled();

      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("app_settings"),
        ["waitlist_enabled"]
      );
    });

    it("should return false when waitlist is disabled", async () => {
      pool.query.mockResolvedValue({
        rows: [{ setting_value: "false" }],
      });

      const result = await isWaitlistEnabled();

      expect(result).toBe(false);
    });

    it("should return true on database error (fail safe)", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const result = await isWaitlistEnabled();

      expect(result).toBe(true);
    });

    it("should return false when setting does not exist", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await isWaitlistEnabled();

      expect(result).toBe(false);
    });
  });

  describe("POST /api/waitlist/join", () => {
    it("should add user to waitlist successfully", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing
        .mockResolvedValueOnce({ rowCount: 1 }); // Insert

      const response = await request(app).post("/api/waitlist/join").send({
        email: "newuser@example.com",
        full_name: "New User",
      });

      expect(response.status).toBe(201);
      expect(response.body.message).toContain("Successfully added to waitlist");
      expect(response.body.email).toBe("newuser@example.com");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO waitlist"),
        ["newuser@example.com", "New User", "pending"]
      );
    });

    it("should add user without full_name", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const response = await request(app).post("/api/waitlist/join").send({
        email: "user@example.com",
      });

      expect(response.status).toBe(201);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
        "user@example.com",
        null,
        "pending",
      ]);
    });

    it("should return 400 if email is missing", async () => {
      const response = await request(app).post("/api/waitlist/join").send({
        full_name: "Test User",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Email is required");
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should return 409 if email already on waitlist", async () => {
      pool.query.mockResolvedValue({
        rows: [{ waitlist_id: 1, status: "pending" }],
      });

      const response = await request(app).post("/api/waitlist/join").send({
        email: "existing@example.com",
        full_name: "Existing User",
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain("already on waitlist");
      expect(response.body.status).toBe("pending");
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app).post("/api/waitlist/join").send({
        email: "test@example.com",
        full_name: "Test User",
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to join waitlist");
    });
  });

  describe("POST /api/waitlist/verify", () => {
    it("should verify valid invite code", async () => {
      pool.query.mockResolvedValue({
        rows: [{ email: "approved@example.com", status: "approved" }],
      });

      const response = await request(app).post("/api/waitlist/verify").send({
        invite_code: "VALID_CODE_123",
      });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.email).toBe("approved@example.com");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE invite_code = $1"),
        ["VALID_CODE_123", "approved"]
      );
    });

    it("should return 400 if invite code is missing", async () => {
      const response = await request(app).post("/api/waitlist/verify").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invite code required");
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should return 404 for invalid invite code", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).post("/api/waitlist/verify").send({
        invite_code: "INVALID_CODE",
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Invalid or expired");
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app).post("/api/waitlist/verify").send({
        invite_code: "TEST_CODE",
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Verification failed");
    });
  });

  describe("GET /api/waitlist", () => {
    it("should return all waitlist entries for admin", async () => {
      const mockEntries = [
        {
          waitlist_id: 1,
          email: "user1@example.com",
          full_name: "User One",
          status: "pending",
          requested_at: "2024-01-15T10:00:00Z",
        },
        {
          waitlist_id: 2,
          email: "user2@example.com",
          full_name: "User Two",
          status: "approved",
          requested_at: "2024-01-14T10:00:00Z",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockEntries });

      const response = await request(app)
        .get("/api/waitlist")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockEntries);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY requested_at DESC"),
        []
      );
    });

    it("should filter by status", async () => {
      const mockPendingEntries = [
        {
          waitlist_id: 1,
          email: "pending@example.com",
          status: "pending",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockPendingEntries });

      const response = await request(app)
        .get("/api/waitlist?status=pending")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPendingEntries);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status = $1"),
        ["pending"]
      );
    });

    it('should not filter when status is "all"', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      await request(app)
        .get("/api/waitlist?status=all")
        .set("Authorization", "Bearer admintoken");

      expect(pool.query).toHaveBeenCalledWith(
        expect.not.stringContaining("WHERE"),
        []
      );
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app).get("/api/waitlist");

      expect(response.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should require admin role", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app)
        .get("/api/waitlist")
        .set("Authorization", "Bearer usertoken");

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Admin access required");
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .get("/api/waitlist")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to fetch waitlist");
    });
  });

  describe("POST /api/waitlist/:id/approve", () => {
    it("should approve waitlist entry and generate invite code", async () => {
      const mockApprovedEntry = {
        waitlist_id: 1,
        email: "approved@example.com",
        status: "approved",
        invite_code: "mock_invite_code_123456789abcdef",
        approved_at: new Date().toISOString(),
        approved_by: 1,
      };

      pool.query.mockResolvedValue({
        rows: [mockApprovedEntry],
        rowCount: 1,
      });

      const response = await request(app)
        .post("/api/waitlist/1/approve")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("approved");
      expect(response.body.invite_code).toBe(
        "mock_invite_code_123456789abcdef"
      );
      expect(response.body.entry).toEqual(mockApprovedEntry);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE waitlist"),
        ["approved", "mock_invite_code_123456789abcdef", 1, "1"]
      );
    });

    it("should return 404 if entry not found", async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .post("/api/waitlist/999/approve")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("not found");
    });

    it("should require admin role", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app)
        .post("/api/waitlist/1/approve")
        .set("Authorization", "Bearer usertoken");

      expect(response.status).toBe(403);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .post("/api/waitlist/1/approve")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Failed to approve user");
    });
  });

  describe("POST /api/waitlist/:id/reject", () => {
    it("should reject waitlist entry", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/waitlist/1/reject")
        .set("Authorization", "Bearer admintoken")
        .send({ notes: "Does not meet criteria" });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("rejected");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE waitlist"),
        ["rejected", "Does not meet criteria", "1"]
      );
    });

    it("should reject without notes", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/waitlist/1/reject")
        .set("Authorization", "Bearer admintoken")
        .send({});

      expect(response.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
        "rejected",
        null,
        "1",
      ]);
    });

    it("should return 404 if entry not found", async () => {
      pool.query.mockResolvedValue({ rowCount: 0 });

      const response = await request(app)
        .post("/api/waitlist/999/reject")
        .set("Authorization", "Bearer admintoken")
        .send({});

      expect(response.status).toBe(404);
    });

    it("should require admin role", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app)
        .post("/api/waitlist/1/reject")
        .set("Authorization", "Bearer usertoken");

      expect(response.status).toBe(403);
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .post("/api/waitlist/1/reject")
        .set("Authorization", "Bearer admintoken")
        .send({});

      expect(response.status).toBe(500);
    });
  });

  describe("POST /api/waitlist/toggle", () => {
    it("should enable waitlist", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/waitlist/toggle")
        .set("Authorization", "Bearer admintoken")
        .send({ enabled: true });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("updated");
      expect(response.body.enabled).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("app_settings"),
        ["waitlist_enabled", "true"]
      );
    });

    it("should disable waitlist", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .post("/api/waitlist/toggle")
        .set("Authorization", "Bearer admintoken")
        .send({ enabled: false });

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBe(false);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
        "waitlist_enabled",
        "false",
      ]);
    });

    it("should use upsert (ON CONFLICT)", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      await request(app)
        .post("/api/waitlist/toggle")
        .set("Authorization", "Bearer admintoken")
        .send({ enabled: true });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT"),
        expect.any(Array)
      );
    });

    it("should require admin role", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app)
        .post("/api/waitlist/toggle")
        .set("Authorization", "Bearer usertoken")
        .send({ enabled: true });

      expect(response.status).toBe(403);
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .post("/api/waitlist/toggle")
        .set("Authorization", "Bearer admintoken")
        .send({ enabled: true });

      expect(response.status).toBe(500);
    });
  });

  describe("DELETE /api/waitlist/:id", () => {
    it("should delete waitlist entry", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .delete("/api/waitlist/1")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("deleted");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM waitlist"),
        ["1"]
      );
    });

    it("should return 404 if entry not found", async () => {
      pool.query.mockResolvedValue({ rowCount: 0 });

      const response = await request(app)
        .delete("/api/waitlist/999")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(404);
    });

    it("should require admin role", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "regular", role: "user" };
        next();
      });

      const response = await request(app)
        .delete("/api/waitlist/1")
        .set("Authorization", "Bearer usertoken");

      expect(response.status).toBe(403);
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .delete("/api/waitlist/1")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(500);
    });
  });

  describe("Admin Authorization Checks", () => {
    it("should block non-admin from all admin routes", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "regular", role: "user" };
        next();
      });

      const adminRoutes = [
        { method: "get", path: "/api/waitlist" },
        { method: "post", path: "/api/waitlist/1/approve" },
        { method: "post", path: "/api/waitlist/1/reject" },
        { method: "post", path: "/api/waitlist/toggle" },
        { method: "delete", path: "/api/waitlist/1" },
      ];

      for (const route of adminRoutes) {
        const response = await request(app)
          [route.method](route.path)
          .set("Authorization", "Bearer usertoken")
          .send({});

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Admin access required");
      }
    });
  });
});
