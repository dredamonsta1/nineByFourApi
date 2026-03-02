import pg from "pg";
import fs from "fs/promises";
import path from "path";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const BATCH_SIZE = 700;
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
  console.log(`Batch size: ${BATCH_SIZE} artists per transaction`);
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

    // Filter for artists with valid names (no genre restriction)
    const artistsToSeed = allArtists.filter((a) => a.artist_name);

    console.log(`Found ${artistsToSeed.length} artists in db.json`);
    console.log(`Inserting in batches of ${BATCH_SIZE}...\n`);

    if (FRESH_MODE) {
      await client.query("BEGIN");
      console.log("Clearing existing artists and albums...");
      await client.query("TRUNCATE TABLE albums, artists RESTART IDENTITY CASCADE");
      await client.query("COMMIT");
      console.log("Done. Tables cleared.\n");
    }

    let artistCount = 0;
    let albumCount = 0;
    let skippedCount = 0;
    let batchNum = 0;

    for (let i = 0; i < artistsToSeed.length; i += BATCH_SIZE) {
      const batch = artistsToSeed.slice(i, i + BATCH_SIZE);
      batchNum++;
      console.log(`Batch ${batchNum}: artists ${i + 1}–${i + batch.length} of ${artistsToSeed.length}`);

      await client.query("BEGIN");
      try {
        for (const artistData of batch) {
          const artistResult = await client.query(
            `INSERT INTO artists (artist_name, aka, state, region, label, image_url, genre)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (artist_name) DO NOTHING
             RETURNING artist_id;`,
            [artistData.artist_name, artistData.aka, artistData.state,
             artistData.region, artistData.label, artistData.image_url, artistData.genre]
          );

          if (artistResult.rows.length === 0) {
            skippedCount++;
            continue;
          }

          const { artist_id } = artistResult.rows[0];
          artistCount++;

          if (artistData.albums && artistData.albums.length > 0) {
            for (const albumData of artistData.albums) {
              if (!albumData.album_name) continue;
              await client.query(
                `INSERT INTO albums (artist_id, album_name, year, certifications)
                 VALUES ($1, $2, $3, $4);`,
                [artist_id, albumData.album_name, albumData.year,
                 albumData.Certifications || albumData.certifications]
              );
              albumCount++;
            }
          }
        }

        await client.query("COMMIT");
        console.log(`  ✓ Batch ${batchNum} committed (${artistCount} inserted, ${skippedCount} skipped so far)`);
      } catch (batchErr) {
        await client.query("ROLLBACK");
        console.error(`  ✗ Batch ${batchNum} failed and rolled back:`, batchErr.message);
        console.error("Stopping. Re-run to resume — already committed batches will be skipped automatically.");
        process.exit(1);
      }
    }

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
