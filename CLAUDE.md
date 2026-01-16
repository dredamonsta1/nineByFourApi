# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start server (runs on port 3010)
npm start

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Watch mode for tests
npm run test:watch

# Seed database
npm run seed
```

## Architecture

This is an Express.js REST API for a music artist social platform (9by4). It uses PostgreSQL for data persistence, JWT for authentication, and Resend for transactional emails.

### Entry Points
- `src/index.js` - Express server setup, mounts all routes under `/api/`
- `src/connect.js` - PostgreSQL connection pool and schema initialization (tables auto-created on startup)
- `src/middleware.js` - JWT authentication (`authenticateToken`) and Multer file upload config

### Route Modules (`src/routes/`)
- `users.js` - Registration (waitlist-gated), login, profile (`/api/users/*`)
- `artists.js` - Artist CRUD with albums, clout counter, image upload (`/api/artists/*`)
- `admin.js` - Admin dashboard stats, creator approval with Resend email (`/api/admin/*`)
- `waitlist.js` - Join waitlist, verify invite codes, admin approval workflow (`/api/waitlist/*`)
- `posts.js` - Text posts CRUD (`/api/posts/*`)
- `imagePosts.js` - Image post uploads (`/api/image-posts/*`)
- `follower.js` - Follow/unfollow users
- `music.js` - Spotify integration for upcoming releases

### Database Schema
Tables are created automatically in `connect.js`: `users`, `artists`, `albums`, `posts`, `image_posts`, `user_profile_artists`, `waitlist`, `app_settings`, `follows`

### Authentication Flow
1. User joins waitlist (`/api/waitlist/join`)
2. Admin approves via `/api/admin/approve-creator` (generates invite code, sends email via Resend)
3. User registers with invite code (`/api/users/register`)
4. Login returns JWT token (24h expiry), sent as `Authorization: Bearer <token>`

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection (Heroku format with SSL)
- `JWT_SECRET` - Secret for signing tokens
- `RESEND_API_KEY` - Resend email API key
- `FROM_EMAIL` - Sender email for Resend (defaults to onboarding@resend.dev)

### Testing
Tests use Vitest with Supertest. Test files in `tests/routes/*.test.js`. Mocks configured in `tests/setup.js` for database pool, middleware, and file uploads.

## Deployment

Hosted on Heroku at `https://ninebyfourapi.herokuapp.com/api`. Static uploads served from `/uploads` directory.
