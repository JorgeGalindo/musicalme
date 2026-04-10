"""
Scrape Uncut magazine album reviews.

Score: X/10 from itemprop="ratingValue". Paginated listing.

Usage:
  python scripts/scrape_uncut.py [--year 2026]

Output: data/uncut/reviews-YYYY.json
"""

import argparse
import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "uncut"

LISTING_URL = "https://www.uncut.co.uk/reviews/album/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}


def collect_review_urls(year: int) -> list[str]:
    """Paginate listing to collect review URLs."""
    print(f"Collecting Uncut review URLs for {year}...")
    all_urls: list[str] = []
    page = 1

    while True:
        url = f"{LISTING_URL}page/{page}/" if page > 1 else LISTING_URL
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 404:
                break
        except Exception:
            break

        links = list(dict.fromkeys(
            re.findall(r'href="(https://www\.uncut\.co\.uk/reviews/album/[^"]+)"', resp.text)
        ))

        if not links:
            break

        new_count = 0
        for u in links:
            if u not in all_urls:
                all_urls.append(u)
                new_count += 1

        # Sample date from last link to check if we've gone past target year
        sample_date = _get_date(links[-1])
        sample_year = int(sample_date[:4]) if sample_date and len(sample_date) >= 4 else None

        print(f"  page {page}: {new_count} new (sample: {sample_date or '?'})")

        if sample_year and sample_year < year:
            print(f"  Reached {sample_year}, stopping.")
            break

        page += 1
        time.sleep(0.5)

    print(f"  Total: {len(all_urls)} URLs")
    return all_urls


def _get_date(url: str) -> str | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        m = re.search(r'"datePublished"\s*:\s*"([^"]+)"', resp.text)
        if m:
            return m.group(1)[:10]
        # Fallback: date from URL or meta
        m2 = re.search(r'<time[^>]*datetime="([^"]+)"', resp.text)
        return m2.group(1)[:10] if m2 else None
    except Exception:
        return None


def scrape_review(url: str) -> dict | None:
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
        "reviewer": None,
    }

    # Rating from itemprop
    rating = re.search(r'itemprop="ratingValue"\s*content="(\d+)"', html)
    best = re.search(r'itemprop="bestRating"\s*content="(\d+)"', html)
    if rating:
        r = int(rating.group(1))
        b = int(best.group(1)) if best else 10
        result["score"] = r * (10.0 / b)  # normalise to 0-10

    # Date
    date = re.search(r'"datePublished"\s*:\s*"([^"]+)"', html)
    if not date:
        date = re.search(r'<time[^>]*datetime="([^"]+)"', html)
    if date:
        result["date"] = date.group(1)[:10]

    # Title — usually "Artist – Album review" or "Artist's Album review"
    title = re.search(r'<title>([^<]+)</title>', html)
    if title:
        t = title.group(1).split("|")[0].strip()
        t = re.sub(r'\s*review.*$', '', t, flags=re.I).strip()
        t = re.sub(r'\s*&#8211;\s*', ' – ', t)
        # Try "Artist – Album" or "Artist's Album" or "Artist: Album"
        parts = re.match(r'^(.+?)\s*[–—:]\s*(.+?)(?:\s*[:–—].+)?$', t)
        if parts:
            result["artist"] = parts.group(1).strip()
            result["album"] = parts.group(2).strip()
        else:
            # Try possessive: "Artist's Album"
            parts2 = re.match(r"^(.+?)'s\s+(.+)$", t)
            if parts2:
                result["artist"] = parts2.group(1).strip()
                result["album"] = parts2.group(2).strip()
            else:
                result["album"] = t

    # Author
    author = re.search(r'"author"[^}]*"name"\s*:\s*"([^"]+)"', html)
    if author:
        result["reviewer"] = author.group(1)

    return result


def main():
    parser = argparse.ArgumentParser(description="Scrape Uncut album reviews")
    parser.add_argument("--year", type=int, default=2026, help="Year to scrape")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = OUT_DIR / f"reviews-{args.year}.json"

    existing: list[dict] = []
    if out_path.exists():
        existing = json.loads(out_path.read_text())
        print(f"Loaded {len(existing)} existing")

    existing_urls = {r["url"] for r in existing}

    all_urls = collect_review_urls(year=args.year)
    new_urls = [u for u in all_urls if u not in existing_urls]
    print(f"{len(new_urls)} new reviews to scrape")

    new_reviews = []
    for i, url in enumerate(new_urls):
        review = scrape_review(url)
        if review and review["date"] and review["date"].startswith(str(args.year)):
            new_reviews.append(review)
            score = f"{review['score']:.0f}/10" if review["score"] is not None else "?"
            print(f"  [{i+1}/{len(new_urls)}] {review['artist'] or '?'} — {review['album'] or '?'} → {score}")
        time.sleep(0.5)

    all_reviews = existing + new_reviews
    all_reviews.sort(key=lambda r: r.get("date") or "", reverse=True)

    seen = set()
    deduped = [r for r in all_reviews if r["url"] not in seen and not seen.add(r["url"])]

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)

    scored = sum(1 for r in deduped if r["score"] is not None)
    print(f"\nSaved {len(deduped)} reviews ({scored} scored) to {out_path}")


if __name__ == "__main__":
    main()
