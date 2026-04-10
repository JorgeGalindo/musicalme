"""
Master update script. Runs the full pipeline in order:

  1. Process listening data (Apple Music + Spotify → dashboard JSONs)
  2. Enrich new artists (MusicBrainz, Last.fm, Wikidata — only missing ones)
  3. Scrape new reviews (Pitchfork, NME, RA — current year, incremental)
  4. Merge and match reviews
  5. Re-process to pick up new genre data

Usage:
  python scripts/update.py              # full update
  python scripts/update.py --skip-scrape # skip review scraping (faster)
  python scripts/update.py --skip-enrich # skip artist enrichment
  python scripts/update.py --year 2026   # only scrape specific year
"""

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
PYTHON = sys.executable


def run(script: str, *args: str, label: str = ""):
    """Run a script and stream output."""
    cmd = [PYTHON, str(SCRIPTS / script)] + list(args)
    print(f"\n{'='*60}")
    print(f"  {label or script}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, cwd=str(ROOT))
    if result.returncode != 0:
        print(f"  ⚠ {script} exited with code {result.returncode}")
    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Run full musicalme update pipeline")
    parser.add_argument("--skip-scrape", action="store_true", help="Skip review scraping")
    parser.add_argument("--skip-enrich", action="store_true", help="Skip artist enrichment")
    parser.add_argument("--year", type=int, default=datetime.now().year,
                        help="Year to scrape reviews for (default: current)")
    args = parser.parse_args()

    year = str(args.year)

    print(f"musicalme update — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Review scrape year: {year}")

    # Step 1: Process listening data
    run("process.py", label="1/6 Processing listening data (Apple Music + Spotify)")

    # Step 2: Enrich new artists
    if not args.skip_enrich:
        run("enrich_musicbrainz.py", label="2a/6 Enriching artists (MusicBrainz)")
        run("enrich_lastfm.py", label="2b/6 Enriching artists (Last.fm)")
        run("enrich_wikidata.py", label="2c/6 Enriching artists (Wikidata)")
    else:
        print("\n  Skipping artist enrichment (--skip-enrich)")

    # Step 3: Scrape new reviews
    if not args.skip_scrape:
        run("scrape_pitchfork.py", "--year", year, label=f"3a/6 Scraping Pitchfork ({year})")
        run("scrape_nme.py", "--year", year, label=f"3b/6 Scraping NME ({year})")
        run("scrape_ra.py", "--year", year, label=f"3c/6 Scraping RA ({year})")
        run("scrape_uncut.py", "--year", year, label=f"3d/6 Scraping Uncut ({year})")
    else:
        print("\n  Skipping review scraping (--skip-scrape)")

    # Step 4: Merge and match reviews
    run("merge_reviews.py", label="4/6 Merging reviews")
    run("match_reviews.py", label="5/6 Matching reviews to listening history")

    # Step 6: Re-process with updated genre data
    run("process.py", label="6/6 Re-processing with updated enrichment data")

    print(f"\n{'='*60}")
    print(f"  Done — {datetime.now().strftime('%H:%M')}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
