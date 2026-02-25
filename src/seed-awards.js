// src/seed-awards.js
// Fetches artist awards from Wikidata SPARQL and inserts into the awards table.
// Safe to run multiple times — existing data is never deleted or overwritten.
//
// Usage: node src/seed-awards.js

import axios from "axios";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const isLocal =
  process.env.DATABASE_URL.includes("localhost") ||
  process.env.DATABASE_URL.includes("127.0.0.1");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const BATCH_SIZE = 50;   // artists per SPARQL request
const DELAY_MS = 1500;   // polite delay between requests

// ---------------------------------------------------------------------------
// Name aliases: DB name → Wikidata label
// Add entries here whenever a DB artist name doesn't match Wikidata exactly.
// ---------------------------------------------------------------------------
const NAME_ALIASES = {
  "Jaÿ-Z": "Jay-Z",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// SPARQL helper
// ---------------------------------------------------------------------------
async function sparqlQuery(query) {
  const response = await axios.post(
    SPARQL_ENDPOINT,
    new URLSearchParams({ query }),
    {
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "NineByFourAwardsBot/1.0 (https://github.com/dredamonsta1/nineByFourApi)",
      },
      timeout: 45000,
    }
  );
  return response.data.results.bindings;
}

// ---------------------------------------------------------------------------
// Award label parsers
// ---------------------------------------------------------------------------
const SHOW_PATTERNS = [
  [/^Grammy Award/, "Grammy Awards"],
  [/^BET Hip Hop Award/, "BET Hip Hop Awards"],
  [/^BET Award/, "BET Awards"],
  [/^MTV Video Music Award/, "MTV VMAs"],
  [/^MTV Europe Music Award/, "MTV EMAs"],
  [/^MTV Award/, "MTV Awards"],
  [/^American Music Award/, "American Music Awards"],
  [/^Billboard Music Award/, "Billboard Music Awards"],
  [/^Soul Train (Music )?Award/, "Soul Train Awards"],
  [/^NAACP Image Award/, "NAACP Image Awards"],
  [/^iHeartRadio Music Award/, "iHeartRadio Music Awards"],
  [/^Nickelodeon Kids' Choice Award/, "Kids' Choice Awards"],
  [/^Teen Choice Award/, "Teen Choice Awards"],
  [/^People's Choice Award/, "People's Choice Awards"],
  [/^YouTube Music Award/, "YouTube Music Awards"],
];

function parseShow(label) {
  for (const [re, show] of SHOW_PATTERNS) {
    if (re.test(label)) return show;
  }
  return null;
}

function parseCategory(label) {
  const match = label.match(/ for (.+)$/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Step 1: match artist_name strings to Wikidata QIDs
// ---------------------------------------------------------------------------
async function matchNamesToQIDs(artists) {
  const valuesClause = artists
    .map((a) => `"${a.artist_name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"@en`)
    .join(" ");

  const query = `
    SELECT DISTINCT ?item ?name WHERE {
      VALUES ?name { ${valuesClause} }
      ?item rdfs:label ?name .
      ?item wdt:P106 ?occ .
      FILTER(?occ IN (
        wd:Q639669,   # rapper
        wd:Q488205,   # hip hop musician
        wd:Q753110,   # musician
        wd:Q177220,   # singer
        wd:Q36834,    # composer
        wd:Q1371941   # disc jockey
      ))
    }
  `;

  try {
    const rows = await sparqlQuery(query);
    const map = new Map();
    for (const row of rows) {
      const name = row.name.value;
      const qid = row.item.value.split("/").pop();
      if (!map.has(name)) map.set(name, qid); // keep first match
    }
    return map;
  } catch (err) {
    console.error("  SPARQL name-match error:", err.message);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Step 2: fetch awards for a batch of QIDs
// ---------------------------------------------------------------------------
async function fetchAwardsForQIDs(qids) {
  const valuesClause = qids.map((q) => `wd:${q}`).join(" ");

  const query = `
    SELECT ?item ?awardLabel ?year WHERE {
      VALUES ?item { ${valuesClause} }
      ?item p:P166 ?stmt .
      ?stmt ps:P166 ?award .
      OPTIONAL { ?stmt pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
  `;

  try {
    return await sparqlQuery(query);
  } catch (err) {
    console.error("  SPARQL awards-fetch error:", err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("===========================================");
  console.log("  AWARDS SEED SCRIPT");
  console.log("  Existing data will NOT be modified.");
  console.log("===========================================\n");

  // 0. Ensure awards table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS awards (
      award_id SERIAL PRIMARY KEY,
      artist_id INTEGER NOT NULL,
      award_name VARCHAR(255) NOT NULL,
      show VARCHAR(255),
      category VARCHAR(255),
      year INTEGER,
      FOREIGN KEY (artist_id) REFERENCES artists(artist_id) ON DELETE CASCADE
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_awards_artist_id ON awards(artist_id);`);
  console.log("Awards table ready.\n");

  // 1. Load hip-hop/rap artists only (excludes the 100k+ Wikidata-seeded artists)
  const { rows: artists } = await pool.query(`
    SELECT artist_id, artist_name FROM artists
    WHERE genre ILIKE '%hip hop%'
       OR genre ILIKE '%rap%'
       OR genre ILIKE '%trap%'
       OR genre ILIKE '%drill%'
       OR genre ILIKE '%r&b%'
    ORDER BY artist_id
  `);
  console.log(`Loaded ${artists.length} hip-hop/rap artists from DB\n`);

  const artistIdByName = new Map(artists.map((a) => [a.artist_name, a.artist_id]));

  // Build reverse alias map: Wikidata name → DB name
  const wikidataToDbName = new Map(
    Object.entries(NAME_ALIASES).map(([db, wikidata]) => [wikidata, db])
  );

  // Apply aliases so SPARQL searches use the Wikidata-compatible name
  const artistsForSearch = artists.map((a) => ({
    ...a,
    artist_name: NAME_ALIASES[a.artist_name] ?? a.artist_name,
  }));

  // 2. Match names → QIDs in batches
  const nameToQID = new Map(); // keyed by DB name
  const totalNameBatches = Math.ceil(artistsForSearch.length / BATCH_SIZE);

  for (let i = 0; i < artistsForSearch.length; i += BATCH_SIZE) {
    const batch = artistsForSearch.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`Matching names [${batchNum}/${totalNameBatches}]... `);

    const map = await matchNamesToQIDs(batch);
    for (const [wikidataName, qid] of map) {
      // Convert back to DB name (via alias reverse map, or use as-is)
      const dbName = wikidataToDbName.get(wikidataName) ?? wikidataName;
      nameToQID.set(dbName, qid);
    }

    console.log(`${map.size} matched`);
    await sleep(DELAY_MS);
  }

  const matchedCount = nameToQID.size;
  const unmatchedNames = artists
    .map((a) => a.artist_name)
    .filter((n) => !nameToQID.has(n));

  console.log(`\nMatched: ${matchedCount}/${artists.length} artists`);
  if (unmatchedNames.length) {
    console.log(`Unmatched (${unmatchedNames.length}): ${unmatchedNames.slice(0, 10).join(", ")}${unmatchedNames.length > 10 ? "..." : ""}`);
  }

  if (matchedCount === 0) {
    console.log("\nNo matches found. Exiting.");
    await pool.end();
    return;
  }

  // Build QID → artist_id
  const qidToArtistId = new Map();
  for (const [name, qid] of nameToQID) {
    const id = artistIdByName.get(name);
    if (id) qidToArtistId.set(qid, id);
  }

  // 3. Fetch awards in batches
  const qids = [...qidToArtistId.keys()];
  const totalAwardBatches = Math.ceil(qids.length / BATCH_SIZE);
  let totalInserted = 0;
  let totalSkipped = 0;

  console.log(`\nFetching awards for ${qids.length} artists...\n`);

  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`Awards batch [${batchNum}/${totalAwardBatches}]... `);

    const rows = await fetchAwardsForQIDs(batch);
    let batchInserted = 0;

    for (const row of rows) {
      const qid = row.item.value.split("/").pop();
      const artistId = qidToArtistId.get(qid);
      if (!artistId) continue;

      const awardName = row.awardLabel?.value;
      if (!awardName || awardName.startsWith("Q")) continue; // skip unlabelled items

      const year = row.year ? parseInt(row.year.value) : null;
      const show = parseShow(awardName);
      const category = parseCategory(awardName);

      try {
        // Only insert if this exact award+year doesn't already exist for this artist
        const result = await pool.query(
          `INSERT INTO awards (artist_id, award_name, show, category, year)
           SELECT $1::int, $2::text, $3::text, $4::text, $5::int
           WHERE NOT EXISTS (
             SELECT 1 FROM awards
             WHERE artist_id = $1::int
               AND award_name = $2::text
               AND (year IS NOT DISTINCT FROM $5::int)
           )`,
          [artistId, awardName, show, category, year]
        );
        if (result.rowCount > 0) {
          batchInserted++;
          totalInserted++;
        } else {
          totalSkipped++;
        }
      } catch (err) {
        console.error(`\n  Insert error (artist_id=${artistId}):`, err.message);
      }
    }

    console.log(`${rows.length} awards found, ${batchInserted} inserted`);
    await sleep(DELAY_MS);
  }

  console.log("\n===========================================");
  console.log(`  Done!`);
  console.log(`  Inserted: ${totalInserted} new awards`);
  console.log(`  Skipped (already existed): ${totalSkipped}`);
  console.log("===========================================");

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
