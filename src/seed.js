import { pool } from "./connect.js";
import fs from "fs/promises";
import path from "path";

async function seedDatabase() {
  const client = await pool.connect();
  try {
    console.log("Starting to seed the database...");
    await client.query("BEGIN"); // Start transaction

    // Clear existing data to prevent duplicates on re-seeding
    console.log("Clearing existing tables...");
    await client.query(
      "TRUNCATE TABLE albums, artists, posts, users RESTART IDENTITY CASCADE"
    );

    // Read data from db.json
    const dataPath = path.resolve(process.cwd(), "db.json");
    const data = await fs.readFile(dataPath, "utf-8");
    const { artists: artistsToSeed } = JSON.parse(data);

    let artistCount = 0;
    let albumCount = 0;

    for (const artistData of artistsToSeed) {
      // Skip empty artist entries from db.json
      if (!artistData.name) {
        continue;
      }

      // Insert artist
      const artistSql = `
        INSERT INTO artists (artist_name, aka, state, region, label)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING artist_id;
      `;
      const artistResult = await client.query(artistSql, [
        artistData.name,
        artistData.aka,
        artistData.state,
        artistData.region,
        artistData.label,
      ]);
      const { artist_id } = artistResult.rows[0];
      artistCount++;

      // Insert albums for the artist
      if (artistData.albums && artistData.albums.length > 0) {
        for (const albumData of artistData.albums) {
          if (!albumData.name) continue;
          const albumSql = `INSERT INTO albums (artist_id, album_name, year, certifications) VALUES ($1, $2, $3, $4);`;
          // Handle inconsistent key casing ('Certifications' vs 'certifications')
          const certifications =
            albumData.Certifications || albumData.certifications;
          await client.query(albumSql, [
            artist_id,
            albumData.name,
            albumData.year,
            certifications,
          ]);
          albumCount++;
        }
      }
    }

    await client.query("COMMIT"); // Commit transaction
    console.log("--------------------");
    console.log("Seeding complete!");
    console.log(`Total artists inserted: ${artistCount}`);
    console.log(`Total albums inserted: ${albumCount}`);
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback on error
    console.error("Error during database seeding:", err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end(); // Close the pool to allow the script to exit
  }
}

seedDatabase();
