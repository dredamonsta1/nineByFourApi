// src/enrich-artists.js
// Fetches genre, state, region, and label from Wikidata for artists
// that are missing those fields in the DB. Updates the DB directly.
//
// Usage: node src/enrich-artists.js
// Flags: --dry-run  (preview only, no DB writes)

import pg from "pg";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 200;   // artist names per SPARQL request
const DELAY_MS = 2000;    // polite delay between Wikidata requests
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

const { Pool } = pg;
const isLocal =
  process.env.DATABASE_URL.includes("localhost") ||
  process.env.DATABASE_URL.includes("127.0.0.1");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// US state name -> abbreviation
const US_STATES = {
  "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
  "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
  "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
  "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
  "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
  "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
  "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
  "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
  "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
  "vermont": "VT", "virginia": "VA", "washington": "WA",
  "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
  "district of columbia": "DC",
};

const REGION_MAP = {
  "CA": "West Coast", "OR": "West Coast", "WA": "West Coast",
  "NY": "East Coast", "NJ": "East Coast", "CT": "East Coast",
  "MA": "East Coast", "PA": "East Coast", "MD": "East Coast",
  "DE": "East Coast", "RI": "East Coast", "NH": "East Coast",
  "VT": "East Coast", "ME": "East Coast", "DC": "East Coast", "VA": "East Coast",
  "GA": "South", "FL": "South", "TX": "South", "LA": "South",
  "AL": "South", "MS": "South", "TN": "South", "SC": "South",
  "NC": "South", "AR": "South", "KY": "South",
  "IL": "Midwest", "OH": "Midwest", "MI": "Midwest", "IN": "Midwest",
  "WI": "Midwest", "MN": "Midwest", "MO": "Midwest", "IA": "Midwest",
  "KS": "Midwest", "NE": "Midwest", "SD": "Midwest", "ND": "Midwest",
  "CO": "West Coast", "NV": "West Coast", "AZ": "West Coast",
  "NM": "West Coast", "UT": "West Coast", "HI": "West Coast",
  "AK": "West Coast", "ID": "West Coast", "MT": "West Coast", "WY": "West Coast",
  "OK": "South", "WV": "South",
};

function resolveLocation(birthplace, country) {
  const bp = (birthplace || "").toLowerCase();
  for (const [stateName, abbr] of Object.entries(US_STATES)) {
    if (bp.includes(stateName)) {
      return { state: abbr, region: REGION_MAP[abbr] || null };
    }
  }
  if (country) return { state: country, region: null };
  return { state: null, region: null };
}

function escapeForSparql(name) {
  return name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function fetchMetadataBatch(names) {
  const values = names
    .filter((n) => n && n.trim().length >= 2)
    .map((n) => `"${escapeForSparql(n)}"@en`)
    .join(" ");

  const query = `
    SELECT ?artistLabel
           (GROUP_CONCAT(DISTINCT ?genreLabel; separator=" / ") AS ?genres)
           (SAMPLE(?countryLabel) AS ?country)
           (SAMPLE(?birthplaceLabel) AS ?birthplace)
           (SAMPLE(?labelLabel) AS ?recordLabel)
    WHERE {
      VALUES ?artistLabel { ${values} }
      ?artist rdfs:label ?artistLabel .
      FILTER(LANG(?artistLabel) = "en")
      OPTIONAL { ?artist wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }
      OPTIONAL { ?artist wdt:P27 ?country_ . ?country_ rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "en") }
      OPTIONAL { ?artist wdt:P19 ?birthplace_ . ?birthplace_ rdfs:label ?birthplaceLabel . FILTER(LANG(?birthplaceLabel) = "en") }
      OPTIONAL { ?artist wdt:P264 ?label_ . ?label_ rdfs:label ?labelLabel . FILTER(LANG(?labelLabel) = "en") }
    }
    GROUP BY ?artistLabel
  `;

  try {
    const res = await axios.post(
      SPARQL_ENDPOINT,
      new URLSearchParams({ query }),
      {
        headers: {
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "9by4ArtistEnricher/1.0",
        },
        timeout: 60000,
      }
    );
    return res.data.results.bindings;
  } catch (err) {
    if (err.response?.status === 429 || err.response?.status === 503) {
      console.log("  Rate limited, waiting 15s...");
      await sleep(15000);
    } else {
      console.error("  SPARQL error:", err.message);
    }
    return [];
  }
}

async function main() {
  console.log("===========================================");
  console.log("  ARTIST ENRICHMENT SCRIPT (Wikidata)");
  console.log(`  Dry run: ${DRY_RUN ? "YES" : "NO"}`);
  console.log("===========================================\n");

  // Load artists missing at least one field
  const { rows: artists } = await pool.query(`
    SELECT artist_id, artist_name
    FROM artists
    WHERE (genre IS NULL OR genre = '')
       OR (state IS NULL OR state = '')
       OR (label IS NULL OR label = '')
    ORDER BY artist_id
  `);

  console.log(`Found ${artists.length} artists missing metadata.\n`);

  const totalBatches = Math.ceil(artists.length / BATCH_SIZE);
  let totalUpdated = 0;
  let totalMatched = 0;

  for (let i = 0; i < artists.length; i += BATCH_SIZE) {
    const batch = artists.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(
      `Batch ${batchNum}/${totalBatches} (${batch.length} artists)... `
    );

    const names = batch.map((a) => a.artist_name);
    const nameToId = new Map(batch.map((a) => [a.artist_name, a.artist_id]));

    const rows = await fetchMetadataBatch(names);
    let batchMatched = 0;

    for (const row of rows) {
      const name = row.artistLabel?.value?.trim();
      if (!name) continue;

      const artistId = nameToId.get(name);
      if (!artistId) continue;

      const genresRaw = row.genres?.value || "";
      const genreList = genresRaw.split(" / ").map((g) => g.trim()).filter(Boolean).slice(0, 3);
      let genre = genreList.length > 0 ? genreList.join(" / ") : null;
      if (genre && genre.length > 100) genre = genre.slice(0, 97) + "...";

      const birthplace = row.birthplace?.value || "";
      const country = row.country?.value || "";
      const { state, region } = resolveLocation(birthplace, country);
      const label = row.recordLabel?.value || null;

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE artists SET
            genre  = COALESCE(NULLIF(genre, ''),  $1),
            state  = COALESCE(NULLIF(state, ''),  $2),
            region = COALESCE(NULLIF(region, ''), $3),
            label  = COALESCE(NULLIF(label, ''),  $4)
           WHERE artist_id = $5`,
          [genre, state, region, label, artistId]
        );
      }

      batchMatched++;
      totalMatched++;
    }

    totalUpdated += batchMatched;
    console.log(`${rows.length} returned, ${batchMatched} matched & updated`);

    await sleep(DELAY_MS);
  }

  console.log("\n===========================================");
  console.log(DRY_RUN ? "  DRY RUN COMPLETE" : "  ENRICHMENT COMPLETE");
  console.log(`  Artists matched & updated: ${totalUpdated}`);
  console.log(`  Artists with no Wikidata match: ${artists.length - totalMatched}`);
  console.log("===========================================");

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
