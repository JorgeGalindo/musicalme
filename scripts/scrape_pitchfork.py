"""
Scrape Pitchfork album reviews for a given year.

Strategy:
  1. Fetch weekly sitemaps for the target year to collect review URLs
  2. Skip URLs already scraped (from existing output file)
  3. For each new review page: extract score, artist, date, description from HTML

Usage:
  python scripts/scrape_pitchfork.py [--year 2026]

Output: data/pitchfork/reviews-YYYY.json (incremental — merges with existing)
"""

import argparse
import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "pitchfork"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

SITEMAP_INDEX_URL = "https://pitchfork.com/sitemap.xml"


def collect_review_urls_from_sitemap(year: int) -> list[str]:
    """Fetch weekly sitemaps for the target year and extract review URLs."""
    print(f"Fetching sitemap index...")
    resp = requests.get(SITEMAP_INDEX_URL, headers=HEADERS, timeout=15)
    locs = re.findall(r'<loc>(.*?)</loc>', resp.text)
    locs = [loc.replace('&amp;', '&') for loc in locs]

    year_locs = [loc for loc in locs if f'year={year}' in loc]

    # For years not in the index (pre-2009), generate sitemap URLs directly
    if not year_locs:
        print(f"  Year {year} not in sitemap index, probing weekly sitemaps...")
        for month in range(1, 13):
            for week in range(1, 6):
                year_locs.append(
                    f"{SITEMAP_INDEX_URL}?year={year}&month={month}&week={week}"
                )

    print(f"  Found {len(year_locs)} weekly sitemaps for {year}")

    all_urls: list[str] = []
    for i, loc in enumerate(year_locs):
        resp = requests.get(loc, headers=HEADERS, timeout=15)
        urls = re.findall(r'<loc>(.*?)</loc>', resp.text)
        review_urls = [u for u in urls if '/reviews/albums/' in u]
        all_urls.extend(review_urls)
        print(f"  [{i+1}/{len(year_locs)}] {loc.split('?')[1]}: {len(review_urls)} reviews")
        time.sleep(0.3)

    # Dedupe preserving order
    seen = set()
    deduped = []
    for u in all_urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)

    print(f"  Total unique review URLs: {len(deduped)}")
    return deduped


def scrape_review(url: str) -> dict | None:
    """Scrape a single review page. Returns dict or None on failure."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        html = resp.text
    except Exception:
        return None

    result = {
        "url": url,
        "album": None,
        "artist": None,
        "score": None,
        "date": None,
        "description": None,
        "reviewer": None,
    }

    # JSON-LD: artist, album, date, description, reviewer
    ld_matches = re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL
    )
    for ld_str in ld_matches:
        try:
            ld = json.loads(ld_str)
            if ld.get("@type") != "Review":
                continue

            name = ld.get("itemReviewed", {}).get("name", "")
            if ": " in name:
                result["artist"] = name.split(": ", 1)[0]
                result["album"] = name.split(": ", 1)[1]
            else:
                result["album"] = name

            result["date"] = (ld.get("datePublished") or "")[:10]
            result["description"] = ld.get("description") or ld.get("alternativeHeadline")

            authors = ld.get("author", [])
            if isinstance(authors, list) and authors:
                result["reviewer"] = authors[0].get("name")
            break
        except (json.JSONDecodeError, AttributeError):
            pass

    # Score: "rating":X.X in inline script data
    rating_matches = re.findall(r'"rating"\s*:\s*(\d+\.?\d*)', html)
    if rating_matches:
        result["score"] = float(rating_matches[0])
    else:
        score_matches = re.findall(r'"score"\s*:\s*(\d+\.?\d*)', html)
        for s in score_matches:
            val = float(s)
            if 0 <= val <= 10:
                result["score"] = val
                break

    return result


def main():
    parser = argparse.ArgumentParser(description="Scrape Pitchfork album reviews")
    parser.add_argument("--year", type=int, default=2026, help="Year to scrape (default: 2026)")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = OUT_DIR / f"reviews-{args.year}.json"

    # Load existing for this year
    existing: list[dict] = []
    if out_path.exists():
        existing = json.loads(out_path.read_text())
        print(f"Loaded {len(existing)} existing reviews for {args.year}")

    existing_urls = {r["url"] for r in existing}

    # Collect URLs from sitemaps
    all_urls = collect_review_urls_from_sitemap(year=args.year)

    # Filter out already scraped
    new_urls = [u for u in all_urls if u not in existing_urls]
    print(f"{len(new_urls)} new reviews to scrape")

    # Scrape each
    new_reviews = []
    for i, url in enumerate(new_urls):
        review = scrape_review(url)
        if review and review["date"] and review["date"].startswith(str(args.year)):
            new_reviews.append(review)
            status = f"✓ {review['score']}" if review["score"] is not None else "?"
            print(f"  [{i+1}/{len(new_urls)}] {review['artist'] or '?'} — {review['album'] or '?'} → {status}")
        elif review and review["date"]:
            # Not target year, skip silently
            pass
        else:
            print(f"  [{i+1}/{len(new_urls)}] ERROR {url}")

        time.sleep(0.5)

    # Merge + save
    all_reviews = existing + new_reviews
    all_reviews.sort(key=lambda r: r.get("date") or "", reverse=True)

    # Dedupe by URL
    seen = set()
    deduped = []
    for r in all_reviews:
        if r["url"] not in seen:
            seen.add(r["url"])
            deduped.append(r)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)

    scored = sum(1 for r in deduped if r["score"] is not None)
    print(f"\nSaved {len(deduped)} reviews ({scored} with score) to {out_path}")


if __name__ == "__main__":
    main()
