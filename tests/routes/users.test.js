import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mock bcrypt
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn((password) => Promise.resolve(`hashed_${password}`)),
    compare: vi.fn((password, hash) => {
      return Promise.resolve(hash === `hashed_${password}`);
    }),
  },
}));

// Mock jwt
vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn((payload) => `mock_token_${payload.id}`),
    verify: vi.fn(),
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
    req.user = { id: 1, username: "testuser", role: "user" };
    next();
  }),
}));

// Mock waitlist functions
vi.mock("../../src/routes/waitlist.js", () => ({
  isWaitlistEnabled: vi.fn(() => Promise.resolve(false)),
}));

import usersRouter from "../../src/routes/users.js";
import { pool } from "../../src/connect.js";
import { authenticateToken } from "../../src/middleware.js";
import { isWaitlistEnabled } from "../../src/routes/waitlist.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRouter);
  return app;
};

describe("Users API Routes", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
    // Reset defaults
    isWaitlistEnabled.mockResolvedValue(false);
    authenticateToken.mockImplementation((req, res, next) => {
      req.user = { id: 1, username: "testuser", role: "user" };
      next();
    });
  });

  describe("POST /api/users/register", () => {
    describe("Basic Registration (Waitlist Disabled)", () => {
      it("should register a new user successfully", async () => {
        pool.query.mockResolvedValue({
          rows: [{ user_id: 1 }],
        });

        const response = await request(app).post("/api/users/register").send({
          username: "newuser",
          password: "password123",
          email: "newuser@example.com",
        });

        expect(response.status).toBe(201);
        expect(response.body.message).toBe("User registered successfully!");
        expect(response.body.userId).toBe(1);
        expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining("INSERT INTO users"),
          ["newuser", "hashed_password123", "newuser@example.com", "user"]
        );
      });

      it("should register user with custom role", async () => {
        pool.query.mockResolvedValue({
          rows: [{ user_id: 2 }],
        });

        const response = await request(app).post("/api/users/register").send({
          username: "adminuser",
          password: "adminpass",
          email: "admin@example.com",
          role: "admin",
        });

        expect(response.status).toBe(201);
        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(["admin"])
        );
      });

      it("should return 400 if username is missing", async () => {
        const response = await request(app).post("/api/users/register").send({
          password: "password123",
          email: "test@example.com",
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Username, password, and email are required"
        );
        expect(pool.query).not.toHaveBeenCalled();
      });

      it("should return 400 if password is missing", async () => {
        const response = await request(app).post("/api/users/register").send({
          username: "testuser",
          email: "test@example.com",
        });

        expect(response.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
      });

      it("should return 400 if email is missing", async () => {
        const response = await request(app).post("/api/users/register").send({
          username: "testuser",
          password: "password123",
        });

        expect(response.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
      });

      it("should return 409 if username already exists", async () => {
        const duplicateError = new Error("Duplicate key");
        duplicateError.code = "23505";
        pool.query.mockRejectedValue(duplicateError);

        const response = await request(app).post("/api/users/register").send({
          username: "existinguser",
          password: "password123",
          email: "test@example.com",
        });

        expect(response.status).toBe(409);
        expect(response.body.message).toContain("already exists");
      });

      it("should handle database errors", async () => {
        pool.query.mockRejectedValue(new Error("Database error"));

        const response = await request(app).post("/api/users/register").send({
          username: "testuser",
          password: "password123",
          email: "test@example.com",
        });

        expect(response.status).toBe(500);
        expect(response.body.message).toContain("Server error");
      });
    });

    describe("Registration with Waitlist Enabled", () => {
      beforeEach(() => {
        isWaitlistEnabled.mockResolvedValue(true);
      });

      it("should reject registration without invite code when waitlist is active", async () => {
        const response = await request(app).post("/api/users/register").send({
          username: "newuser",
          password: "password123",
          email: "newuser@example.com",
        });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe(
          "Registration is currently invite-only"
        );
        expect(response.body.waitlist_enabled).toBe(true);
        expect(pool.query).not.toHaveBeenCalledWith(
          expect.stringContaining("INSERT INTO users"),
          expect.any(Array)
        );
      });

      it("should accept registration with valid invite code", async () => {
        pool.query
          .mockResolvedValueOnce({
            // Waitlist verification
            rows: [
              {
                waitlist_id: 1,
                email: "invited@example.com",
                status: "approved",
              },
            ],
          })
          .mockResolvedValueOnce({
            // User creation
            rows: [{ user_id: 1 }],
          })
          .mockResolvedValueOnce({
            // Mark invite as used
            rowCount: 1,
          });

        const response = await request(app).post("/api/users/register").send({
          username: "inviteduser",
          password: "password123",
          email: "invited@example.com",
          invite_code: "VALID_CODE_123",
        });

        expect(response.status).toBe(201);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining("SELECT waitlist_id"),
          ["VALID_CODE_123", "approved", "invited@example.com"]
        );
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE waitlist"),
          ["VALID_CODE_123"]
        );
      });

      it("should reject registration with invalid invite code", async () => {
        pool.query.mockResolvedValueOnce({
          rows: [], // No matching invite code
        });

        const response = await request(app).post("/api/users/register").send({
          username: "testuser",
          password: "password123",
          email: "test@example.com",
          invite_code: "INVALID_CODE",
        });

        expect(response.status).toBe(403);
        expect(response.body.error).toContain("Invalid invite code");
      });

      it("should reject registration with email mismatch", async () => {
        pool.query.mockResolvedValueOnce({
          rows: [], // Email doesn't match the invite
        });

        const response = await request(app).post("/api/users/register").send({
          username: "testuser",
          password: "password123",
          email: "wrong@example.com",
          invite_code: "VALID_CODE_123",
        });

        expect(response.status).toBe(403);
        expect(response.body.error).toContain(
          "Invalid invite code or email mismatch"
        );
      });

      it("should mark invite code as used after successful registration", async () => {
        pool.query
          .mockResolvedValueOnce({
            rows: [
              {
                waitlist_id: 1,
                email: "invited@example.com",
                status: "approved",
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [{ user_id: 1 }],
          })
          .mockResolvedValueOnce({
            rowCount: 1,
          });

        await request(app).post("/api/users/register").send({
          username: "inviteduser",
          password: "password123",
          email: "invited@example.com",
          invite_code: "USED_CODE",
        });

        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE waitlist"),
          ["USED_CODE"]
        );
      });
    });
  });

  describe("POST /api/users/login", () => {
    it("should login user with valid credentials", async () => {
      const mockUser = {
        user_id: 1,
        username: "testuser",
        password: "hashed_password123",
        role: "user",
      };

      pool.query.mockResolvedValue({ rows: [mockUser] });

      const response = await request(app).post("/api/users/login").send({
        username: "testuser",
        password: "password123",
      });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("Welcome back");
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toEqual({
        id: 1,
        username: "testuser",
        role: "user",
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "password123",
        "hashed_password123"
      );
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: "testuser", role: "user" },
        expect.any(String),
        { expiresIn: "1h" }
      );
    });

    it("should return 400 if username is missing", async () => {
      const response = await request(app).post("/api/users/login").send({
        password: "password123",
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        "Username and password are required"
      );
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should return 400 if password is missing", async () => {
      const response = await request(app).post("/api/users/login").send({
        username: "testuser",
      });

      expect(response.status).toBe(400);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should return 401 if user does not exist", async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).post("/api/users/login").send({
        username: "nonexistent",
        password: "password123",
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid username or password.");
    });

    it("should return 401 if password is incorrect", async () => {
      const mockUser = {
        user_id: 1,
        username: "testuser",
        password: "hashed_correctpassword",
        role: "user",
      };

      pool.query.mockResolvedValue({ rows: [mockUser] });
      bcrypt.compare.mockResolvedValueOnce(false);

      const response = await request(app).post("/api/users/login").send({
        username: "testuser",
        password: "wrongpassword",
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid username or password.");
    });

    it("should handle database errors during login", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app).post("/api/users/login").send({
        username: "testuser",
        password: "password123",
      });

      expect(response.status).toBe(500);
      expect(response.body.message).toContain("Server error");
    });

    it("should generate JWT token with correct payload", async () => {
      const mockUser = {
        user_id: 42,
        username: "specificuser",
        password: "hashed_password123",
        role: "admin",
      };

      pool.query.mockResolvedValue({ rows: [mockUser] });

      await request(app).post("/api/users/login").send({
        username: "specificuser",
        password: "password123",
      });

      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 42, username: "specificuser", role: "admin" },
        expect.any(String),
        { expiresIn: "1h" }
      );
    });
  });

  describe("GET /api/users/profile", () => {
    it("should return authenticated user profile", async () => {
      const mockProfile = {
        user_id: 1,
        username: "testuser",
        email: "test@example.com",
        role: "user",
      };

      pool.query.mockResolvedValue({ rows: [mockProfile], rowCount: 1 });

      const response = await request(app)
        .get("/api/users/profile")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual(mockProfile);
      expect(response.body.message).toContain("Hello testuser");
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT user_id, username, email, role"),
        [1]
      );
    });

    it("should require authentication", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        res.status(401).json({ message: "Authentication token required." });
      });

      const response = await request(app).get("/api/users/profile");

      expect(response.status).toBe(401);
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should return 404 if user not found", async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .get("/api/users/profile")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("User not found.");
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .get("/api/users/profile")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(500);
      expect(response.body.message).toContain("Server error");
    });
  });

  describe("PUT /api/users/:user_id", () => {
    it("should allow user to update their own email", async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            user_id: 1,
            username: "testuser",
            email: "newemail@example.com",
            role: "user",
          },
        ],
        rowCount: 1,
      });

      const response = await request(app)
        .put("/api/users/1")
        .set("Authorization", "Bearer validtoken")
        .send({ email: "newemail@example.com" });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("updated successfully");
      expect(response.body.user.email).toBe("newemail@example.com");
    });

    it("should allow user to update their own password", async () => {
      pool.query.mockResolvedValue({
        rows: [
          {
            user_id: 1,
            username: "testuser",
            email: "test@example.com",
            role: "user",
          },
        ],
        rowCount: 1,
      });

      const response = await request(app)
        .put("/api/users/1")
        .set("Authorization", "Bearer validtoken")
        .send({ password: "newpassword123" });

      expect(response.status).toBe(200);
      expect(bcrypt.hash).toHaveBeenCalledWith("newpassword123", 10);
    });

    it("should prevent non-admin from updating another user", async () => {
      const response = await request(app)
        .put("/api/users/999")
        .set("Authorization", "Bearer validtoken")
        .send({ email: "hacker@example.com" });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Permission denied.");
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should allow admin to update any user", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "admin", role: "admin" };
        next();
      });

      pool.query.mockResolvedValue({
        rows: [
          {
            user_id: 999,
            username: "targetuser",
            email: "updated@example.com",
            role: "user",
          },
        ],
        rowCount: 1,
      });

      const response = await request(app)
        .put("/api/users/999")
        .set("Authorization", "Bearer admintoken")
        .send({ email: "updated@example.com" });

      expect(response.status).toBe(200);
    });

    it("should prevent non-admin from changing roles", async () => {
      const response = await request(app)
        .put("/api/users/1")
        .set("Authorization", "Bearer validtoken")
        .send({ role: "admin" });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain(
        "not authorized to change user roles"
      );
    });

    it("should allow admin to change user roles", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "admin", role: "admin" };
        next();
      });

      pool.query.mockResolvedValue({
        rows: [
          {
            user_id: 1,
            username: "testuser",
            email: "test@example.com",
            role: "admin",
          },
        ],
        rowCount: 1,
      });

      const response = await request(app)
        .put("/api/users/1")
        .set("Authorization", "Bearer admintoken")
        .send({ role: "admin" });

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe("admin");
    });

    it("should return 400 if no valid fields provided", async () => {
      const response = await request(app)
        .put("/api/users/1")
        .set("Authorization", "Bearer validtoken")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("No valid fields");
    });

    it("should return 404 if user not found", async () => {
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const response = await request(app)
        .put("/api/users/1")
        .set("Authorization", "Bearer validtoken")
        .send({ email: "new@example.com" });

      expect(response.status).toBe(404);
    });

    it("should return 409 if email already in use", async () => {
      const duplicateError = new Error("Duplicate key");
      duplicateError.code = "23505";
      pool.query.mockRejectedValue(duplicateError);

      const response = await request(app)
        .put("/api/users/1")
        .set("Authorization", "Bearer validtoken")
        .send({ email: "existing@example.com" });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain("Email already in use");
    });
  });

  describe("GET /api/users", () => {
    it("should allow admin to get all users", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 1, username: "admin", role: "admin" };
        next();
      });

      const mockUsers = [
        {
          user_id: 1,
          username: "user1",
          email: "user1@example.com",
          role: "user",
        },
        {
          user_id: 2,
          username: "user2",
          email: "user2@example.com",
          role: "user",
        },
      ];

      pool.query.mockResolvedValue({ rows: mockUsers });

      const response = await request(app)
        .get("/api/users")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(200);
      expect(response.body.users).toEqual(mockUsers);
    });

    it("should prevent non-admin from accessing user list", async () => {
      const response = await request(app)
        .get("/api/users")
        .set("Authorization", "Bearer usertoken");

      expect(response.status).toBe(403);
      expect(response.body.message).toContain("Admin role required");
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should handle database errors", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 1, username: "admin", role: "admin" };
        next();
      });

      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .get("/api/users")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(500);
    });
  });

  describe("DELETE /api/users/:user_id", () => {
    it("should allow user to delete their own account", async () => {
      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .delete("/api/users/1")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(200);
      expect(response.body.message).toContain("was deleted");
    });

    it("should prevent user from deleting another user account", async () => {
      const response = await request(app)
        .delete("/api/users/999")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Permission denied.");
      expect(pool.query).not.toHaveBeenCalled();
    });

    it("should allow admin to delete any user", async () => {
      authenticateToken.mockImplementation((req, res, next) => {
        req.user = { id: 2, username: "admin", role: "admin" };
        next();
      });

      pool.query.mockResolvedValue({ rowCount: 1 });

      const response = await request(app)
        .delete("/api/users/999")
        .set("Authorization", "Bearer admintoken");

      expect(response.status).toBe(200);
    });

    it("should return 404 if user not found", async () => {
      pool.query.mockResolvedValue({ rowCount: 0 });

      const response = await request(app)
        .delete("/api/users/1")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(404);
    });

    it("should handle database errors", async () => {
      pool.query.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .delete("/api/users/1")
        .set("Authorization", "Bearer validtoken");

      expect(response.status).toBe(500);
    });
  });
});
