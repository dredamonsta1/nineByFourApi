import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// Route to search YouTube for art videos
// router.get("/Youtube", async (req, res) => {
//   const searchQuery = req.query.q;
//   if (!searchQuery) {
//     return res.status(400).json({ msg: "Search query is required." });
//   }

//   const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/search";

//   const options = {
//     params: {
//       part: "snippet",
//       q: `art history ${searchQuery}`, // Bias searches toward art content
//       key: process.env.YOUTUBE_API_KEY,
//       maxResults: 10,
//       type: "video",
//     },
//   };

//   try {
//     const response = await axios.get(YOUTUBE_URL, options);
//     // Transform the data to be cleaner for the frontend
//     const results = response.data.items.map((item) => ({
//       videoId: item.id.videoId,
//       title: item.snippet.title,
//       thumbnail: item.snippet.thumbnails.high.url,
//     }));
//     res.json(results);
//   } catch (err) {
//     console.error("Error fetching from YouTube API:", err.message);
//     res.status(500).send("Server Error");
//   }
// });
// **********************New Code***********************
// Add this new route inside src/routes/artApi.js

// Route to get a curated feed of art videos from a specific playlist
// router.get("/youtube-feed", async (req, res) => {
//   const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/playlistItems";

//   // This is the ID for a public playlist of art documentaries.
//   // You can find others on YouTube and swap this ID.
//   const PLAYLIST_ID = "PL8a32L6x3uU7sAnv6g1Mgao22j_b5d5a-";

//   const options = {
//     params: {
//       part: "snippet",
//       playlistId: PLAYLIST_ID,
//       key: process.env.YOUTUBE_API_KEY,
//       maxResults: 20, // Get up to 20 videos from the playlist
//     },
//   };

//   try {
//     const response = await axios.get(YOUTUBE_URL, options);
//     const results = response.data.items.map((item) => ({
//       videoId: item.snippet.resourceId.videoId,
//       title: item.snippet.title,
//       thumbnail: item.snippet.thumbnails.high.url,
//     }));
//     res.json(results);
//   } catch (err) {
//     console.error("Error fetching YouTube playlist:", err.message);
//     res.status(500).send("Server Error");
//   }
// });

// *************************New Code ***********************

// Replace the existing '/youtube-feed' route in src/routes/artApi.js

router.get("/youtube-feed", async (req, res) => {
  console.log("--- Received request for /youtube-feed ---");

  const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
  const PLAYLIST_ID = "PL8a32L6x3uU7sAnv6g1Mgao22j_b5d5a-"; // The Met Museum playlist

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
