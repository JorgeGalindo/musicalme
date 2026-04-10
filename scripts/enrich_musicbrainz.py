"""
Enrich artist data with MusicBrainz metadata.

For each artist in the listening history, fetches:
  - genres/tags (crowd-sourced)
  - country of origin
  - type (group/person)
  - active period (begin/end year)

Rate limit: 1 request/second (MusicBrainz policy).

Usage:
  python scripts/enrich_musicbrainz.py

Output: data/artists-enriched.json (incremental — skips already enriched)
"""

import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "artists-enriched.json"
ARTIST_MONTH_PATH = ROOT / "app" / "public" / "data" / "artist-month.json"

MB_API = "https://musicbrainz.org/ws/2/artist/"
HEADERS = {
    "User-Agent": "musicalme/1.0 (personal music analytics project)",
    "Accept": "application/json",
}


def get_unique_artists() -> list[str]:
    """Get unique artist names from the listening data."""
    am = json.loads(ARTIST_MONTH_PATH.read_text())
    artists = sorted(set(r["a"] for r in am))
    return artists


def _mb_search(query: str) -> list[dict]:
    """Raw MusicBrainz search, returns artist list."""
    params = {"query": query, "fmt": "json", "limit": 5}
    try:
        resp = requests.get(MB_API, params=params, headers=HEADERS, timeout=10)
        if resp.status_code == 503:
            time.sleep(2)
            resp = requests.get(MB_API, params=params, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        return resp.json().get("artists", [])
    except Exception:
        return []


def _pick_best(artists: list[dict], name: str) -> dict | None:
    """Pick the best match, filtering out tribute bands and collabs."""
    name_lower = name.lower()
    for a in artists:
        a_name = a.get("name", "")
        a_type = a.get("type", "")
        disambiguation = (a.get("disambiguation") or "").lower()

        # Skip tribute bands, cover bands, collabs with other artists
        if "tribute" in disambiguation or "tribute" in a_name.lower():
            continue
        if " & " in a_name and " & " not in name:
            continue

        # Exact name match (case-insensitive)
        if a_name.lower() == name_lower:
            return a

        # Alias match
        for alias in a.get("aliases", []):
            if alias.get("name", "").lower() == name_lower:
                return a

        # High score match (>85) for the first non-tribute result
        if a.get("score", 0) >= 85:
            return a

    return None


def search_artist(name: str) -> dict | None:
    """Search MusicBrainz for an artist by name. Returns enrichment dict or None.

    Tries exact name first, then alias search if no tags found.
    """
    artists = _mb_search(f'artist:"{name}"')
    best = _pick_best(artists, name)

    # If no match or no tags, try alias search
    if not best or not best.get("tags"):
        time.sleep(1.1)
        alias_artists = _mb_search(f'alias:"{name}"')
        alias_best = _pick_best(alias_artists, name)
        if alias_best and (not best or alias_best.get("tags")):
            best = alias_best

    if not best:
        return None

    # Extract tags (genres)
    tags = []
    for tag in best.get("tags", []):
        if tag.get("count", 0) >= 0:  # include all tags
            tags.append(tag["name"])

    # Extract data
    result = {
        "mbid": best.get("id"),
        "tags": tags[:10],  # top 10 tags
        "country": best.get("country") or best.get("area", {}).get("name"),
        "type": best.get("type"),  # "Group", "Person", etc.
        "beginYear": None,
        "endYear": None,
        "disambiguation": best.get("disambiguation"),
        "score": best.get("score"),
    }

    # Active period
    life_span = best.get("life-span", {})
    begin = life_span.get("begin", "")
    end = life_span.get("end", "")
    if begin:
        result["beginYear"] = int(begin[:4]) if len(begin) >= 4 else None
    if end:
        result["endYear"] = int(end[:4]) if len(end) >= 4 else None

    return result


def main():
    artists = get_unique_artists()
    print(f"Total artists to enrich: {len(artists)}")

    # Load existing enrichments
    existing: dict[str, dict] = {}
    if OUT_PATH.exists():
        data = json.loads(OUT_PATH.read_text())
        existing = {r["artist"]: r for r in data}
        print(f"Already enriched: {len(existing)}")

    # Filter to unenriched
    to_enrich = [a for a in artists if a not in existing]
    print(f"Remaining: {len(to_enrich)}")

    if not to_enrich:
        print("All artists already enriched.")
        return

    # Process
    new_count = 0
    not_found = 0
    for i, artist in enumerate(to_enrich):
        result = search_artist(artist)

        if result:
            existing[artist] = {"artist": artist, **result}
            new_count += 1
            tags_str = ", ".join(result["tags"][:3]) if result["tags"] else "no tags"
            country = result["country"] or "?"
            if (i + 1) % 50 == 0 or i < 5:
                print(f"  [{i+1}/{len(to_enrich)}] {artist} → {tags_str} ({country})")
        else:
            existing[artist] = {"artist": artist, "tags": [], "country": None, "type": None,
                                "beginYear": None, "endYear": None, "mbid": None,
                                "disambiguation": None, "score": None}
            not_found += 1
            if (i + 1) % 50 == 0:
                print(f"  [{i+1}/{len(to_enrich)}] {artist} → not found")

        # Save incrementally every 100 artists
        if (i + 1) % 100 == 0:
            save(existing)
            print(f"  Saved checkpoint ({len(existing)} total)")

        # Rate limit: 1 req/s
        time.sleep(1.1)

    # Final save
    save(existing)
    print(f"\nDone. Enriched: {new_count}, Not found: {not_found}, Total: {len(existing)}")


def save(data: dict[str, dict]):
    """Save enriched artists to JSON."""
    records = sorted(data.values(), key=lambda r: r["artist"].lower())
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
