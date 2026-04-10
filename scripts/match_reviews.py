"""
Match listening history artists with the unified reviews database.

Produces: data/artist-reviews.json
  Per listened artist: matched review scores, sources, albums reviewed.

Matching strategy:
  1. Exact match
  2. Case-insensitive
  3. Normalised (strip "The ", punctuation, accents)
"""

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_PATH = DATA_DIR / "artist-reviews.json"


def normalise(name: str) -> str:
    """Normalise artist name for fuzzy matching."""
    s = name.lower().strip()
    # Remove leading "the "
    if s.startswith("the "):
        s = s[4:]
    # Remove accents
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    # Remove punctuation except spaces
    s = re.sub(r"[^\w\s]", "", s)
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return s


def main():
    # Load listening artists with hours
    am = json.loads((ROOT / "app" / "public" / "data" / "artist-month.json").read_text())
    artist_hours = defaultdict(float)
    for r in am:
        artist_hours[r["a"]] += r["h"]

    # Load reviews
    reviews = json.loads((DATA_DIR / "reviews-unified.json").read_text())

    # Build review lookup: normalised name → list of reviews
    review_by_norm = defaultdict(list)
    review_by_lower = defaultdict(list)
    review_by_exact = defaultdict(list)

    for r in reviews:
        artist = r.get("artist")
        if not artist:
            continue
        review_by_exact[artist].append(r)
        review_by_lower[artist.lower()].append(r)
        review_by_norm[normalise(artist)].append(r)

    # Match each listening artist
    results = []
    matched = 0
    for artist, hours in sorted(artist_hours.items(), key=lambda x: -x[1]):
        # Try exact → case-insensitive → normalised
        revs = (
            review_by_exact.get(artist)
            or review_by_lower.get(artist.lower())
            or review_by_norm.get(normalise(artist))
        )

        if not revs:
            continue

        matched += 1
        scores = [r["score"] for r in revs if r.get("score") is not None]
        sources = list(set(r["source"] for r in revs))
        albums = []
        seen_albums = set()
        for r in revs:
            key = (r.get("album") or "").lower()
            if key and key not in seen_albums:
                seen_albums.add(key)
                albums.append({
                    "album": r.get("album"),
                    "score": r.get("score"),
                    "source": r["source"],
                    "date": r.get("date"),
                })

        results.append({
            "artist": artist,
            "hours": round(hours, 1),
            "avgScore": round(sum(scores) / len(scores), 1) if scores else None,
            "reviewCount": len(revs),
            "sources": sources,
            "albums": sorted(albums, key=lambda a: a.get("date") or "", reverse=True),
        })

    # Also track unmatched for stats
    unmatched_hours = sum(h for a, h in artist_hours.items()
                          if not (review_by_exact.get(a) or review_by_lower.get(a.lower()) or review_by_norm.get(normalise(a))))

    total_hours = sum(artist_hours.values())

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"Matched: {matched} / {len(artist_hours)} artists")
    print(f"Hours covered: {total_hours - unmatched_hours:.0f} / {total_hours:.0f} ({(total_hours - unmatched_hours) / total_hours * 100:.1f}%)")
    print(f"Reviews linked: {sum(r['reviewCount'] for r in results)}")
    print(f"Avg score of listened artists: {sum(r['avgScore'] * r['hours'] for r in results if r['avgScore']) / sum(r['hours'] for r in results if r['avgScore']):.1f}")
    print(f"\nSaved to {OUT_PATH}")


if __name__ == "__main__":
    main()
