"""
Enrich artists with Last.fm data.

Per artist: top tags, similar artists, listener count, playcount.
The "similar artists" data is the key piece for taste-based recommendations.

Rate limit: 5 req/s (Last.fm is generous).

Usage:
  python scripts/enrich_lastfm.py

Output: data/artists-lastfm.json (incremental)
"""

import json
import os
import time
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "artists-lastfm.json"

API_KEY = os.environ.get("LASTFM_API_KEY", "")
API_BASE = "https://ws.audioscrobbler.com/2.0/"


def get_artist_info(name: str) -> dict | None:
    """Fetch artist info + similar artists from Last.fm."""
    # artist.getInfo gives tags, listeners, playcount, similar, bio
    params = {
        "method": "artist.getinfo",
        "artist": name,
        "api_key": API_KEY,
        "format": "json",
    }

    try:
        resp = requests.get(API_BASE, params=params, timeout=10)
        data = resp.json()
    except Exception:
        return None

    artist = data.get("artist")
    if not artist:
        return None

    # Tags
    tags = []
    for tag in artist.get("tags", {}).get("tag", []):
        tags.append(tag["name"])

    # Similar artists
    similar = []
    for sim in artist.get("similar", {}).get("artist", []):
        similar.append(sim["name"])

    # Stats
    stats = artist.get("stats", {})
    listeners = int(stats.get("listeners", 0))
    playcount = int(stats.get("playcount", 0))

    return {
        "tags": tags[:10],
        "similar": similar[:10],
        "listeners": listeners,
        "playcount": playcount,
    }


def main():
    # Load artist list sorted by hours
    am = json.loads((ROOT / "app" / "public" / "data" / "artist-month.json").read_text())
    artist_hours = defaultdict(float)
    for r in am:
        artist_hours[r["a"]] += r["h"]

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

    if not to_enrich:
        print("All done.")
        return

    found = 0
    not_found = 0
    for i, artist in enumerate(to_enrich):
        result = get_artist_info(artist)

        if result and (result["tags"] or result["similar"]):
            existing[artist] = {"artist": artist, **result}
            found += 1
            if found <= 10 or found % 100 == 0:
                tags = ", ".join(result["tags"][:3]) if result["tags"] else "no tags"
                sim = ", ".join(result["similar"][:2]) if result["similar"] else "none"
                print(f"  [{i+1}/{len(to_enrich)}] {artist} → {tags} | similar: {sim}")
        else:
            existing[artist] = {
                "artist": artist, "tags": [], "similar": [],
                "listeners": 0, "playcount": 0,
            }
            not_found += 1

        # Save every 500
        if (i + 1) % 500 == 0:
            save(existing)
            print(f"  Checkpoint: {found} found, {not_found} not found ({len(existing)} total)")

        # Last.fm allows 5/s but let's be safe
        time.sleep(0.25)

    save(existing)
    print(f"\nDone. Found: {found}, Not found: {not_found}, Total: {len(existing)}")


def save(data: dict[str, dict]):
    records = sorted(data.values(), key=lambda r: r["artist"].lower())
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
