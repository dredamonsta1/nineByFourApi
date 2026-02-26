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
// Direct QID overrides: DB name → Wikidata QID
// Used for artists with no rdfs:label, disambiguation issues, or groups.
// Takes priority over name matching entirely.
// ---------------------------------------------------------------------------
const DIRECT_QIDS = {
  // No rdfs:label in Wikidata
  "Eminem":              "Q5608",
  "Snoop Dogg":          "Q6096",
  // Disambiguation (multiple entities share the name)
  "Travis Scott":        "Q13605596",
  "Future":              "Q3445057",
  "Nas":                 "Q194220",
  "Gunna":               "Q55613105",
  "SZA":                 "Q16210722",
  "Summer Walker":       "Q64177065",
  "DMX":                 "Q223769",
  "JID":                 "Q29588830",
  "J.I.D":               "Q29588830",
  "Michael Jackson":     "Q2831",
  "Trina":               "Q257150",
  "The Game":            "Q189936",
  "YG":                  "Q3076050",
  "Jim Jones":           "Q707008",
  // Groups (use P31 not P106, bypasses occupation filter)
  "Migos":               "Q15777045",
  "Wu-Tang Clan":        "Q52463",
  "BTS":                 "Q13580495",
  "OutKast":             "Q472595",
  "Three 6 Mafia":       "Q1027165",
  "The Roots":           "Q1052139",
  "Tha Dogg Pound":      "Q1070141",
  "UGK":                 "Q1153351",
  "8Ball & MJG":         "Q1360723",
  "Run-DMC":             "Q159351",
  "N.W.A":               "Q216856",
  "Goodie Mob":          "Q287142",
  "EPMD":                "Q291286",
  "A Tribe Called Quest":"Q300602",
  "Bone Thugs-n-Harmony":"Q4444669",
  "Bone Thugs-N-Harmony":"Q4444669",
  "De La Soul":          "Q685595",
  "Mobb Deep":           "Q727115",
  "TLC":                 "Q742804",
  "Gang Starr":          "Q844524",
  "The Diplomats":       "Q201909",
  "Dipset":              "Q201909",
  "Public Enemy":        "Q209182",
  // Wikidata label uses $ sign (same as DB)
  "A$AP Rocky":          "Q129910",
  // Other known QIDs for reliability
  "Jay-Z":               "Q62766",
  "Dr. Dre":             "Q6078",
  "Lil Wayne":           "Q15615",
  "Lil Baby":            "Q50527563",
  "Lil Durk":            "Q2899818",
  "DaBaby":              "Q62107457",
  "Young Thug":          "Q15637814",
  "Gucci Mane":          "Q206032",
  "Playboi Carti":       "Q27671080",
  "Pop Smoke":           "Q81698554",
  "Metro Boomin":        "Q16235273",
  "Kodak Black":         "Q22005867",
  "Pusha T":             "Q2329709",
  "Lil Uzi Vert":        "Q23771950",
  "21 Savage":           "Q25095399",
  "Mac Miller":          "Q324726",
  "MF DOOM":             "Q304675",
  "Juice WRLD":          "Q52151598",
  "Roddy Ricch":         "Q59209423",
  "Polo G":              "Q62953486",
  // Solo artists — added to guarantee correct QID match
  "J. Cole":             "Q204018",
  "Freddie Gibbs":       "Q1246237",
  "Too Short":           "Q158223",
  "E-40":                "Q162634",
  "Denzel Curry":        "Q17517049",
  "Lil Yachty":          "Q23772141",
  "Rick Ross":           "Q297831",
  "Method Man":          "Q298694",
  "Lupe Fiasco":         "Q310116",
  "Redman":              "Q313138",
  "Talib Kweli":         "Q318755",
  "Ghostface Killah":    "Q323463",
  "Fabolous":            "Q349420",
  "Rakim":               "Q364214",
  "Jadakiss":            "Q451958",
  "Scarface":            "Q708158",
  "Cam'ron":             "Q434913",
  "Sexyy Red":           "Q119842023",
  "Isaiah Rashad":       "Q16199520",
  "Lil' Kim":            "Q229379",
  "Lil Kim":             "Q229379",
  "GloRilla":            "Q114132368",
  "Glorilla":            "Q114132368",
  "Ice Spice":           "Q114114977",
  "Vince Staples":       "Q16235863",
  "Boosie Badazz":       "Q166454",
  "Lil Boosie":          "Q166454",
  "Ab-Soul":             "Q3449364",
  "Big Pun":             "Q380656",
  "Twista":              "Q448638",
  "Bun B":               "Q528323",
  "Cordae":              "Q56073470",
  "Tierra Whack":        "Q56292576",
  "Project Pat":         "Q593741",
  "Kevin Gates":         "Q6396353",
  "Rapsody":             "Q7294351",
  "Earl Sweatshirt":     "Q1033188",
  "Chief Keef":          "Q127362",
  "Skepta":              "Q164446",
  "Meek Mill":           "Q1897911",
  "Anderson .Paak":      "Q20810369",
  "Anderson Paak":       "Q20810369",
  "Flo Rida":            "Q213538",
  "Erykah Badu":         "Q223875",
  "Lil Peep":            "Q29388200",
  "Fat Joe":             "Q309888",
  "Soulja Boy":          "Q313080",
  "Raekwon":             "Q320167",
  "Ol' Dirty Bastard":   "Q336924",
  "GZA":                 "Q361657",
  "Lil Pump":            "Q38002101",
  "Trippie Redd":        "Q40890697",
  "Waka Flocka Flame":   "Q571125",
  "Baby Keem":           "Q70063212",
  "D'Angelo":            "Q933598",
  "King Von":            "Q94579368",
  "Action Bronson":      "Q2823641",
  "Xzibit":              "Q189078",
  "Anuel AA":            "Q26690130",
  "Warren G":            "Q319585",
  "DJ Premier":          "Q380639",
  "Moneybagg Yo":        "Q38459032",
  "CeeLo Green":         "Q4042",
  "Kurupt":              "Q448930",
  "Wale":                "Q458519",
  "Beanie Sigel":        "Q516716",
  "Big Daddy Kane":      "Q535972",
  "Freeway":             "Q536526",
  "Kool G Rap":          "Q554168",
  "Yo Gotti":            "Q586919",
  "NLE Choppa":          "Q64009351",
  "Slick Rick":          "Q708620",
  "Master P":            "Q722042",
  "Juvenile":            "Q724501",
  "Joey Bada$$":         "Q3201552",
  "Joey Badass":         "Q3201552",
  "JPEGMAFIA":           "Q50415953",
  "JPEGMafia":           "Q50415953",
};

// ---------------------------------------------------------------------------
// Name aliases: DB name → Wikidata label
// Only needed when the Wikidata English label differs from the DB artist name
// AND the artist is not already in DIRECT_QIDS above.
// ---------------------------------------------------------------------------
const NAME_ALIASES = {
  "Jaÿ-Z":        "Jay-Z",
  "2Pac":          "Tupac Shakur",
  "NBA YoungBoy":  "YoungBoy Never Broke Again",
  "ScHoolboy Q":   "Schoolboy Q",
  "Mos Def":       "Yasiin Bey",
  "Travis $cott":  "Travis Scott",
  "A$AP Ferg":     "ASAP Ferg",
  "A$AP Mob":      "ASAP Mob",
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
        wd:Q2252262,  # rapper
        wd:Q639669,   # musician
        wd:Q753110,   # songwriter (reused QID)
        wd:Q177220,   # singer
        wd:Q36834,    # composer
        wd:Q1371941,  # disc jockey
        wd:Q183945,   # record producer
        wd:Q855091,   # singer-songwriter
        wd:Q2516866   # urban music artist
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

  // 2a. Pre-populate nameToQID from DIRECT_QIDS (no SPARQL needed for these)
  const nameToQID = new Map(); // keyed by DB name
  for (const artist of artists) {
    const qid = DIRECT_QIDS[artist.artist_name];
    if (qid) nameToQID.set(artist.artist_name, qid);
  }
  console.log(`Direct QID overrides applied: ${nameToQID.size}\n`);

  // Apply aliases so SPARQL searches use the Wikidata-compatible name,
  // but skip artists already handled by DIRECT_QIDS
  const artistsForSearch = artists
    .filter((a) => !nameToQID.has(a.artist_name))
    .map((a) => ({
      ...a,
      artist_name: NAME_ALIASES[a.artist_name] ?? a.artist_name,
    }));

  // 2b. Match remaining names → QIDs in batches
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
