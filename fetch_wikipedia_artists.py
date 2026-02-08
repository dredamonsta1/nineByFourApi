#!/usr/bin/env python3
"""
Wikidata Musical Artist Fetcher
================================
Queries Wikidata's public SPARQL endpoint to discover musical artists,
fetches metadata (genre, country, birthplace, label), and appends
new artists to db.json.

Usage:
    python3 fetch_wikipedia_artists.py                    # Fetch all artists
    python3 fetch_wikipedia_artists.py --limit 1000       # Limit to 1000 new artists
    python3 fetch_wikipedia_artists.py --with-albums      # Also fetch albums (slower)
    python3 fetch_wikipedia_artists.py --dry-run          # Preview without writing
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "9by4app-ArtistFetcher/1.0 (https://github.com/9by4app; contact@9by4.com)"
REQUEST_DELAY = 2          # seconds between requests
MAX_RETRIES = 4
BACKOFF_BASE = 3           # exponential backoff base in seconds
DISCOVERY_BATCH = 4000     # LIMIT per discovery query
METADATA_BATCH = 200       # artists per metadata query
ALBUM_BATCH = 50           # artists per album query

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_JSON_PATH = os.path.join(SCRIPT_DIR, "db.json")

# US state abbreviation mapping for birthplace -> state field
US_STATES = {
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
}

# Region mapping based on state
REGION_MAP = {
    "CA": "West Coast", "OR": "West Coast", "WA": "West Coast",
    "NY": "East Coast", "NJ": "East Coast", "CT": "East Coast",
    "MA": "East Coast", "PA": "East Coast", "MD": "East Coast",
    "DE": "East Coast", "RI": "East Coast", "NH": "East Coast",
    "VT": "East Coast", "ME": "East Coast", "DC": "East Coast",
    "VA": "East Coast",
    "GA": "South", "FL": "South", "TX": "South", "LA": "South",
    "AL": "South", "MS": "South", "TN": "South", "SC": "South",
    "NC": "South", "AR": "South", "KY": "South",
    "IL": "Midwest", "OH": "Midwest", "MI": "Midwest", "IN": "Midwest",
    "WI": "Midwest", "MN": "Midwest", "MO": "Midwest", "IA": "Midwest",
    "KS": "Midwest", "NE": "Midwest", "SD": "Midwest", "ND": "Midwest",
    "CO": "West Coast", "NV": "West Coast", "AZ": "West Coast",
    "NM": "West Coast", "UT": "West Coast", "HI": "West Coast",
    "AK": "West Coast", "ID": "West Coast", "MT": "West Coast",
    "WY": "West Coast",
    "OK": "South", "WV": "South",
}


# ---------------------------------------------------------------------------
# SPARQL helpers
# ---------------------------------------------------------------------------
def sparql_query(query: str) -> list[dict]:
    """Execute a SPARQL query against Wikidata and return results (POST method)."""
    body = urllib.parse.urlencode({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        WIKIDATA_SPARQL_URL,
        data=body,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                raw = resp.read().decode("utf-8")
                data = json.loads(raw)
                return data.get("results", {}).get("bindings", [])
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                wait = BACKOFF_BASE ** (attempt + 1)
                print(f"  HTTP {e.code} — retrying in {wait}s (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(wait)
            else:
                print(f"  HTTP error {e.code}: {e.reason}")
                return []
        except urllib.error.URLError as e:
            wait = BACKOFF_BASE ** (attempt + 1)
            print(f"  Network error: {e.reason} — retrying in {wait}s")
            time.sleep(wait)
        except json.JSONDecodeError as e:
            wait = BACKOFF_BASE ** (attempt + 1)
            print(f"  JSON parse error (truncated response?) — retrying in {wait}s")
            time.sleep(wait)
        except Exception as e:
            print(f"  Unexpected error: {e}")
            return []

    print(f"  Failed after {MAX_RETRIES} retries.")
    return []


def throttle():
    """Simple rate limiter."""
    time.sleep(REQUEST_DELAY)


# ---------------------------------------------------------------------------
# Phase 1: Discovery — fast name-only queries
# ---------------------------------------------------------------------------
# Solo artist queries split by occupation to avoid timeouts
# Q177220=singer, Q753110=songwriter, Q36834=composer, Q488205=singer-songwriter,
# Q183945=record producer, Q639669=musician, Q2252262=rapper
SOLO_OCCUPATION_IDS = [
    ("Q177220", "singers"),
    ("Q753110", "songwriters"),
    ("Q36834", "composers"),
    ("Q488205", "singer-songwriters"),
    ("Q183945", "record producers"),
    ("Q639669", "musicians"),
    ("Q2252262", "rappers"),
]

SOLO_ARTIST_QUERY = """
SELECT DISTINCT ?artistLabel WHERE {{
  ?artist wdt:P31 wd:Q5 .
  ?artist wdt:P106 wd:{occupation} .
  ?article schema:about ?artist ;
           schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
LIMIT {limit}
OFFSET {offset}
"""

BAND_QUERY = """
SELECT DISTINCT ?artistLabel WHERE {{
  ?artist wdt:P31/wdt:P279* wd:Q215380 .
  ?article schema:about ?artist ;
           schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
LIMIT {limit}
OFFSET {offset}
"""


def discover_artists() -> set[str]:
    """Phase 1: Discover artist names via fast SPARQL queries."""
    all_names: set[str] = set()

    # --- Solo artists by occupation ---
    for occ_id, occ_label in SOLO_OCCUPATION_IDS:
        print(f"\n[Phase 1a] Discovering {occ_label} (wd:{occ_id})...")
        offset = 0
        consecutive_failures = 0
        while True:
            query = SOLO_ARTIST_QUERY.format(
                occupation=occ_id, limit=DISCOVERY_BATCH, offset=offset
            )
            print(f"  Querying {occ_label} offset={offset} ...", end=" ", flush=True)
            results = sparql_query(query)
            count = 0
            for r in results:
                name = r.get("artistLabel", {}).get("value", "").strip()
                if name and not name.startswith("Q"):  # skip unresolved QIDs
                    all_names.add(name)
                    count += 1
            print(f"got {count} names (total unique: {len(all_names)})")
            if not results:
                consecutive_failures += 1
                if consecutive_failures >= 2:
                    print(f"  Skipping remaining {occ_label} after 2 consecutive failures")
                    break
                # Try the next offset in case this was a transient failure
                offset += DISCOVERY_BATCH
                throttle()
                continue
            consecutive_failures = 0
            if len(results) < DISCOVERY_BATCH:
                break
            offset += DISCOVERY_BATCH
            throttle()

    # --- Bands / musical groups ---
    print(f"\n[Phase 1b] Discovering bands/musical groups...")
    offset = 0
    consecutive_failures = 0
    while True:
        query = BAND_QUERY.format(limit=DISCOVERY_BATCH, offset=offset)
        print(f"  Querying bands offset={offset} ...", end=" ", flush=True)
        results = sparql_query(query)
        count = 0
        for r in results:
            name = r.get("artistLabel", {}).get("value", "").strip()
            if name and not name.startswith("Q"):
                all_names.add(name)
                count += 1
        print(f"got {count} names (total unique: {len(all_names)})")
        if not results:
            consecutive_failures += 1
            if consecutive_failures >= 2:
                print(f"  Skipping remaining bands after 2 consecutive failures")
                break
            offset += DISCOVERY_BATCH
            throttle()
            continue
        consecutive_failures = 0
        if len(results) < DISCOVERY_BATCH:
            break
        offset += DISCOVERY_BATCH
        throttle()

    return all_names


# ---------------------------------------------------------------------------
# Phase 2: Metadata — targeted queries for new artists only
# ---------------------------------------------------------------------------
METADATA_QUERY_TEMPLATE = """
SELECT ?artistLabel
       (GROUP_CONCAT(DISTINCT ?genreLabel; separator=" / ") AS ?genres)
       (SAMPLE(?countryLabel) AS ?country)
       (SAMPLE(?birthplaceLabel) AS ?birthplace)
       (SAMPLE(?labelLabel) AS ?recordLabel)
WHERE {{
  VALUES ?artistLabel {{ {values} }}
  ?artist rdfs:label ?artistLabel .
  FILTER(LANG(?artistLabel) = "en")
  OPTIONAL {{ ?artist wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }}
  OPTIONAL {{ ?artist wdt:P27 ?country_ . ?country_ rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "en") }}
  OPTIONAL {{ ?artist wdt:P19 ?birthplace_ . ?birthplace_ rdfs:label ?birthplaceLabel . FILTER(LANG(?birthplaceLabel) = "en") }}
  OPTIONAL {{ ?artist wdt:P264 ?label_ . ?label_ rdfs:label ?labelLabel . FILTER(LANG(?labelLabel) = "en") }}
}}
GROUP BY ?artistLabel
"""


def escape_sparql_string(s: str) -> str:
    """Escape a string for use in a SPARQL VALUES literal."""
    return s.replace("\\", "\\\\").replace('"', '\\"')


def is_safe_sparql_name(name: str) -> bool:
    """Check if a name is safe for SPARQL VALUES clause."""
    # Skip names that are only punctuation/symbols or too short
    stripped = name.strip()
    if len(stripped) < 2:
        return False
    return True


def fetch_metadata(names: list[str]) -> dict[str, dict]:
    """Phase 2: Fetch genre, country, birthplace, label for a list of artist names."""
    metadata: dict[str, dict] = {}
    # Filter to names safe for SPARQL
    safe_names = [n for n in names if is_safe_sparql_name(n)]
    total = len(safe_names)
    batches = (total + METADATA_BATCH - 1) // METADATA_BATCH

    print(f"\n[Phase 2] Fetching metadata for {total} new artists ({batches} batches)...")

    for i in range(0, total, METADATA_BATCH):
        batch = safe_names[i : i + METADATA_BATCH]
        batch_num = i // METADATA_BATCH + 1
        values = " ".join(f'"{escape_sparql_string(n)}"@en' for n in batch)
        query = METADATA_QUERY_TEMPLATE.format(values=values)

        print(f"  Batch {batch_num}/{batches} ({len(batch)} artists) ...", end=" ", flush=True)
        results = sparql_query(query)
        found = 0
        for r in results:
            name = r.get("artistLabel", {}).get("value", "").strip()
            if not name:
                continue
            genres_raw = r.get("genres", {}).get("value", "")
            # Take top 3 genres and truncate to 100 chars (DB limit)
            genre_list = [g.strip() for g in genres_raw.split(" / ") if g.strip()][:3]
            genre_str = " / ".join(genre_list) if genre_list else None
            if genre_str and len(genre_str) > 100:
                genre_str = genre_str[:97] + "..."

            country = r.get("country", {}).get("value", "")
            birthplace = r.get("birthplace", {}).get("value", "")
            label = r.get("recordLabel", {}).get("value", "")

            # Resolve state / region from birthplace or country
            state, region = resolve_location(birthplace, country)

            metadata[name] = {
                "genre": genre_str,
                "state": state,
                "region": region,
                "label": label if label else None,
            }
            found += 1
        print(f"got metadata for {found}")
        throttle()

    return metadata


def resolve_location(birthplace: str, country: str) -> tuple[str | None, str | None]:
    """Try to map birthplace/country to a US state abbreviation and region."""
    bp_lower = birthplace.lower().strip()

    # Check if birthplace directly matches a state name
    for state_name, abbr in US_STATES.items():
        if state_name in bp_lower:
            return abbr, REGION_MAP.get(abbr)

    # If country is USA-related, leave state blank but mark region
    if country and ("united states" in country.lower() or "u.s." in country.lower()):
        return None, None

    # Non-US or unknown
    if country:
        return country, None
    return None, None


# ---------------------------------------------------------------------------
# Phase 3: Albums (optional)
# ---------------------------------------------------------------------------
ALBUM_QUERY_TEMPLATE = """
SELECT ?artistLabel ?albumLabel (SAMPLE(?year) AS ?albumYear) WHERE {{
  VALUES ?artistLabel {{ {values} }}
  ?artist rdfs:label ?artistLabel .
  FILTER(LANG(?artistLabel) = "en")
  ?album wdt:P175 ?artist .
  ?album wdt:P31/wdt:P279* wd:Q482994 .
  ?album rdfs:label ?albumLabel .
  FILTER(LANG(?albumLabel) = "en")
  OPTIONAL {{ ?album wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }}
}}
GROUP BY ?artistLabel ?albumLabel
"""


def fetch_albums(names: list[str]) -> dict[str, list[dict]]:
    """Phase 3: Fetch album discographies for new artists."""
    albums: dict[str, list[dict]] = {}
    total = len(names)
    batches = (total + ALBUM_BATCH - 1) // ALBUM_BATCH

    print(f"\n[Phase 3] Fetching albums for {total} artists ({batches} batches)...")

    for i in range(0, total, ALBUM_BATCH):
        batch = names[i : i + ALBUM_BATCH]
        batch_num = i // ALBUM_BATCH + 1
        values = " ".join(f'"{escape_sparql_string(n)}"@en' for n in batch)
        query = ALBUM_QUERY_TEMPLATE.format(values=values)

        print(f"  Batch {batch_num}/{batches} ({len(batch)} artists) ...", end=" ", flush=True)
        results = sparql_query(query)
        found = 0
        for r in results:
            artist = r.get("artistLabel", {}).get("value", "").strip()
            album_name = r.get("albumLabel", {}).get("value", "").strip()
            if not artist or not album_name:
                continue
            year_val = r.get("albumYear", {}).get("value", "")
            year = int(year_val) if year_val and year_val.isdigit() else None

            if artist not in albums:
                albums[artist] = []
            # Deduplicate albums per artist
            existing = {a["album_name"] for a in albums[artist]}
            if album_name not in existing:
                albums[artist].append({"album_name": album_name, "year": year})
                found += 1
        print(f"got {found} albums")
        throttle()

    return albums


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def load_db() -> dict:
    """Load db.json."""
    if not os.path.exists(DB_JSON_PATH):
        print(f"Error: {DB_JSON_PATH} not found.")
        sys.exit(1)
    with open(DB_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_db(data: dict):
    """Save db.json with proper formatting."""
    with open(DB_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"\nSaved to {DB_JSON_PATH}")


def main():
    parser = argparse.ArgumentParser(description="Fetch musical artists from Wikidata")
    parser.add_argument("--limit", type=int, default=0, help="Max new artists to add (0 = unlimited)")
    parser.add_argument("--with-albums", action="store_true", help="Also fetch album discographies (slower)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing to db.json")
    args = parser.parse_args()

    # Load existing data
    db = load_db()
    existing_artists = db.get("artists", [])
    existing_names = {a["artist_name"].lower() for a in existing_artists if a.get("artist_name")}
    max_artist_id = max((a["artist_id"] for a in existing_artists), default=0)
    max_album_id = max(
        (alb["album_id"] for a in existing_artists for alb in (a.get("albums") or [])),
        default=0,
    )

    print(f"Loaded {len(existing_artists)} existing artists (max id={max_artist_id})")
    print(f"Max existing album_id={max_album_id}")

    # Phase 1: Discovery
    all_discovered = discover_artists()
    print(f"\nTotal discovered from Wikidata: {len(all_discovered)}")

    # Deduplicate against existing
    new_names = sorted([n for n in all_discovered if n.lower() not in existing_names])
    print(f"New artists (not in db.json): {len(new_names)}")

    if args.limit > 0:
        new_names = new_names[: args.limit]
        print(f"Limited to {len(new_names)} new artists")

    if not new_names:
        print("No new artists to add. Done.")
        return

    # Phase 2: Metadata
    metadata = fetch_metadata(new_names)

    # Phase 3: Albums (optional)
    album_data: dict[str, list[dict]] = {}
    if args.with_albums:
        album_data = fetch_albums(new_names)

    # Build new artist entries
    next_artist_id = max_artist_id + 1
    next_album_id = max_album_id + 1
    new_entries = []

    for name in new_names:
        meta = metadata.get(name, {})
        artist_albums = album_data.get(name, [])

        # Build albums list with proper IDs
        album_entries = []
        for alb in artist_albums:
            album_entries.append({
                "album_id": next_album_id,
                "artist_id": next_artist_id,
                "album_name": alb["album_name"],
                "year": alb.get("year"),
                "certifications": None,
            })
            next_album_id += 1

        entry = {
            "artist_id": next_artist_id,
            "artist_name": name,
            "aka": None,
            "genre": meta.get("genre"),
            "count": 0,
            "state": meta.get("state"),
            "region": meta.get("region"),
            "label": meta.get("label"),
            "image_url": None,
            "mixtape": None,
            "album": None,
            "year": None,
            "certifications": None,
            "albums": album_entries if album_entries else [],
        }
        new_entries.append(entry)
        next_artist_id += 1

    # Summary
    total_albums = sum(len(e["albums"]) for e in new_entries)
    artists_with_meta = sum(1 for e in new_entries if e.get("genre") or e.get("state") or e.get("label"))
    print(f"\n{'=' * 60}")
    print(f"Summary:")
    print(f"  New artists to add:      {len(new_entries)}")
    print(f"  Artists with metadata:   {artists_with_meta}")
    print(f"  Total new albums:        {total_albums}")
    print(f"  Next artist_id:          {next_artist_id}")
    print(f"  Next album_id:           {next_album_id}")
    print(f"{'=' * 60}")

    if args.dry_run:
        print("\n[DRY RUN] No changes written. First 5 new artists:")
        for e in new_entries[:5]:
            print(f"  - {e['artist_name']} | genre={e['genre']} | state={e['state']} | label={e['label']}")
        return

    # Append to db.json
    db["artists"].extend(new_entries)
    save_db(db)
    print(f"Done! db.json now has {len(db['artists'])} artists.")


if __name__ == "__main__":
    main()
