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

export default router;
