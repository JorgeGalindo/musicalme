"""
Scrape Resident Advisor album reviews via their public GraphQL API.

Per review: artist(s), title, date, genres, labels, recommended (yes/no).
No numeric score — RA uses recommended/not-recommended.

Usage:
  python scripts/scrape_ra.py [--year 2026]

Output: data/ra/reviews-YYYY.json
"""

import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "ra"

GRAPHQL_URL = "https://ra.co/graphql"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
}

QUERY = """
{
  reviews(type: ALBUM, limit: 20, dateFrom: "%s", dateTo: "%s", orderBy: LATEST) {
    id
    title
    date
    recommended
    artists { name }
    genres { name }
    labels { name }
  }
}
"""


def fetch_reviews_year(year: int) -> list[dict]:
    """Fetch all album reviews for a year via cursor-style pagination on date."""
    print(f"Fetching RA album reviews for {year}...")
    all_reviews: list[dict] = []
    seen_ids: set[str] = set()

    date_from = f"{year}-01-01"
    date_to = f"{year}-12-31T23:59:59.000Z"

    while True:
        query = QUERY % (date_from, date_to)
        try:
            resp = requests.post(GRAPHQL_URL, json={"query": query}, headers=HEADERS, timeout=15)
            data = resp.json()
        except Exception as e:
            print(f"  Error: {e}")
            break

        reviews = data.get("data", {}).get("reviews", [])
        if not reviews:
            break

        new_count = 0
        oldest_date = None
        for r in reviews:
            if r["id"] in seen_ids:
                continue
            seen_ids.add(r["id"])
            new_count += 1

            review = {
                "id": r["id"],
                "title": r["title"],
                "date": r["date"][:10] if r.get("date") else None,
                "recommended": r.get("recommended", False),
                "artists": [a["name"] for a in r.get("artists", [])],
                "genres": [g["name"] for g in r.get("genres", [])],
                "labels": [l["name"] for l in r.get("labels", [])],
            }

            # Split "Artist - Album" from title
            if " - " in (r.get("title") or ""):
                parts = r["title"].split(" - ", 1)
                review["artist"] = parts[0].strip()
                review["album"] = parts[1].strip()
            else:
                review["artist"] = ", ".join(review["artists"]) if review["artists"] else None
                review["album"] = r.get("title")

            all_reviews.append(review)
            oldest_date = r["date"]

        print(f"  batch: {new_count} new (total: {len(all_reviews)}, oldest: {oldest_date[:10] if oldest_date else '?'})")

        if new_count == 0 or len(reviews) < 20:
            break

        # Move cursor: set dateTo to just before the oldest in this batch
        if oldest_date:
            date_to = oldest_date
        else:
            break

        time.sleep(0.5)

    print(f"  Total: {len(all_reviews)} reviews for {year}")
    return all_reviews


def main():
    parser = argparse.ArgumentParser(description="Scrape Resident Advisor album reviews")
    parser.add_argument("--year", type=int, default=2026, help="Year to scrape")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = OUT_DIR / f"reviews-{args.year}.json"

    reviews = fetch_reviews_year(args.year)

    reviews.sort(key=lambda r: r.get("date") or "", reverse=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(reviews, f, ensure_ascii=False, indent=2)

    recommended = sum(1 for r in reviews if r["recommended"])
    print(f"\nSaved {len(reviews)} reviews ({recommended} recommended) to {out_path}")


if __name__ == "__main__":
    main()
