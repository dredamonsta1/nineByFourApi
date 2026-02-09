import pg from "pg";
import fs from "fs/promises";
import path from "path";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const ARTIST_LIMIT = 1000;
const FRESH_MODE = process.argv.includes("--fresh");

function isHipHopOrPop(genre) {
  if (!genre) return false;
  const g = genre.toLowerCase();
  return (
    g.includes("hip hop") ||
    g.includes("rap") ||
    g.includes("trap") ||
    g.includes("drill") ||
    g.includes("r&b") ||
    g.includes("pop")
  );
}

async function confirmProduction(databaseUrl) {
  const dbName = databaseUrl.split("/").pop().split("?")[0];
  const isLocal =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  console.log("===========================================");
  console.log("  PRODUCTION SEED SCRIPT");
  console.log("===========================================");
  console.log(`Target database: ${dbName}`);
  console.log(`Is local: ${isLocal}`);
  console.log(`Artists to insert: up to ${ARTIST_LIMIT} (hip hop & pop)`);
  console.log(`Fresh mode: ${FRESH_MODE ? "YES - will DELETE existing artists & albums" : "NO"}`);
  if (!FRESH_MODE) {
    console.log("Duplicate artist names will be skipped.");
  }
  console.log("===========================================");

  if (!isLocal) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise((resolve) => {
      rl.question(
        'Type "yes" to confirm seeding production: ',
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

async function seedProduction() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    console.error(
      "Usage: DATABASE_URL=postgres://... node src/seed-production.js"
    );
    process.exit(1);
  }

  await confirmProduction(databaseUrl);

  const isLocal =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

  const { Pool } = pg;
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    console.log("\nReading db.json...");
    const dataPath = path.resolve(process.cwd(), "db.json");
    const data = await fs.readFile(dataPath, "utf-8");
    const { artists: allArtists } = JSON.parse(data);

    // Filter for hip hop and pop artists with valid names
    const filtered = allArtists.filter(
      (a) => a.artist_name && isHipHopOrPop(a.genre)
    );
    const artistsToSeed = filtered.slice(0, ARTIST_LIMIT);

    console.log(`Found ${filtered.length} hip hop/pop artists in db.json`);
    console.log(`Will insert up to ${artistsToSeed.length} artists\n`);

    await client.query("BEGIN");

    if (FRESH_MODE) {
      console.log("Clearing existing artists and albums...");
      await client.query("TRUNCATE TABLE albums, artists RESTART IDENTITY CASCADE");
      console.log("Done. Tables cleared.\n");
    }

    let artistCount = 0;
    let albumCount = 0;
    let skippedCount = 0;

    for (const artistData of artistsToSeed) {
      // Insert artist, skip if name already exists
      const artistSql = `
        INSERT INTO artists (artist_name, aka, state, region, label, image_url, genre)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (artist_name) DO NOTHING
        RETURNING artist_id;
      `;
      const artistResult = await client.query(artistSql, [
        artistData.artist_name,
        artistData.aka,
        artistData.state,
        artistData.region,
        artistData.label,
        artistData.image_url,
        artistData.genre,
      ]);

      if (artistResult.rows.length === 0) {
        skippedCount++;
        continue; // Artist already exists, skip albums too
      }

      const { artist_id } = artistResult.rows[0];
      artistCount++;

      // Insert albums for the artist
      if (artistData.albums && artistData.albums.length > 0) {
        for (const albumData of artistData.albums) {
          if (!albumData.album_name) continue;
          const albumSql = `
            INSERT INTO albums (artist_id, album_name, year, certifications)
            VALUES ($1, $2, $3, $4);
          `;
          const certifications =
            albumData.Certifications || albumData.certifications;
          await client.query(albumSql, [
            artist_id,
            albumData.album_name,
            albumData.year,
            certifications,
          ]);
          albumCount++;
        }
      }

      // Progress log every 100 artists
      if (artistCount % 100 === 0) {
        console.log(`  Inserted ${artistCount} artists so far...`);
      }
    }

    await client.query("COMMIT");

    console.log("\n--------------------");
    console.log("Seeding complete!");
    console.log(`Artists inserted: ${artistCount}`);
    console.log(`Artists skipped (already existed): ${skippedCount}`);
    console.log(`Albums inserted: ${albumCount}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error during database seeding:", err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

seedProduction();
