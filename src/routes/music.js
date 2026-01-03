// import express from "express";
// import axios from "axios";
// const router = express.Router();

// router.get("/upcoming", async (req, res) => {
//   try {
//     // 1. Get Spotify Token (Safely on the server)
//     const auth = Buffer.from(
//       `${process.env.cc5f4c9fbf304384a5ae6c12a7751f61}:${process.env.608ee54cd2e348b2bfd30173e47266ae}`
//     ).toString("base64");
//     const tokenRes = await axios.post(
//       "https://accounts.spotify.com/api/token",
//       "grant_type=client_credentials",
//       {
//         headers: {
//           Authorization: `Basic ${auth}`,
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );
//     const token = tokenRes.data.access_token;

//     // 2. Fetch from Spotify
//     const spotifyRes = await axios.get(
//       "https://api.spotify.com/v1/browse/new-releases",
//       {
//         headers: { Authorization: `Bearer ${token}` },
//       }
//     );

//     // 3. Map your data here and return it to React
//     const data = spotifyRes.data.albums.items.map((album) => ({
//       id: `sp-${album.id}`,
//       title: album.name,
//       artist: album.artists[0]?.name,
//       date: album.release_date,
//       imageUrl: album.images[0]?.url,
//       source: "Spotify",
//     }));

//     res.json(data);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "Failed to fetch music" });
//   }
// });

// export default router;

// *******************new code above********************

import express from "express";
import axios from "axios";
const router = express.Router();

router.get("/upcoming", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // --- 1. SPOTIFY LOGIC ---
    const spotifyAuth = Buffer.from(
      `${process.env["cc5f4c9fbf304384a5ae6c12a7751f61"]}:${process.env["608ee54cd2e348b2bfd30173e47266ae"]}`
    ).toString("base64");

    const tokenRes = await axios.post(
      "https://accounts.spotify.com/api/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${spotifyAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const spotifyToken = tokenRes.data.access_token;
    const spotifyRes = await axios.get(
      "https://api.spotify.com/v1/browse/new-releases?limit=10",
      {
        headers: { Authorization: `Bearer ${spotifyToken}` },
      }
    );

    const spotifyData = spotifyRes.data.albums.items.map((album) => ({
      id: `sp-${album.id}`,
      title: album.name,
      artist: album.artists[0]?.name,
      date: album.release_date,
      imageUrl: album.images[0]?.url,
      source: "Spotify",
    }));

    // --- 2. MUSICBRAINZ LOGIC ---
    const mbQuery = encodeURIComponent(
      `date:[${today} TO 2999-12-31] AND status:official`
    );
    const mbRes = await axios.get(
      `https://musicbrainz.org/ws/2/release/?query=${mbQuery}&fmt=json`,
      {
        headers: {
          "User-Agent": "SocialCreators/1.0.0 (your-email@example.com)",
        },
      }
    );

    // Fetch cover art concurrently on the server
    const musicBrainzData = await Promise.all(
      mbRes.data.releases.slice(0, 10).map(async (release) => {
        let imageUrl = null;
        try {
          const caRes = await axios.get(
            `https://coverartarchive.org/release/${release.id}`
          );
          imageUrl =
            caRes.data.images?.[0]?.thumbnails?.small ||
            caRes.data.images?.[0]?.image;
        } catch (e) {
          /* ignore 404s from cover art archive */
        }

        return {
          id: `mb-${release.id}`,
          title: release.title,
          artist: release["artist-credit"]?.[0]?.name || "Unknown Artist",
          date: release.date,
          imageUrl: imageUrl,
          source: "MusicBrainz",
        };
      })
    );

    // --- 3. COMBINE AND SORT ---
    const combined = [...spotifyData, ...musicBrainzData].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    res.json(combined);
  } catch (error) {
    console.error("Music Aggregator Error:", error.message);
    res.status(500).json({ error: "Internal Server Error fetching music" });
  }
});

export default router;

// *******************end of new code above********************

// import express from "express";
// import axios from "axios";
// const router = express.Router();

// router.get("/upcoming", async (req, res) => {
//   try {
//     const today = new Date().toISOString().split("T")[0];

//     // 1. Spotify Auth
//     const clientId = process.env["cc5f4c9fbf304384a5ae6c12a7751f61"];
//     const clientSecret = process.env["608ee54cd2e348b2bfd30173e47266ae"];

//     if (!clientId || !clientSecret) {
//       throw new Error("Spotify credentials missing in .env");
//     }

//     const spotifyAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
//       "base64"
//     );

//     const tokenRes = await axios.post(
//       "https://accounts.spotify.com/api/token",
//       "grant_type=client_credentials",
//       {
//         headers: {
//           Authorization: `Basic ${spotifyAuth}`,
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     const spotifyToken = tokenRes.data.access_token;

//     // 2. Fetch Spotify (Using New Releases endpoint)
//     const spotifyRes = await axios.get(
//       "https://api.spotify.com/v1/browse/new-releases?limit=10",
//       {
//         headers: { Authorization: `Bearer ${spotifyToken}` },
//       }
//     );

//     const spotifyData = spotifyRes.data.albums.items.map((album) => ({
//       id: `sp-${album.id}`,
//       title: album.name,
//       artist: album.artists[0]?.name,
//       date: album.release_date,
//       imageUrl: album.images[0]?.url,
//       source: "Spotify",
//     }));

//     // 3. MusicBrainz Logic
//     const mbQuery = encodeURIComponent(
//       `date:[${today} TO 2026-12-31] AND status:official`
//     );
//     const mbRes = await axios.get(
//       `https://musicbrainz.org/ws/2/release/?query=${mbQuery}&fmt=json`,
//       {
//         headers: { "User-Agent": "SocialCreators/1.0.0 (admin@9by4.com)" },
//       }
//     );

//     const musicBrainzData = mbRes.data.releases.slice(0, 5).map((release) => ({
//       id: `mb-${release.id}`,
//       title: release.title,
//       artist: release["artist-credit"]?.[0]?.name || "Unknown",
//       date: release.date,
//       imageUrl: null, // CoverArtArchive is slow; better to fetch this separately or on demand
//       source: "MusicBrainz",
//     }));

//     res.json(
//       [...spotifyData, ...musicBrainzData].sort(
//         (a, b) => new Date(a.date) - new Date(b.date)
//       )
//     );
//   } catch (error) {
//     console.error("Backend Music Error:", error.message);
//     res.status(500).json({ error: error.message });
//   }
// });

// export default router;
