"""
Scrape NME album reviews via sitemaps.

Strategy:
  1. Fetch post-sitemapN.xml files from sitemap index
  2. Filter for review URLs (/reviews/)
  3. For each review: extract rating, artist, album, date from HTML

Usage:
  python scripts/scrape_nme.py [--year 2026]

Output: data/nme/reviews-YYYY.json (incremental — merges with existing)
"""

import argparse
import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "nme"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

SITEMAP_INDEX_URL = "https://www.nme.com/sitemap_index.xml"


def collect_review_urls_from_sitemaps() -> list[str]:
    """Fetch all post-sitemaps and extract review URLs."""
    print("Fetching NME sitemap index...")
    resp = requests.get(SITEMAP_INDEX_URL, headers=HEADERS, timeout=15)
    locs = re.findall(r'<loc>(.*?)</loc>', resp.text)
    post_sitemaps = [loc for loc in locs if 'post-sitemap' in loc]
    print(f"  Found {len(post_sitemaps)} post-sitemaps")

    all_urls: list[str] = []
    for i, sm_url in enumerate(post_sitemaps):
        resp = requests.get(sm_url, headers=HEADERS, timeout=15)
        urls = re.findall(r'<loc>(.*?)</loc>', resp.text)
        review_urls = [u for u in urls if '/reviews/' in u]
        if review_urls:
            all_urls.extend(review_urls)
            print(f"  [{i+1}/{len(post_sitemaps)}] {sm_url.split('/')[-1]}: {len(review_urls)} reviews")
        time.sleep(0.2)

    # Dedupe
    seen = set()
    deduped = []
    for u in all_urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)

    print(f"  Total unique review URLs: {len(deduped)}")
    return deduped


def scrape_review(url: str) -> dict | None:
    """Scrape a single NME review."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        html = resp.text
    except Exception:
        return None

    result = {
        "url": url,
        "album": None,
        "artist": None,
        "rating": None,
        "score": None,  # normalized to 0-10
        "date": None,
        "reviewer": None,
    }

    # Rating: itemprop="ratingValue" content="X"
    rating_match = re.search(r'itemprop="ratingValue"\s+content="(\d+)"', html)
    if rating_match:
        rating = int(rating_match.group(1))
        result["rating"] = rating
        result["score"] = rating * 2.0  # 5-star → 10-point scale

    # Date
    date_match = re.search(r'"datePublished"\s*:\s*"([^"]+)"', html)
    if date_match:
        result["date"] = date_match.group(1)[:10]

    # Author
    author_match = re.search(r'"author"[^}]*"name"\s*:\s*"([^"]+)"', html)
    if author_match:
        result["reviewer"] = author_match.group(1)

    # Artist — Album from title: "Artist – 'Album' review: ..."
    title_match = re.search(r'<title>([^<]+)</title>', html)
    if title_match:
        title = title_match.group(1).split("|")[0].strip()
        # Pattern: "Artist – 'Album' review" or "Artist - 'Album' review"
        parts = re.match(r"^(.+?)\s*[–—-]\s*['''\"]?(.+?)['''\"]?\s*review", title, re.IGNORECASE)
        if parts:
            result["artist"] = parts.group(1).strip()
            result["album"] = parts.group(2).strip().rstrip(":")

    return result


def main():
    parser = argparse.ArgumentParser(description="Scrape NME album reviews")
    parser.add_argument("--year", type=int, default=None,
                        help="Year to scrape (default: all years)")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)

    # Load all existing reviews across all year files to build URL set
    existing_urls: set[str] = set()
    existing_by_year: dict[int, list[dict]] = {}
    for f in OUT_DIR.glob("reviews-*.json"):
        year_str = f.stem.replace("reviews-", "")
        try:
            year_num = int(year_str)
            data = json.loads(f.read_text())
            existing_by_year[year_num] = data
            existing_urls.update(r["url"] for r in data)
        except (ValueError, json.JSONDecodeError):
            pass

    print(f"Loaded {len(existing_urls)} existing review URLs across {len(existing_by_year)} year files")

    # Collect all review URLs from sitemaps
    all_urls = collect_review_urls_from_sitemaps()

    # Filter out already scraped
    new_urls = [u for u in all_urls if u not in existing_urls]
    print(f"{len(new_urls)} new reviews to scrape")

    # Scrape each and bucket by year
    new_by_year: dict[int, list[dict]] = {}
    for i, url in enumerate(new_urls):
        review = scrape_review(url)
        if review and review["date"]:
            year = int(review["date"][:4])
            if args.year and year != args.year:
                continue
            if review["rating"] is not None:  # only keep rated reviews
                new_by_year.setdefault(year, []).append(review)
                stars = f"{review['rating']}/5"
                print(f"  [{i+1}/{len(new_urls)}] {review['artist'] or '?'} — {review['album'] or '?'} → {stars} ({year})")
        elif review:
            print(f"  [{i+1}/{len(new_urls)}] SKIP (no date) {url}")

        time.sleep(0.5)

    # Merge and save per year
    total_new = 0
    for year, new_reviews in sorted(new_by_year.items()):
        existing = existing_by_year.get(year, [])
        all_reviews = existing + new_reviews
        all_reviews.sort(key=lambda r: r.get("date") or "", reverse=True)

        # Dedupe by URL
        seen = set()
        deduped = [r for r in all_reviews if r["url"] not in seen and not seen.add(r["url"])]

        out_path = OUT_DIR / f"reviews-{year}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(deduped, f, ensure_ascii=False, indent=2)

        rated = sum(1 for r in deduped if r["rating"])
        added = len(deduped) - len(existing)
        total_new += added
        print(f"  {year}: {len(deduped)} reviews ({rated} rated, {added} new) → {out_path}")

    print(f"\nTotal new reviews added: {total_new}")


if __name__ == "__main__":
    main()
