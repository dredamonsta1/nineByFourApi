// import { vi } from 'vitest';

// // Mock pool for database operations
// export const createMockPool = () => {
//   return {
//     query: vi.fn(),
//     connect: vi.fn(),
//     end: vi.fn(),
//     on: vi.fn(),
//   };
// };

// // Mock successful database query response
// export const mockQuerySuccess = (rows = []) => {
//   return {
//     rows,
//     rowCount: rows.length,
//     command: 'SELECT',
//     oid: null,
//     fields: [],
//   };
// };

// // Mock database error
// export const mockQueryError = (message = 'Database error') => {
//   const error = new Error(message);
//   error.code = 'ECONNREFUSED';
//   return error;
// };

// // Create mock user for testing
// export const createMockUser = (overrides = {}) => {
//   return {
//     user_id: 1,
//     username: 'testuser',
//     email: 'test@example.com',
//     password: '$2b$10$hashedpassword', // bcrypt hashed password
//     role: 'user',
//     created_at: new Date().toISOString(),
//     ...overrides,
//   };
// };

// // Create mock artist for testing
// export const createMockArtist = (overrides = {}) => {
//   return {
//     artist_id: 1,
//     artist_name: 'Test Artist',
//     aka: 'Test Aka',
//     genre: 'Hip Hop',
//     count: 5,
//     state: 'California',
//     region: 'West Coast',
//     label: 'Test Label',
//     image_url: 'https://example.com/image.jpg',
//     ...overrides,
//   };
// };

// // Create mock post for testing
// export const createMockPost = (overrides = {}) => {
//   return {
//     post_id: 1,
//     user_id: 1,
//     content: 'Test post content',
//     created_at: new Date().toISOString(),
//     ...overrides,
//   };
// };

// // Create mock waitlist entry
// export const createMockWaitlistEntry = (overrides = {}) => {
//   return {
//     waitlist_id: 1,
//     email: 'waitlist@example.com',
//     full_name: 'Test User',
//     status: 'pending',
//     invite_code: null,
//     requested_at: new Date().toISOString(),
//     approved_at: null,
//     approved_by: null,
//     notes: null,
//     ...overrides,
//   };
// };

// // Generate mock JWT token
// export const generateMockToken = (payload = { user_id: 1, username: 'testuser' }) => {
//   // In real tests, you'd use jsonwebtoken to generate actual tokens
//   // For now, return a mock token string
//   return 'mock.jwt.token';
// };

// // Mock authentication middleware
// export const mockAuthMiddleware = (req, res, next) => {
//   req.user = { user_id: 1, username: 'testuser', role: 'user' };
//   next();
// };

// // Helper to create Express test app with routes
// export const createTestApp = (router, basePath = '/') => {
//   const express = (await import('express')).default;
//   const app = express();
//   app.use(express.json());
//   app.use(express.urlencoded({ extended: true }));
//   app.use(basePath, router);
//   return app;
// };

import { vi } from 'vitest';

// Mock pool for database operations
export const createMockPool = () => {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
};

// Mock successful database query response
export const mockQuerySuccess = (rows = []) => {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: null,
    fields: [],
  };
};

// Mock database error
export const mockQueryError = (message = 'Database error') => {
  const error = new Error(message);
  error.code = 'ECONNREFUSED';
  return error;
};

// Create mock user for testing
export const createMockUser = (overrides = {}) => {
  return {
    user_id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: '$2b$10$hashedpassword', // bcrypt hashed password
    role: 'user',
    created_at: new Date().toISOString(),
    ...overrides,
  };
};

// Create mock artist for testing
export const createMockArtist = (overrides = {}) => {
  return {
    artist_id: 1,
    artist_name: 'Test Artist',
    aka: 'Test Aka',
    genre: 'Hip Hop',
    count: 5,
    state: 'California',
    region: 'West Coast',
    label: 'Test Label',
    image_url: 'https://example.com/image.jpg',
    ...overrides,
  };
};

// Create mock post for testing
export const createMockPost = (overrides = {}) => {
  return {
    post_id: 1,
    user_id: 1,
    content: 'Test post content',
    created_at: new Date().toISOString(),
    ...overrides,
  };
};

// Create mock waitlist entry
export const createMockWaitlistEntry = (overrides = {}) => {
  return {
    waitlist_id: 1,
    email: 'waitlist@example.com',
    full_name: 'Test User',
    status: 'pending',
    invite_code: null,
    requested_at: new Date().toISOString(),
    approved_at: null,
    approved_by: null,
    notes: null,
    ...overrides,
  };
};

// Generate mock JWT token
export const generateMockToken = (payload = { user_id: 1, username: 'testuser' }) => {
  // In real tests, you'd use jsonwebtoken to generate actual tokens
  // For now, return a mock token string
  return 'mock.jwt.token';
};

// Mock authentication middleware
export const mockAuthMiddleware = (req, res, next) => {
  req.user = { user_id: 1, username: 'testuser', role: 'user' };
  next();
};

// Mock admin authentication middleware
export const mockAdminAuthMiddleware = (req, res, next) => {
  req.user = { user_id: 1, username: 'admin', role: 'admin' };
  next();
};

// Create mock authentication middleware with custom user
export const createMockAuth = (user) => (req, res, next) => {
  req.user = user;
  next();
};

// Helper to create Express test app with routes
export const createTestApp = (router, basePath = '/') => {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(basePath, router);
  return app;
};