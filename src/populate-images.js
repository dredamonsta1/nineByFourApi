import pg from "pg";
import axios from "axios";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const REQUEST_DELAY = 100; // ms between Spotify API calls

// --- Spotify Auth ---
let tokenData = { token: null, expiresAt: 0 };

async function getSpotifyToken() {
  if (Date.now() < tokenData.expiresAt - 60000) {
    return tokenData.token;
  }

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error(
      "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in environment"
    );
  }

  const authBuffer = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${authBuffer}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  tokenData = {
    token: res.data.access_token,
    expiresAt: Date.now() + res.data.expires_in * 1000,
  };
  return tokenData.token;
}

// --- Rate-limit-aware Spotify request ---
async function spotifyGet(url) {
  const token = await getSpotifyToken();
  while (true) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.data;
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter =
          parseInt(err.response.headers["retry-after"] || "5", 10) + 1;
        console.log(`  Rate limited. Waiting ${retryAfter}s...`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      throw err;
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Production confirmation ---
async function confirmRun(databaseUrl) {
  const dbName = databaseUrl.split("/").pop().split("?")[0];
  const isLocal =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  console.log("===========================================");
  console.log("  SPOTIFY IMAGE POPULATION SCRIPT");
  console.log("===========================================");
  console.log(`Target database: ${dbName}`);
  console.log(`Is local: ${isLocal}`);
  console.log(`Dry run: ${DRY_RUN ? "YES (no DB writes)" : "NO"}`);
  console.log(`Skip existing images: ${SKIP_EXISTING}`);
  console.log("===========================================");

  if (!isLocal && !DRY_RUN) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise((resolve) => {
      rl.question(
        'This will UPDATE production data. Type "yes" to confirm: ',
        resolve
      );
    });
    rl.close();
    if (answer.toLowerCase() !== "yes") {
      console.log("Aborted.");
      process.exit(0);
    }
  }
}

// --- Main ---
async function populateImages() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  await confirmRun(databaseUrl);

  const isLocal =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    // Ensure columns exist
    await pool.query(
      `ALTER TABLE albums ADD COLUMN IF NOT EXISTS album_image_url TEXT;`
    );
    await pool.query(`ALTER TABLE artists ALTER COLUMN image_url TYPE TEXT;`);

    // Fetch all artists
    const artistsRes = await pool.query(
      "SELECT artist_id, artist_name, image_url FROM artists ORDER BY artist_id"
    );
    const artists = artistsRes.rows;
    console.log(`\nFound ${artists.length} artists in database.\n`);

    let artistsUpdated = 0;
    let artistsSkipped = 0;
    let artistsFailed = 0;
    let albumsUpdated = 0;
    let albumsSkipped = 0;
    let albumsFailed = 0;

    for (let i = 0; i < artists.length; i++) {
      const artist = artists[i];

      // --- Artist image ---
      if (SKIP_EXISTING && artist.image_url) {
        artistsSkipped++;
      } else {
        try {
          const q = encodeURIComponent(artist.artist_name);
          const data = await spotifyGet(
            `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=1`
          );
          await sleep(REQUEST_DELAY);

          const match = data.artists?.items?.[0];
          if (match && match.images?.length > 0) {
            // Basic name validation: compare lowercase
            const dbName = artist.artist_name.toLowerCase();
            const spName = match.name.toLowerCase();
            if (spName === dbName || spName.includes(dbName) || dbName.includes(spName)) {
              const imageUrl = match.images[0].url;
              if (!DRY_RUN) {
                await pool.query(
                  "UPDATE artists SET image_url = $1 WHERE artist_id = $2",
                  [imageUrl, artist.artist_id]
                );
              }
              artistsUpdated++;
            } else {
              artistsFailed++;
            }
          } else {
            artistsFailed++;
          }
        } catch (err) {
          console.error(
            `  Error fetching artist "${artist.artist_name}":`,
            err.message
          );
          artistsFailed++;
        }
      }

      // --- Album images ---
      const albumsRes = await pool.query(
        "SELECT album_id, album_name, album_image_url FROM albums WHERE artist_id = $1",
        [artist.artist_id]
      );

      for (const album of albumsRes.rows) {
        if (SKIP_EXISTING && album.album_image_url) {
          albumsSkipped++;
          continue;
        }

        try {
          const q = encodeURIComponent(
            `album:${album.album_name} artist:${artist.artist_name}`
          );
          const data = await spotifyGet(
            `https://api.spotify.com/v1/search?q=${q}&type=album&limit=1`
          );
          await sleep(REQUEST_DELAY);

          const match = data.albums?.items?.[0];
          if (match && match.images?.length > 0) {
            // Use 300px image (index 1) or fallback to largest
            const imageUrl =
              match.images[1]?.url || match.images[0]?.url;
            if (!DRY_RUN) {
              await pool.query(
                "UPDATE albums SET album_image_url = $1 WHERE album_id = $2",
                [imageUrl, album.album_id]
              );
            }
            albumsUpdated++;
          } else {
            albumsFailed++;
          }
        } catch (err) {
          console.error(
            `  Error fetching album "${album.album_name}":`,
            err.message
          );
          albumsFailed++;
        }
      }

      // Progress log every 50 artists
      if ((i + 1) % 50 === 0 || i + 1 === artists.length) {
        console.log(
          `  Progress: ${i + 1}/${artists.length} artists processed...`
        );
      }
    }

    console.log("\n===========================================");
    console.log(DRY_RUN ? "DRY RUN COMPLETE" : "POPULATION COMPLETE");
    console.log("===========================================");
    console.log(`Artists updated: ${artistsUpdated}`);
    console.log(`Artists skipped (existing): ${artistsSkipped}`);
    console.log(`Artists not found on Spotify: ${artistsFailed}`);
    console.log(`Albums updated: ${albumsUpdated}`);
    console.log(`Albums skipped (existing): ${albumsSkipped}`);
    console.log(`Albums not found on Spotify: ${albumsFailed}`);
  } catch (err) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  } finally {
    pool.end();
  }
}

populateImages();
