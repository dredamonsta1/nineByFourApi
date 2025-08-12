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
router.get("/youtube-feed", async (req, res) => {
  const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/playlistItems";

  // This is the ID for a public playlist of art documentaries.
  // You can find others on YouTube and swap this ID.
  const PLAYLIST_ID = "PL8a32L6x3uU7sAnv6g1Mgao22j_b5d5a-";

  const options = {
    params: {
      part: "snippet",
      playlistId: PLAYLIST_ID,
      key: process.env.YOUTUBE_API_KEY,
      maxResults: 20, // Get up to 20 videos from the playlist
    },
  };

  try {
    const response = await axios.get(YOUTUBE_URL, options);
    const results = response.data.items.map((item) => ({
      videoId: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high.url,
    }));
    res.json(results);
  } catch (err) {
    console.error("Error fetching YouTube playlist:", err.message);
    res.status(500).send("Server Error");
  }
});

export default router;
