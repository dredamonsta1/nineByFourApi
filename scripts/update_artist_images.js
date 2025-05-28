// scripts/update_artist_images.js

// Ensure you have sqlite3 and sqlite packages installed:
// npm install sqlite3 sqlite

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables (for Heroku or local setup if DB_PATH is in .env)
dotenv.config();

// --- Configuration ---
// Adjust these paths if your 'db' or 'uploads' folder is not directly in your project root
const DB_PATH = path.resolve(process.cwd(), "rapper.db");
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
// --- End Configuration ---

async function updateArtistImages() {
  console.log("Starting image update script...");
  console.log(`Database path: ${DB_PATH}`);
  console.log(`Uploads directory: ${UPLOADS_DIR}`);

  let db;
  try {
    // Open a new database connection specifically for this script
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });
    console.log(`Successfully connected to database.`);
  } catch (dbErr) {
    console.error("ERROR: Could not connect to database:", dbErr.message);
    console.error(
      "Please ensure the database file exists at the specified path and is accessible."
    );
    return; // Exit if DB connection fails
  }

  // 1. Get all artist names and their current image_urls from the database
  let artists;
  try {
    artists = await db.all(
      "SELECT artist_id, artist_name, image_url FROM rappers"
    );
    console.log(`Found ${artists.length} artists in the database.`);
  } catch (dbErr) {
    console.error(
      "ERROR: Error fetching artists from database:",
      dbErr.message
    );
    await db.close(); // Close DB on error
    return;
  }

  // 2. Get all image filenames from the uploads directory
  let imageFiles;
  try {
    // Ensure the 'uploads' directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      console.error(
        `ERROR: The 'uploads' directory does not exist at: ${UPLOADS_DIR}`
      );
      console.error(
        "Please ensure you have an 'uploads' folder containing your images."
      );
      await db.close();
      return;
    }

    imageFiles = fs.readdirSync(UPLOADS_DIR).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext); // Added .webp
    });
    console.log(`Found ${imageFiles.length} image files in ${UPLOADS_DIR}.`);
  } catch (fsErr) {
    console.error(
      `ERROR: Error reading 'uploads' directory (${UPLOADS_DIR}):`,
      fsErr.message
    );
    console.error(
      "Please ensure the 'uploads' directory has read permissions."
    );
    await db.close(); // Close DB on error
    return;
  }

  let updatedCount = 0;
  let notFoundCount = 0;

  // Helper to normalize artist names and filenames for matching
  const normalizeName = (name) => {
    // Remove spaces, hyphens, underscores, periods, and convert to lowercase
    // This helps match names like "Kendrick Lamar" to "kendrick-lamar.jpg"
    return name.toLowerCase().replace(/[\s\-_.]/g, "");
  };

  // Create a map of normalized filenames to their original '/uploads/filename' path
  const imageMap = new Map();
  imageFiles.forEach((file) => {
    const baseName = path.basename(file, path.extname(file)); // e.g., 'kendrick-lamar'
    const normalizedBaseName = normalizeName(baseName); // e.g., 'kendricklamar'
    imageMap.set(normalizedBaseName, `/uploads/${file}`); // Store '/uploads/kendrick-lamar.jpg'
  });

  // 3. Iterate through artists and try to find a matching image
  for (const artist of artists) {
    const normalizedArtistName = normalizeName(artist.artist_name);

    let imageUrl = imageMap.get(normalizedArtistName);

    if (imageUrl) {
      // Check if the image_url is already set to the found URL to avoid unnecessary updates
      if (artist.image_url === imageUrl) {
        console.log(
          `Skipping ${artist.artist_name}: image_url already set to ${imageUrl}`
        );
      } else {
        try {
          await db.run("UPDATE rappers SET image_url = ? WHERE artist_id = ?", [
            imageUrl,
            artist.artist_id,
          ]);
          console.log(`Updated ${artist.artist_name} with image: ${imageUrl}`);
          updatedCount++;
        } catch (updateErr) {
          console.error(
            `ERROR: Error updating image for ${artist.artist_name}:`,
            updateErr.message
          );
        }
      }
    } else {
      console.log(
        `No matching image found for artist: ${artist.artist_name} (normalized: "${normalizedArtistName}")`
      );
      notFoundCount++;
    }
  }

  // 4. Close the database connection
  await db.close();
  console.log("Database connection closed.");

  console.log("\n-----------------------------------------");
  console.log(`Image update script finished.`);
  console.log(`Total artists processed: ${artists.length}`);
  console.log(`Artists updated with new image URL: ${updatedCount}`);
  console.log(
    `Artists for which no matching image was found: ${notFoundCount}`
  );
  console.log("-----------------------------------------\n");
  console.log(
    "IMPORTANT: Remember to restart your Node.js backend server once this script completes!"
  );
}

// Execute the script and catch any unhandled errors
updateArtistImages().catch(console.error);
