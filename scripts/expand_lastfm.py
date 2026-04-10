"""
Expand Last.fm similar artists graph to 2nd and 3rd degree.

Pass 1: Fetch similar artists for all 1st-degree similar artists
         (artists that appear as "similar" to listened artists but aren't in our base)
Pass 2: Fetch similar artists for all NEW artists found in Pass 1
         (3rd degree connections)

Both passes append to the same artists-lastfm.json (incremental).

Usage:
  python scripts/expand_lastfm.py              # both passes
  python scripts/expand_lastfm.py --pass 1     # only 1st expansion
  python scripts/expand_lastfm.py --pass 2     # only 2nd expansion

Output: data/artists-lastfm.json (appended)
"""

import argparse
import json
import os
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
LASTFM_PATH = DATA_DIR / "artists-lastfm.json"

API_KEY = os.environ.get("LASTFM_API_KEY", "")
API_BASE = "https://ws.audioscrobbler.com/2.0/"


def get_artist_info(name: str) -> dict | None:
    """Fetch artist info from Last.fm API."""
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

    tags = [tag["name"] for tag in artist.get("tags", {}).get("tag", [])]
    similar = [sim["name"] for sim in artist.get("similar", {}).get("artist", [])]
    stats = artist.get("stats", {})

    return {
        "tags": tags[:10],
        "similar": similar[:10],
        "listeners": int(stats.get("listeners", 0)),
        "playcount": int(stats.get("playcount", 0)),
    }


def load_existing() -> dict[str, dict]:
    """Load existing Last.fm data."""
    if LASTFM_PATH.exists():
        return {a["artist"]: a for a in json.loads(LASTFM_PATH.read_text())}
    return {}


def save(data: dict[str, dict]):
    """Save Last.fm data."""
    records = sorted(data.values(), key=lambda r: r["artist"].lower())
    with open(LASTFM_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def find_missing(existing: dict[str, dict]) -> list[str]:
    """Find artists referenced as 'similar' but not yet in our base."""
    known = set(existing.keys())
    known_lower = {k.lower() for k in known}

    referenced = set()
    for entry in existing.values():
        for sim in entry.get("similar", []):
            if sim.lower() not in known_lower:
                referenced.add(sim)

    return sorted(referenced)


def run_pass(existing: dict[str, dict], pass_num: int) -> dict[str, dict]:
    """Run one expansion pass."""
    missing = find_missing(existing)
    print(f"\nPass {pass_num}: {len(missing):,} artists to fetch")

    if not missing:
        print("  Nothing to expand.")
        return existing

    found = 0
    not_found = 0
    for i, artist in enumerate(missing):
        result = get_artist_info(artist)

        if result and (result["tags"] or result["similar"]):
            existing[artist] = {"artist": artist, **result}
            found += 1
        else:
            existing[artist] = {
                "artist": artist, "tags": [], "similar": [],
                "listeners": 0, "playcount": 0,
            }
            not_found += 1

        if (i + 1) % 500 == 0:
            save(existing)
            print(f"  [{i+1}/{len(missing)}] Checkpoint: {found} found, {not_found} not found")

        if found <= 5 or found % 200 == 0:
            if result and result.get("similar"):
                print(f"  [{i+1}/{len(missing)}] {artist} → {', '.join(result['similar'][:3])}")

        time.sleep(0.25)

    save(existing)
    print(f"  Pass {pass_num} done: {found} found, {not_found} not found")
    print(f"  Total in base: {len(existing):,}")
    return existing


def main():
    parser = argparse.ArgumentParser(description="Expand Last.fm similar graph")
    parser.add_argument("--pass", type=int, dest="pass_num", default=0,
                        help="Run specific pass (1 or 2). Default: both.")
    args = parser.parse_args()

    if not API_KEY:
        print("Error: LASTFM_API_KEY not set. Add it to .env or environment.")
        return

    existing = load_existing()
    print(f"Existing: {len(existing):,} artists")

    if args.pass_num in (0, 1):
        existing = run_pass(existing, 1)

    if args.pass_num in (0, 2):
        existing = run_pass(existing, 2)

    # Stats
    with_similar = sum(1 for a in existing.values() if a.get("similar"))
    total_links = sum(len(a.get("similar", [])) for a in existing.values())
    print(f"\nFinal: {len(existing):,} artists, {with_similar:,} with similar, {total_links:,} total links")


if __name__ == "__main__":
    main()
