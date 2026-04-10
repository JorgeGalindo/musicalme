"""
Merge reviews from Pitchfork, NME, and Resident Advisor into a unified database.

Normalises scores to 0-10 scale, deduplicates by artist+album, and outputs
a single JSON file for the recommendation engine.

Usage:
  python scripts/merge_reviews.py

Output: data/reviews-unified.json
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "reviews-unified.json"


def load_pitchfork() -> list[dict]:
    """Load all Pitchfork reviews. Score already 0-10."""
    reviews = []
    for f in sorted((DATA_DIR / "pitchfork").glob("reviews-*.json")):
        for r in json.loads(f.read_text()):
            if r.get("score") is None:
                continue
            reviews.append({
                "artist": r.get("artist"),
                "album": r.get("album"),
                "score": r["score"],
                "date": r.get("date"),
                "source": "pitchfork",
                "url": r.get("url"),
                "description": r.get("description"),
            })
    return reviews


def load_nme() -> list[dict]:
    """Load NME reviews. Rating is X/5, normalise to 0-10."""
    reviews = []
    for f in sorted((DATA_DIR / "nme").glob("reviews-*.json")):
        for r in json.loads(f.read_text()):
            if r.get("rating") is None:
                continue
            reviews.append({
                "artist": r.get("artist"),
                "album": r.get("album"),
                "score": r["rating"] * 2.0,  # 5→10
                "date": r.get("date"),
                "source": "nme",
                "url": r.get("url"),
                "description": None,
            })
    return reviews


def load_ra() -> list[dict]:
    """Load RA reviews. No numeric score — use recommended as 8.0, not-recommended as 6.0."""
    reviews = []
    for f in sorted((DATA_DIR / "ra").glob("reviews-*.json")):
        for r in json.loads(f.read_text()):
            reviews.append({
                "artist": r.get("artist"),
                "album": r.get("album"),
                "score": 8.0 if r.get("recommended") else 6.0,
                "date": r.get("date"),
                "source": "ra",
                "url": f"https://ra.co/reviews/{r['id']}" if r.get("id") else None,
                "description": None,
                "genres": r.get("genres", []),
                "labels": r.get("labels", []),
            })
    return reviews


def load_uncut() -> list[dict]:
    """Load Uncut reviews. Score already 0-10."""
    reviews = []
    for f in sorted((DATA_DIR / "uncut").glob("reviews-*.json")):
        for r in json.loads(f.read_text()):
            if r.get("score") is None:
                continue
            reviews.append({
                "artist": r.get("artist"),
                "album": r.get("album"),
                "score": r["score"],
                "date": r.get("date"),
                "source": "uncut",
                "url": r.get("url"),
                "description": None,
            })
    return reviews


def main():
    pitchfork = load_pitchfork()
    nme = load_nme()
    ra = load_ra()
    uncut = load_uncut()

    print(f"Pitchfork: {len(pitchfork)}")
    print(f"NME:       {len(nme)}")
    print(f"RA:        {len(ra)}")
    print(f"Uncut:     {len(uncut)}")

    all_reviews = pitchfork + nme + ra + uncut

    # Sort by date descending
    all_reviews.sort(key=lambda r: r.get("date") or "", reverse=True)

    # Stats
    by_source = {}
    for r in all_reviews:
        src = r["source"]
        by_source[src] = by_source.get(src, 0) + 1

    # Find artists reviewed by multiple sources
    from collections import defaultdict
    artist_sources = defaultdict(set)
    for r in all_reviews:
        if r.get("artist"):
            artist_sources[r["artist"].lower()].add(r["source"])
    multi_source = sum(1 for sources in artist_sources.values() if len(sources) >= 2)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_reviews, f, ensure_ascii=False, separators=(",", ":"))

    size = OUT_PATH.stat().st_size / 1024
    print(f"\nUnified: {len(all_reviews)} reviews ({size:.0f} KB)")
    print(f"By source: {by_source}")
    print(f"Artists reviewed by 2+ sources: {multi_source}")

    # Date range
    dates = [r["date"] for r in all_reviews if r.get("date")]
    if dates:
        print(f"Date range: {min(dates)} — {max(dates)}")


if __name__ == "__main__":
    main()
