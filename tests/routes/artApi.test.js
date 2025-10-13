import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import axios from "axios";
import artApiRouter from "../../src/routes/artApi.js";

// Mock axios
vi.mock("axios");

// Create a test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/art", artApiRouter);
  return app;
};

describe("Art API Routes", () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  describe("GET /api/art/youtube-feed", () => {
    it("should return formatted YouTube playlist data", async () => {
      // Mock successful YouTube API response
      const mockYouTubeResponse = {
        data: {
          items: [
            {
              snippet: {
                resourceId: {
                  videoId: "video123",
                },
                title: "Art Video 1",
                thumbnails: {
                  high: {
                    url: "https://i.ytimg.com/vi/video123/hqdefault.jpg",
                  },
                },
              },
            },
            {
              snippet: {
                resourceId: {
                  videoId: "video456",
                },
                title: "Art Video 2",
                thumbnails: {
                  high: {
                    url: "https://i.ytimg.com/vi/video456/hqdefault.jpg",
                  },
                },
              },
            },
          ],
        },
      };

      axios.get.mockResolvedValue(mockYouTubeResponse);

      const response = await request(app).get("/api/art/youtube-feed");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          videoId: "video123",
          title: "Art Video 1",
          thumbnail: "https://i.ytimg.com/vi/video123/hqdefault.jpg",
        },
        {
          videoId: "video456",
          title: "Art Video 2",
          thumbnail: "https://i.ytimg.com/vi/video456/hqdefault.jpg",
        },
      ]);
    });

    it("should call YouTube API with correct parameters", async () => {
      const mockYouTubeResponse = {
        data: {
          items: [],
        },
      };

      axios.get.mockResolvedValue(mockYouTubeResponse);

      await request(app).get("/api/art/youtube-feed");

      expect(axios.get).toHaveBeenCalledWith(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        {
          params: {
            part: "snippet",
            playlistId: "PL8HAkqKX065Bm4la3BM3C3bSkn-Xxu8Hp",
            key: process.env.YOUTUBE_API_KEY,
            maxResults: 20,
          },
        }
      );
    });

    it("should return empty array when playlist has no items", async () => {
      const mockYouTubeResponse = {
        data: {
          items: [],
        },
      };

      axios.get.mockResolvedValue(mockYouTubeResponse);

      const response = await request(app).get("/api/art/youtube-feed");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("should handle YouTube API errors gracefully", async () => {
      axios.get.mockRejectedValue(new Error("YouTube API Error"));

      const response = await request(app).get("/api/art/youtube-feed");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Server Error");
    });

    it("should handle YouTube API error responses with detailed error info", async () => {
      const mockError = {
        message: "Request failed with status code 403",
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message:
                "The request cannot be completed because you have exceeded your quota.",
              errors: [
                {
                  message:
                    "The request cannot be completed because you have exceeded your quota.",
                  domain: "youtube.quota",
                  reason: "quotaExceeded",
                },
              ],
            },
          },
        },
      };

      axios.get.mockRejectedValue(mockError);

      const response = await request(app).get("/api/art/youtube-feed");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Server Error");
    });

    it("should handle network errors", async () => {
      axios.get.mockRejectedValue(new Error("Network Error"));

      const response = await request(app).get("/api/art/youtube-feed");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Server Error");
    });

    it("should handle malformed YouTube API responses", async () => {
      const mockMalformedResponse = {
        data: {
          items: [
            {
              snippet: {
                // Missing resourceId
                title: "Incomplete Video",
              },
            },
          ],
        },
      };

      axios.get.mockResolvedValue(mockMalformedResponse);

      const response = await request(app).get("/api/art/youtube-feed");

      // This will throw an error when trying to access nested properties
      expect(response.status).toBe(500);
    });

    it("should handle YouTube API returning single video correctly", async () => {
      const mockYouTubeResponse = {
        data: {
          items: [
            {
              snippet: {
                resourceId: {
                  videoId: "singleVideo",
                },
                title: "Single Art Video",
                thumbnails: {
                  high: {
                    url: "https://i.ytimg.com/vi/singleVideo/hqdefault.jpg",
                  },
                },
              },
            },
          ],
        },
      };

      axios.get.mockResolvedValue(mockYouTubeResponse);

      const response = await request(app).get("/api/art/youtube-feed");

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toEqual({
        videoId: "singleVideo",
        title: "Single Art Video",
        thumbnail: "https://i.ytimg.com/vi/singleVideo/hqdefault.jpg",
      });
    });
  });
});
