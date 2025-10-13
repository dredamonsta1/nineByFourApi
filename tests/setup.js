import { beforeAll, afterAll, beforeEach, vi } from "vitest";
import dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env.test" });

// Set default test environment variables if not provided
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_key";
process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "test_youtube_key";
process.env.NODE_ENV = "test";

// Global test setup
beforeAll(() => {
  console.log("🧪 Starting test suite...");
  console.log("📝 Environment: test");
});

afterAll(() => {
  console.log("✅ Test suite completed");
});

// Clear all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Export mock factories for reuse
export const mockDatabase = {
  // Mock successful query
  mockQuerySuccess: (rows = []) => ({
    rows,
    rowCount: rows.length,
    command: "SELECT",
    oid: null,
    fields: [],
  }),

  // Mock query error
  mockQueryError: (message = "Database error", code = "ECONNREFUSED") => {
    const error = new Error(message);
    error.code = code;
    return error;
  },

  // Mock duplicate key error
  mockDuplicateKeyError: (detail = "Key already exists") => {
    const error = new Error("duplicate key value violates unique constraint");
    error.code = "23505";
    error.detail = detail;
    return error;
  },

  // Mock foreign key error
  mockForeignKeyError: () => {
    const error = new Error("violates foreign key constraint");
    error.code = "23503";
    return error;
  },
};

export const mockUsers = {
  regularUser: {
    user_id: 1,
    username: "testuser",
    email: "test@example.com",
    role: "user",
    password: "$2b$10$hashedpassword",
    created_at: new Date().toISOString(),
  },

  adminUser: {
    user_id: 2,
    username: "admin",
    email: "admin@example.com",
    role: "admin",
    password: "$2b$10$hashedadminpassword",
    created_at: new Date().toISOString(),
  },

  createUser: (overrides = {}) => ({
    user_id: 3,
    username: "customuser",
    email: "custom@example.com",
    role: "user",
    password: "$2b$10$hashedcustompassword",
    created_at: new Date().toISOString(),
    ...overrides,
  }),
};

export const mockArtists = {
  artist1: {
    artist_id: 1,
    artist_name: "Test Artist 1",
    aka: "TA1",
    genre: "Hip Hop",
    count: 5,
    state: "California",
    region: "West Coast",
    label: "Test Label",
    image_url: "/uploads/artist1.jpg",
  },

  artist2: {
    artist_id: 2,
    artist_name: "Test Artist 2",
    aka: "TA2",
    genre: "R&B",
    count: 3,
    state: "New York",
    region: "East Coast",
    label: "Another Label",
    image_url: "/uploads/artist2.jpg",
  },

  createArtist: (overrides = {}) => ({
    artist_id: 99,
    artist_name: "Custom Artist",
    aka: "CA",
    genre: "Pop",
    count: 0,
    state: "Texas",
    region: "South",
    label: "Custom Label",
    image_url: null,
    ...overrides,
  }),
};

export const mockAlbums = {
  album1: {
    album_id: 1,
    artist_id: 1,
    album_name: "Test Album 1",
    year: 2023,
    certifications: "Gold",
  },

  album2: {
    album_id: 2,
    artist_id: 1,
    album_name: "Test Album 2",
    year: 2022,
    certifications: "Platinum",
  },

  createAlbum: (overrides = {}) => ({
    album_id: 99,
    artist_id: 1,
    album_name: "Custom Album",
    year: 2024,
    certifications: null,
    ...overrides,
  }),
};

export const mockPosts = {
  post1: {
    post_id: 1,
    user_id: 1,
    content: "This is a test post",
    created_at: new Date().toISOString(),
  },

  createPost: (overrides = {}) => ({
    post_id: 99,
    user_id: 1,
    content: "Custom post content",
    created_at: new Date().toISOString(),
    ...overrides,
  }),
};

export const mockWaitlist = {
  entry1: {
    waitlist_id: 1,
    email: "waitlist@example.com",
    full_name: "Test User",
    status: "pending",
    invite_code: null,
    requested_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null,
    notes: null,
  },

  approvedEntry: {
    waitlist_id: 2,
    email: "approved@example.com",
    full_name: "Approved User",
    status: "approved",
    invite_code: "INVITE123",
    requested_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    approved_by: 2,
    notes: "Approved by admin",
  },

  createEntry: (overrides = {}) => ({
    waitlist_id: 99,
    email: "custom@example.com",
    full_name: "Custom User",
    status: "pending",
    invite_code: null,
    requested_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null,
    notes: null,
    ...overrides,
  }),
};

// Mock JWT token generator
export const generateMockJWT = (payload = {}) => {
  const defaultPayload = {
    user_id: 1,
    username: "testuser",
    role: "user",
    ...payload,
  };
  // In tests, we'll mock jwt.sign to return this
  return `mock.jwt.${Buffer.from(JSON.stringify(defaultPayload)).toString(
    "base64"
  )}`;
};

// Mock authentication middleware factory
export const createAuthMiddleware = (user = mockUsers.regularUser) => {
  return (req, res, next) => {
    req.user = user;
    next();
  };
};

// Mock file for upload tests
export const createMockFile = (overrides = {}) => ({
  fieldname: "artistImage",
  originalname: "test-image.jpg",
  encoding: "7bit",
  mimetype: "image/jpeg",
  destination: "uploads/",
  filename: `artistImage-${Date.now()}.jpg`,
  path: `uploads/artistImage-${Date.now()}.jpg`,
  size: 1024 * 100, // 100KB
  ...overrides,
});
