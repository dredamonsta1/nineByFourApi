import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";

dotenv.config();
const router = express.Router();

router.get("/youtube-feed", async (req, res) => {
  console.log("--- Received request for /youtube-feed ---");

  const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
  const PLAYLIST_ID = "PL8HAkqKX065Bm4la3BM3C3bSkn-Xxu8Hp"; // The Met Museum playlist

  const apiKey = process.env.YOUTUBE_API_KEY;

  // Log to check if the API key is being loaded
  if (apiKey) {
    console.log(`API Key successfully loaded. Length: ${apiKey.length}`);
  } else {
    console.error(
      "CRITICAL: YOUTUBE_API_KEY is NOT loaded from environment variables!"
    );
  }

  const options = {
    params: {
      part: "snippet",
      playlistId: PLAYLIST_ID,
      key: apiKey,
      maxResults: 20,
    },
  };

  try {
    console.log(
      "Attempting to call YouTube API with Playlist ID:",
      PLAYLIST_ID
    );
    const response = await axios.get(YOUTUBE_URL, options);

    console.log("Successfully received response from YouTube.");
    const results = response.data.items.map((item) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high.url,
    }));
    res.json(results);
  } catch (err) {
    // Log the detailed error from Google
    console.error("--- YOUTUBE API CALL FAILED ---");
    console.error("Error message:", err.message);
    // If Google provides a specific reason, it will be in err.response.data
    if (err.response) {
      console.error(
        "Error details from Google:",
        JSON.stringify(err.response.data, null, 2)
      );
    }
    console.error("--- END OF ERROR ---");
    res.status(500).send("Server Error");
  }
});

/**
 * @route   GET /api/art/combined-video-feed
 * @desc    Get combined feed of YouTube playlist videos and user-uploaded videos
 * @access  Private
 */
router.get("/combined-video-feed", authenticateToken, async (req, res) => {
  try {
    // Fetch user-uploaded videos from DB
    const dbQuery = `
      SELECT
        vp.id,
        vp.user_id,
        vp.video_url,
        vp.video_type,
        vp.caption,
        vp.thumbnail_url,
        vp.created_at,
        u.username,
        'user' as source
      FROM video_posts vp
      LEFT JOIN users u ON vp.user_id = u.user_id
      ORDER BY vp.created_at DESC
      LIMIT 50;
    `;
    const dbResult = await pool.query(dbQuery);
    const userVideos = dbResult.rows;

    // Fetch YouTube playlist
    let youtubeVideos = [];
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      try {
        const YOUTUBE_URL =
          "https://www.googleapis.com/youtube/v3/playlistItems";
        const PLAYLIST_ID = "PL8HAkqKX065Bm4la3BM3C3bSkn-Xxu8Hp";
        const response = await axios.get(YOUTUBE_URL, {
          params: {
            part: "snippet",
            playlistId: PLAYLIST_ID,
            key: apiKey,
            maxResults: 20,
          },
        });
        youtubeVideos = response.data.items.map((item) => ({
          id: item.snippet.resourceId.videoId,
          video_url: item.snippet.resourceId.videoId,
          video_type: "youtube",
          caption: item.snippet.title,
          thumbnail_url: item.snippet.thumbnails.high.url,
          created_at: item.snippet.publishedAt,
          username: "YouTube",
          source: "youtube_playlist",
        }));
      } catch (ytErr) {
        console.error("YouTube API error in combined feed:", ytErr.message);
      }
    }

    // Merge and sort by date
    const combined = [...userVideos, ...youtubeVideos].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    res.json(combined);
  } catch (err) {
    console.error("Error fetching combined video feed:", err);
    res.status(500).json({ message: "Failed to fetch combined video feed." });
  }
});

// Cache for music videos (1 hour TTL)
let mvCache = { data: null, timestamp: 0 };
const MV_CACHE_TTL = 60 * 60 * 1000;

router.get("/music-videos", async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YouTube API key not configured" });
  }

  // Return cached data if fresh
  if (mvCache.data && Date.now() - mvCache.timestamp < MV_CACHE_TTL) {
    return res.json(mvCache.data);
  }

  const artists = ["Drake", "Kendrick Lamar"];
  const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

  try {
    const results = await Promise.all(
      artists.map(async (artist) => {
        const response = await axios.get(YOUTUBE_SEARCH_URL, {
          params: {
            part: "snippet",
            q: `${artist} official music video`,
            type: "video",
            videoCategoryId: "10", // Music category
            order: "date",
            maxResults: 10,
            key: apiKey,
          },
        });

        return response.data.items.map((item) => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
          artist,
          publishedAt: item.snippet.publishedAt,
          channelTitle: item.snippet.channelTitle,
        }));
      })
    );

    // Flatten and sort by publish date (newest first)
    const allVideos = results.flat().sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
    );

    // Cache the result
    mvCache = { data: allVideos, timestamp: Date.now() };

    res.json(allVideos);
  } catch (err) {
    console.error("Music videos fetch error:", err.response?.data || err.message);
    if (mvCache.data) return res.json(mvCache.data);
    res.status(500).json({ error: "Failed to fetch music videos" });
  }
});

export default router;
