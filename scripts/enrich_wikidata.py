"""
Enrich artists with Wikidata via SPARQL.

For each artist: genres, influences, influenced by, awards.
Uses batched SPARQL queries — no auth, no rate limit concerns.

Usage:
  python scripts/enrich_wikidata.py

Output: data/artists-wikidata.json
"""

import json
import time
import urllib.parse
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "artists-wikidata.json"

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
HEADERS = {
    "User-Agent": "musicalme/1.0 (personal music analytics project)",
    "Accept": "application/json",
}

# SPARQL using EntitySearch — much more robust than exact label match
SEARCH_QUERY = """
SELECT ?item ?itemLabel ?genreLabel ?influencedByLabel WHERE {{
  SERVICE wikibase:mwapi {{
    bd:serviceParam wikibase:endpoint "www.wikidata.org";
                    wikibase:api "EntitySearch";
                    mwapi:search "{name}";
                    mwapi:language "en".
    ?item wikibase:apiOutputItem mwapi:item.
  }}
  ?item wdt:P136 ?genre .
  OPTIONAL {{ ?item wdt:P737 ?influencedBy }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" }}
}} LIMIT 30
"""


def query_wikidata(sparql: str) -> list[dict]:
    """Execute a SPARQL query against Wikidata."""
    params = {"query": sparql, "format": "json"}
    try:
        resp = requests.get(WIKIDATA_SPARQL, params=params, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return []
        return resp.json().get("results", {}).get("bindings", [])
    except Exception:
        return []


def enrich_artist(name: str) -> dict | None:
    """Query Wikidata for an artist's genres and influences."""
    safe_name = name.replace('"', '\\"').replace("\\", "")
    sparql = SEARCH_QUERY.format(name=safe_name)
    results = query_wikidata(sparql)

    if not results:
        return None

    genres = list(set(
        r["genreLabel"]["value"]
        for r in results
        if "genreLabel" in r and r["genreLabel"]["value"] != safe_name
    ))
    influences = list(set(
        r["influencedByLabel"]["value"]
        for r in results
        if "influencedByLabel" in r and r["influencedByLabel"]["value"] != safe_name
    ))

    if genres or influences:
        return {
            "genres": genres[:8],
            "influences": influences[:8],
            "country": None,
        }

    return None


def main():
    # Load artist list
    am = json.loads((ROOT / "app" / "public" / "data" / "artist-month.json").read_text())
    from collections import defaultdict
    artist_hours = defaultdict(float)
    for r in am:
        artist_hours[r["a"]] += r["h"]

    # Sort by hours — enrich the most-listened first
    artists = sorted(artist_hours.keys(), key=lambda a: -artist_hours[a])

    # Load existing
    existing: dict[str, dict] = {}
    if OUT_PATH.exists():
        for entry in json.loads(OUT_PATH.read_text()):
            existing[entry["artist"]] = entry

    print(f"Total artists: {len(artists)}")
    print(f"Already enriched: {len(existing)}")

    to_enrich = [a for a in artists if a not in existing]
    print(f"Remaining: {len(to_enrich)}")

    # Process in batches — Wikidata is generous but let's be polite
    new_count = 0
    not_found = 0
    for i, artist in enumerate(to_enrich):
        result = enrich_artist(artist)

        if result:
            existing[artist] = {"artist": artist, **result}
            new_count += 1
            if new_count <= 10 or new_count % 100 == 0:
                genres = ", ".join(result["genres"][:3]) if result["genres"] else "no genres"
                influences = ", ".join(result["influences"][:2]) if result["influences"] else "none"
                print(f"  [{i+1}/{len(to_enrich)}] {artist} → {genres} | influenced by: {influences}")
        else:
            existing[artist] = {"artist": artist, "genres": [], "influences": [], "country": None}
            not_found += 1

        # Save checkpoint every 200
        if (i + 1) % 200 == 0:
            save(existing)
            print(f"  Checkpoint: {new_count} found, {not_found} not found")

        # Wikidata is generous but let's not hammer it
        time.sleep(0.5)

    save(existing)
    print(f"\nDone. Found: {new_count}, Not found: {not_found}")


def save(data: dict[str, dict]):
    records = sorted(data.values(), key=lambda r: r["artist"].lower())
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
