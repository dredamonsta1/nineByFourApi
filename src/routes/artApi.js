import express from "express";
import axios from "axios";
import dotenv from "dotenv";

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

export default router;
