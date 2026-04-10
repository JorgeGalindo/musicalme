"""
Enrich artists with Discogs data: genres and styles per release.

For each artist: search → get releases → for each release, store genres/styles.
This gives genre data at album level, crucial for matching with review scores.

Rate limit: 60 req/min (authenticated). We do ~3 req/artist = ~20 artists/min.

Prioritises: artists in reviews DB + top listened artists.

Usage:
  python scripts/enrich_discogs.py

Output: data/artists-discogs.json (incremental)
"""

import json
import os
import time
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "artists-discogs.json"

TOKEN = os.environ.get("DISCOGS_TOKEN", "")
HEADERS = {
    "Authorization": f"Discogs token={TOKEN}",
    "User-Agent": "musicalme/1.0 (personal music analytics)",
}

# Discogs allows 60 req/min authenticated
REQUEST_INTERVAL = 1.1  # stay safe


def _safe_get(url: str, **kwargs) -> requests.Response | None:
    """GET with retry on timeout/rate-limit."""
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15, **kwargs)
            if resp.status_code == 429:
                time.sleep(30)
                continue
            return resp
        except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError):
            time.sleep(5)
    return None


def search_artist(name: str) -> int | None:
    """Search for an artist, return Discogs ID."""
    resp = _safe_get(
        "https://api.discogs.com/database/search",
        params={"q": name, "type": "artist", "per_page": 1},
    )
    if not resp:
        return None
    results = resp.json().get("results", [])
    if results and results[0].get("title", "").lower() == name.lower():
        return results[0]["id"]
    if results:
        # Accept if score seems right (first result for exact-ish match)
        return results[0]["id"]
    return None


def get_artist_releases(artist_id: int, max_releases: int = 8) -> list[dict]:
    """Get an artist's top releases with genres/styles."""
    time.sleep(REQUEST_INTERVAL)
    resp = _safe_get(
        f"https://api.discogs.com/artists/{artist_id}/releases",
        params={"sort": "year", "sort_order": "desc", "per_page": max_releases},
    )
    if not resp:
        return []

    releases = resp.json().get("releases", [])
    result = []

    for rel in releases[:max_releases]:
        # Fetch detail for genres (only masters and main releases)
        rel_type = rel.get("type", "")
        rel_id = rel.get("id")
        if not rel_id:
            continue

        time.sleep(REQUEST_INTERVAL)
        if rel_type == "master":
            resp_detail = _safe_get(f"https://api.discogs.com/masters/{rel_id}")
        else:
            resp_detail = _safe_get(f"https://api.discogs.com/releases/{rel_id}")
        if not resp_detail:
            continue
        detail = resp_detail.json()

        if detail.get("genres") or detail.get("styles"):
            result.append({
                "title": detail.get("title", rel.get("title", "")),
                "year": detail.get("year") or rel.get("year"),
                "genres": detail.get("genres", []),
                "styles": detail.get("styles", []),
            })

    return result


def get_all_artists() -> list[str]:
    """Get all artists sorted by hours listened (most listened first)."""
    am_path = ROOT / "app" / "public" / "data" / "artist-month.json"
    artist_hours = defaultdict(float)
    if am_path.exists():
        for r in json.loads(am_path.read_text()):
            artist_hours[r["a"]] += r["h"]

    return sorted(artist_hours.keys(), key=lambda a: -artist_hours[a])


def main():
    if not TOKEN:
        print("Error: DISCOGS_TOKEN not set. Add it to .env")
        return

    artists = get_all_artists()
    print(f"Total artists: {len(artists)}")

    # Load existing
    existing: dict[str, dict] = {}
    if OUT_PATH.exists():
        for entry in json.loads(OUT_PATH.read_text()):
            existing[entry["artist"]] = entry

    print(f"Already enriched: {len(existing)}")

    to_enrich = [a for a in artists if a not in existing]
    print(f"Remaining: {len(to_enrich)}")

    found = 0
    not_found = 0
    for i, artist in enumerate(to_enrich):
        time.sleep(REQUEST_INTERVAL)
        artist_id = search_artist(artist)

        if artist_id:
            releases = get_artist_releases(artist_id)
            if releases:
                # Aggregate genres across releases
                all_genres = list(set(g for r in releases for g in r["genres"]))
                all_styles = list(set(s for r in releases for s in r["styles"]))

                existing[artist] = {
                    "artist": artist,
                    "discogsId": artist_id,
                    "genres": all_genres,
                    "styles": all_styles,
                    "releases": releases,
                }
                found += 1
                if found <= 10 or found % 50 == 0:
                    styles = ", ".join(all_styles[:4]) if all_styles else "no styles"
                    print(f"  [{i+1}/{len(to_enrich)}] {artist} → {styles} ({len(releases)} releases)")
            else:
                existing[artist] = {"artist": artist, "discogsId": artist_id,
                                    "genres": [], "styles": [], "releases": []}
                not_found += 1
        else:
            existing[artist] = {"artist": artist, "discogsId": None,
                                "genres": [], "styles": [], "releases": []}
            not_found += 1

        # Checkpoint every 200
        if (i + 1) % 200 == 0:
            save(existing)
            print(f"  Checkpoint: {found} found, {not_found} not found")

    save(existing)
    print(f"\nDone. Found: {found}, Not found: {not_found}, Total: {len(existing)}")


def save(data: dict[str, dict]):
    records = sorted(data.values(), key=lambda r: r["artist"].lower())
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
