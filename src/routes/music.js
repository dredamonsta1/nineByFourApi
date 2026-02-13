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

// import express from "express";
// import axios from "axios";
// const router = express.Router();

// router.get("/upcoming", async (req, res) => {
//   try {
//     const today = new Date().toISOString().split("T")[0];

//     // --- 1. SPOTIFY LOGIC ---
//     const spotifyAuth = Buffer.from(
//       `${process.env["cc5f4c9fbf304384a5ae6c12a7751f61"]}:${process.env["608ee54cd2e348b2bfd30173e47266ae"]}`
//     ).toString("base64");

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

//     // --- 2. MUSICBRAINZ LOGIC ---
//     const mbQuery = encodeURIComponent(
//       `date:[${today} TO 2999-12-31] AND status:official`
//     );
//     const mbRes = await axios.get(
//       `https://musicbrainz.org/ws/2/release/?query=${mbQuery}&fmt=json`,
//       {
//         headers: {
//           "User-Agent": "SocialCreators/1.0.0 (your-email@example.com)",
//         },
//       }
//     );

//     // Fetch cover art concurrently on the server
//     const musicBrainzData = await Promise.all(
//       mbRes.data.releases.slice(0, 10).map(async (release) => {
//         let imageUrl = null;
//         try {
//           const caRes = await axios.get(
//             `https://coverartarchive.org/release/${release.id}`
//           );
//           imageUrl =
//             caRes.data.images?.[0]?.thumbnails?.small ||
//             caRes.data.images?.[0]?.image;
//         } catch (e) {
//           /* ignore 404s from cover art archive */
//         }

//         return {
//           id: `mb-${release.id}`,
//           title: release.title,
//           artist: release["artist-credit"]?.[0]?.name || "Unknown Artist",
//           date: release.date,
//           imageUrl: imageUrl,
//           source: "MusicBrainz",
//         };
//       })
//     );

//     // --- 3. COMBINE AND SORT ---
//     const combined = [...spotifyData, ...musicBrainzData].sort(
//       (a, b) => new Date(a.date) - new Date(b.date)
//     );

//     res.json(combined);
//   } catch (error) {
//     console.error("Music Aggregator Error:", error.message);
//     res.status(500).json({ error: "Internal Server Error fetching music" });
//   }
// });

// export default router;

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

// ********************end of old code above********************/

import express from "express";
import axios from "axios";
const router = express.Router();

// Simple in-memory cache (15 min TTL)
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 15 * 60 * 1000;

async function withRetry(fn, retries = 2, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function fetchSpotifyReleases() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.warn("Spotify env vars missing, skipping Spotify source");
    return [];
  }

  const authBuffer = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const tokenRes = await axios.post(
    "https://accounts.spotify.com/api/token",
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${authBuffer}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const token = tokenRes.data.access_token;

  const spotifyRes = await axios.get(
    "https://api.spotify.com/v1/browse/new-releases?limit=20",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return spotifyRes.data.albums.items.map((album) => ({
    id: `sp-${album.id}`,
    title: album.name,
    artist: album.artists[0]?.name || "Unknown Artist",
    date: album.release_date,
    imageUrl: album.images[0]?.url || null,
    source: "Spotify",
  }));
}

async function fetchMusicBrainzReleases() {
  const today = new Date().toISOString().split("T")[0];
  const mbQuery = encodeURIComponent(
    `date:[${today} TO 2027-12-31] AND status:official`
  );

  const mbRes = await axios.get(
    `https://musicbrainz.org/ws/2/release/?query=${mbQuery}&fmt=json&limit=15`,
    {
      headers: {
        "User-Agent": "9by4App/1.0.0 ( admin@arspar.io )",
        Accept: "application/json",
      },
      timeout: 10000,
    }
  );

  // Map releases first, then fetch cover art sequentially to avoid rate limits
  const releases = mbRes.data.releases.map((release) => ({
    id: `mb-${release.id}`,
    mbid: release.id,
    title: release.title,
    artist: release["artist-credit"]?.[0]?.name || "Unknown Artist",
    date: release.date || null,
    imageUrl: null,
    source: "MusicBrainz",
  }));

  // Fetch cover art one at a time with small delay to respect rate limits
  for (const release of releases) {
    try {
      const caRes = await axios.get(
        `https://coverartarchive.org/release/${release.mbid}`,
        { timeout: 3000 }
      );
      release.imageUrl =
        caRes.data.images?.[0]?.thumbnails?.small ||
        caRes.data.images?.[0]?.thumbnails?.["250"] ||
        caRes.data.images?.[0]?.image ||
        null;
    } catch {
      // 404 or timeout — no cover art available
    }
  }

  // Remove internal mbid before returning
  return releases.map(({ mbid, ...rest }) => rest);
}

router.get("/upcoming", async (req, res) => {
  try {
    // Return cached data if still fresh
    if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
      return res.json(cache.data);
    }

    const today = new Date().toISOString().split("T")[0];

    // Fetch both sources in parallel with retry; if one fails, use the other
    const results = await Promise.allSettled([
      withRetry(() => fetchSpotifyReleases(), 1, 500),
      withRetry(() => fetchMusicBrainzReleases(), 2, 2000),
    ]);

    const spotifyData =
      results[0].status === "fulfilled" ? results[0].value : [];
    const mbData =
      results[1].status === "fulfilled" ? results[1].value : [];

    if (results[0].status === "rejected") {
      console.error("Spotify fetch failed:", results[0].reason?.message);
    }
    if (results[1].status === "rejected") {
      console.error("MusicBrainz fetch failed:", results[1].reason?.message);
    }

    // Combine and filter to only include releases from today onward
    const combined = [...spotifyData, ...mbData].filter(
      (r) => r.date && r.date >= today
    );

    // Deduplicate by title+artist (case-insensitive)
    const seen = new Map();
    const unique = [];
    for (const release of combined) {
      const key = `${release.title.toLowerCase()}-${release.artist.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        unique.push(release);
      }
    }

    // Sort by release date ascending (soonest first)
    unique.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Cache the result
    cache = { data: unique, timestamp: Date.now() };

    res.json(unique);
  } catch (error) {
    console.error("Music Aggregator Error:", error.message);
    // Return stale cache if available
    if (cache.data) return res.json(cache.data);
    res.status(500).json({ error: "Failed to fetch upcoming music" });
  }
});

export default router;
