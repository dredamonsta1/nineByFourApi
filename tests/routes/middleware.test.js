import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  authenticateToken,
  upload,
  handleMulterError,
} from "../../src/middleware.js";

// Mock jwt
vi.mock("jsonwebtoken");

describe("Middleware Tests", () => {
  describe("authenticateToken", () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {},
      };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      next = vi.fn();
      vi.clearAllMocks();
    });

    it("should return 401 if no token is provided", () => {
      req.headers["authorization"] = undefined;

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: "Authentication token required.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 if authorization header has no token", () => {
      req.headers["authorization"] = "Bearer";

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: "Authentication token required.",
      });
    });

    it("should handle empty string token as invalid", () => {
      req.headers["authorization"] = "Bearer ";

      const invalidError = new Error("jwt must be provided");
      invalidError.name = "JsonWebTokenError";

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(invalidError);
      });

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invalid Authentication token.",
      });
    });

    it("should authenticate valid token and call next", () => {
      const mockUser = { user_id: 1, username: "testuser", role: "user" };
      req.headers["authorization"] = "Bearer validtoken123";

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, mockUser);
      });

      authenticateToken(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith(
        "validtoken123",
        process.env.JWT_SECRET || "your_jwt_secret",
        expect.any(Function)
      );
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 401 for expired token", () => {
      req.headers["authorization"] = "Bearer expiredtoken";

      const expiredError = new Error("jwt expired");
      expiredError.name = "TokenExpiredError";

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(expiredError);
      });

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: "Authentication token expired.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 for invalid token", () => {
      req.headers["authorization"] = "Bearer invalidtoken";

      const invalidError = new Error("invalid token");
      invalidError.name = "JsonWebTokenError";

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(invalidError);
      });

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invalid Authentication token.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 for other JWT errors", () => {
      req.headers["authorization"] = "Bearer badtoken";

      const genericError = new Error("Something went wrong");
      genericError.name = "SomeOtherError";

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(genericError);
      });

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invalid or expired token.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should handle Bearer token with correct format", () => {
      const mockUser = { user_id: 2, username: "admin", role: "admin" };
      req.headers["authorization"] = "Bearer abc.def.ghi";

      jwt.verify.mockImplementation((token, secret, callback) => {
        callback(null, mockUser);
      });

      authenticateToken(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith(
        "abc.def.ghi",
        expect.any(String),
        expect.any(Function)
      );
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("handleMulterError", () => {
    let req, res, next;

    beforeEach(() => {
      req = {};
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      next = vi.fn();
      vi.clearAllMocks();
    });

    it("should handle MulterError and return 400", () => {
      const multerError = new Error("File too large");
      multerError.name = "MulterError";
      multerError.code = "LIMIT_FILE_SIZE";

      // Simulate multer.MulterError
      Object.setPrototypeOf(
        multerError,
        Object.create({
          constructor: { name: "MulterError" },
        })
      );

      handleMulterError(multerError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "File too large",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should handle general upload errors", () => {
      const generalError = new Error("Error: Images Only Please!");

      handleMulterError(generalError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Error: Images Only Please!",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should handle error without message", () => {
      const errorWithoutMessage = "String error";

      handleMulterError(errorWithoutMessage, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "String error",
      });
    });

    it("should call next if no error", () => {
      handleMulterError(null, req, res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("upload middleware configuration", () => {
    it("should have correct storage configuration", () => {
      expect(upload).toBeDefined();
      expect(upload.storage).toBeDefined();
    });

    it("should accept valid image file types", () => {
      const validFiles = [
        { mimetype: "image/jpeg", originalname: "test.jpg" },
        { mimetype: "image/jpg", originalname: "test.jpg" },
        { mimetype: "image/png", originalname: "test.png" },
        { mimetype: "image/gif", originalname: "test.gif" },
      ];

      validFiles.forEach((file) => {
        const cb = vi.fn();
        upload.fileFilter({}, file, cb);
        expect(cb).toHaveBeenCalledWith(null, true);
      });
    });

    it("should reject invalid file types", () => {
      const invalidFiles = [
        { mimetype: "application/pdf", originalname: "test.pdf" },
        { mimetype: "text/plain", originalname: "test.txt" },
        { mimetype: "video/mp4", originalname: "test.mp4" },
      ];

      invalidFiles.forEach((file) => {
        const cb = vi.fn();
        upload.fileFilter({}, file, cb);
        expect(cb).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Error: Images Only Please!",
          })
        );
      });
    });

    it("should reject files with wrong extension but correct mimetype", () => {
      const file = {
        mimetype: "image/jpeg",
        originalname: "test.pdf", // Wrong extension
      };

      const cb = vi.fn();
      upload.fileFilter({}, file, cb);
      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Error: Images Only Please!",
        })
      );
    });

    it("should accept files with uppercase extensions", () => {
      const file = {
        mimetype: "image/jpeg",
        originalname: "test.JPG",
      };

      const cb = vi.fn();
      upload.fileFilter({}, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });
  });
});
