# musicalme

Personal music analytics and playlists from my own listening history. 16 years of plays (Spotify 2009–2022 + Apple Music since 2021), cross-referenced with review scores and artist metadata.

Since November 2026 there is no recommendation engine any more. Instead, every quarter the Mac mini asks Apple for a fresh copy of my Apple Music history, updates everything and rebuilds two playlists straight into my Apple Music library. See «Quarterly update» below.

## What it does

### Analytics (`/`)

Interactive dashboard visualising consumption patterns across 226k plays.

- Big-picture stats: total hours, plays, unique artists/songs
- Monthly timeline with 6-month moving average (clickable to filter month)
- **Month range slider** with from/to selection (replaces year buttons)
- **Period comparison**: "vs" button adds a second range slider to compare any two time periods across all charts
- Top artists ranking (by hours or plays, clickable to deep-dive)
- Artist detail panel: mini-timeline with MA, top songs, similar artists (Last.fm), rank position
- **Inline review scores** (Pitchfork/NME) next to every artist and album name
- Top songs table filtered by time range
- Top albums by "deep listening" score (sessions of 3+ unique tracks from same album, ring gauge)
- Genre breakdown (packed bubbles, clickable to filter) — MusicBrainz + Discogs styles
- Review score heatmap: nota media por año, or per-artist score when filtered
- Loops: songs played 3+ times in a listening day (6am–6am window, dynamic filter buttons)
- Hourly patterns (gradient colours dawn→night, local time of wherever user was)
- Country of origin (clickable donut)
- Decade of origin histogram
- Weekday patterns
- Artist search with autocomplete
- All filters compose and cascade: range + artist + genre + country + month

### Recuperar (`/recuperar`)

Resurface forgotten music. Dual month-range slider from 2008 to present. Shows **forgotten songs first** (sorted by most recent last-played, top 100), then forgotten artists with significant listening in the selected period but near-zero recent activity, plus their top songs from that era.

### Playlists (`/playlists`)

Two playlists built only from what I've listened to (`scripts/playlists.py`):

- **Olvidadas**: 50 songs with at least 10 plays that I haven't played for two years or more, most played first, at most two per artist. Each edition skips the songs of the two previous ones, so it changes every quarter.
- **Nuevas**: 50 songs first played in the last three months of data, most played first, at most three per artist.

The page lists both, with a link per song to Apple Music and a link to the real playlist once `apple_music_sync.py` has copied it into my library («musicalme · Olvidadas», «musicalme · Nuevas»; they sync to the iPhone through iCloud).

## Architecture

```
musicalme/
├── data/                              # All data (gitignored)
│   ├── Apple Music - ...csv           # Apple Music export
│   ├── Apple Music Play Activity.csv  # 177MB, per-play events with album
│   ├── spotify/                       # Spotify extended streaming history
│   │   └── Streaming_History_Audio_*.json
│   ├── pitchfork/                     # Scraped reviews (1999–2026)
│   │   └── reviews-YYYY.json
│   ├── nme/                           # Scraped reviews (2005–2026)
│   │   └── reviews-YYYY.json
│   ├── ra/                            # Scraped via GraphQL (2001–2026)
│   │   └── reviews-YYYY.json
│   ├── uncut/                         # Scraped reviews
│   │   └── reviews-YYYY.json
│   ├── reviews-unified.json           # Merged + normalised reviews (~42.6k)
│   ├── artist-reviews.json            # Listening artists matched to reviews
│   ├── artists-enriched.json          # MusicBrainz metadata (14.3k artists)
│   ├── artists-lastfm.json            # Last.fm tags, similar artists (14.3k artists)
│   ├── artists-wikidata.json          # Wikidata genres + influences (14.3k artists)
│   └── artists-discogs.json           # Discogs genres/styles per release (in progress)
├── scripts/
│   ├── process.py                     # Main pipeline: Apple+Spotify → dashboard JSONs
│   ├── update.py                      # Master orchestrator: runs full pipeline in order
│   ├── playlists.py                   # Olvidadas + Nuevas → playlists.json
│   ├── apple_export.py                # privacy.apple.com: request, download, import (Chrome)
│   ├── apple_music_sync.py            # playlists.json → Apple Music library (Chrome)
│   ├── trimestral.py                  # quarterly orchestrator run by launchd
│   ├── automation.py                  # `claude -p --chrome` + notifications
│   ├── scrape_pitchfork.py            # Pitchfork review scraper
│   ├── scrape_nme.py                  # NME review scraper
│   ├── scrape_ra.py                   # Resident Advisor GraphQL scraper
│   ├── scrape_uncut.py                # Uncut magazine scraper
│   ├── merge_reviews.py               # Unify reviews across sources
│   ├── match_reviews.py               # Match reviews ↔ listening history
│   ├── enrich_musicbrainz.py          # MusicBrainz artist metadata
│   ├── enrich_lastfm.py               # Last.fm tags + similar artists (1st degree)
│   ├── enrich_wikidata.py             # Wikidata genres + influences
│   ├── enrich_discogs.py              # Discogs genres/styles per release
│   └── requirements.txt
├── app/                               # Next.js microsite
│   ├── app/
│   │   ├── layout.tsx                 # Global layout + nav (análisis | recuperar | playlists)
│   │   ├── page.tsx                   # Analytics dashboard
│   │   ├── recuperar/                 # Resurface forgotten music
│   │   │   └── page.tsx
│   │   └── playlists/                 # Olvidadas + Nuevas
│   │       └── page.tsx
│   └── public/data/                   # Generated JSONs (gitignored)
│       ├── artist-month.json          # Core: artist × month → hours, plays, songs
│       ├── songs.json                 # artist × song → plays per month
│       ├── album-sessions.json        # artist × album × day → unique tracks (3+ only)
│       ├── loops.json                 # artist × song × day → play count (>1 only)
│       ├── artist-genres.json         # artist → genres, country, type, begin year
│       ├── weekday-month.json         # artist × weekday × month → hours
│       ├── source-month.json          # artist × source × month → hours, plays
│       ├── hourly-month.json          # hour × month → plays, minutes
│       ├── artist-similar.json         # Last.fm similar artists (lightweight)
│       ├── artist-scores.json         # Review scores per artist+album (by source: P/N/R)
│       ├── resurface.json             # Precomputed forgotten artists/songs
│       └── playlists.json             # The two playlists (+ Apple Music URL once synced)
├── .env                               # API keys (gitignored)
├── .env.example
├── .gitignore
├── DATA_DICTIONARY.md                 # Full schema documentation
└── README.md
```

## Running it

### Data pipeline

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt

# Main processing (Apple Music + Spotify → dashboard JSONs)
python scripts/process.py

# Artist enrichment (all incremental — only process new artists)
python scripts/enrich_musicbrainz.py   # ~2h for 14k artists (1 req/s)
python scripts/enrich_lastfm.py        # ~1h for 14k artists (4 req/s)
python scripts/enrich_wikidata.py      # ~2h for 14k artists (2 req/s)
python scripts/enrich_discogs.py       # ~12h for 14k artists (1 req/s)

# Review scraping (incremental per year)
python scripts/scrape_pitchfork.py --year 2026
python scripts/scrape_nme.py --year 2026
python scripts/scrape_ra.py --year 2026
python scripts/scrape_uncut.py --year 2026

# Merge, match, and re-process
python scripts/merge_reviews.py
python scripts/match_reviews.py
python scripts/process.py

# Or run everything in order:
python scripts/update.py
python scripts/update.py --skip-enrich    # skip enrichment (faster)
python scripts/update.py --skip-scrape    # skip review scraping
```

### Dashboard

```bash
cd app && npm install && npm run dev
```

Open http://localhost:3000

### Deployment

Connected to Vercel — every push to `main` auto-deploys.

## Data sources

### Listening history

**Apple Music** — Privacy export via [privacy.apple.com](https://privacy.apple.com). Oct 2021 – May 2025, ~51k play records. Daily Tracks (artist, song, date, duration, plays, device) + Play Activity (177MB, per-play events with album name).

**Spotify** — Extended streaming history via Spotify privacy settings. Jul 2009 – Feb 2022, ~175k play records. Each entry: timestamp, artist, song, album, ms_played, skipped.

Combined: **226k plays, 14.3k unique artists, 2009–2025.**

### Artist metadata (4 sources)

**MusicBrainz** (`enrich_musicbrainz.py`) — Free API, no auth. Tags/genres, country, type (group/person), active period. Search + alias fallback for name variants (e.g. "Kanye West" → "Ye"). Feeds `artist-genres.json` for the dashboard.

**Last.fm** (`enrich_lastfm.py`) — API with free key (stored in `.env`). Top tags, similar artists (shown in the artist panel), listener count, playcount. 94% coverage of listened artists.

**Wikidata** (`enrich_wikidata.py`) — SPARQL queries, no auth. Genres, **musical influences** (who influenced whom). EntitySearch for robust name matching. Unique source of influence chain data.

**Discogs** (`enrich_discogs.py`) — API with personal access token. **Genres and styles per release** — cleanest genre taxonomy (editorial: "Electronic > House > Deep House"). Enables album-level genre matching. Complete (14.3k artists).

### Reviews (4 sources, unified)

**Pitchfork** — Score 0–10. ~1000 reviews/year, 1999–2026 complete (~26k reviews). Scraped via weekly sitemaps.

**NME** — Rating 1–5 stars (×2 = 0–10). ~9.4k reviews, 2005–2026. Scraped via sitemaps.

**Resident Advisor** — Recommended yes/no (→ 8.0/6.0). Includes genres + labels. Public GraphQL API, very fast. 2001–2026 complete.

**Uncut** — Score X/10. UK-focused. `itemprop="ratingValue"`.

**Unified:** `merge_reviews.py` merges all sources, normalises to 0–10. ~42.6k reviews. `match_reviews.py` links to listening history (66% of hours matched, avg score 7.4).

## Quarterly update

`scripts/trimestral.py` runs every Monday at 10:00 on the Mac mini (`ops/com.jorge.musicalme-trimestral.plist`) and only does the step that's due:

1. Ninety days after the last cycle it asks privacy.apple.com for a copy of «Apple Media Services information».
2. Every following Monday it checks whether Apple has it ready (it takes up to a week). When it is, it downloads it, unpacks it into `data/apple-exports/<date>/` (nested zips included, nothing executed) and copies the daily-tracks CSV to `data/`.
3. It rebuilds the dashboard with `process.py` (only if the raw Spotify history is in `data/spotify/`; without it `process.py` refuses to write, so 2009–2022 can't be wiped), makes the playlists, copies them into Apple Music and pushes `app/public/data` (Vercel deploys on push).

Steps 1, 2 and the Apple Music copy drive Chrome with `claude -p --chrome`: my Claude subscription and the Claude in Chrome extension, no API key. Chrome must be open on the mini with the extension connected and my Apple ID signed in at music.apple.com and privacy.apple.com. If Apple asks to sign in again, or anything fails, I get a notification on the Mac and an email. State lives in `data/estado-trimestral.json`; `python scripts/trimestral.py --now` starts a cycle by hand.

Setup on the mini:

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
cp ops/com.jorge.musicalme-trimestral.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jorge.musicalme-trimestral.plist
```

`data/` (raw Spotify history, enrichment caches, reviews) is not in git; the originals are on the MacBook Air.

## Update workflow

Three triggers for updates:

1. **New Apple Music data** — drop new export in `data/`, run `python scripts/process.py`. All dashboard JSONs regenerate. New artists get enriched on next enrichment run.

2. **New reviews** — run scrapers for current year (`--year 2026`), then `merge_reviews.py` + `match_reviews.py`. Incremental — only fetches new URLs.

3. **New artists from listening** — run enrichment scripts (all incremental, skip already-processed).

`scripts/update.py` orchestrates all of the above in the correct order.

## Known data quirks

- iPad plays at odd hours (late night/early morning) filtered as noise
- Sofia Kourtesis "La Perla" loop session 2022-04-05 capped to 5 plays (was 50)
- Wp Sounds filtered as artist, "Rain Sounds" filtered as song (sleep/ambient noise)
- BBC Radio 6 Music filtered (not a music artist)
- Artist name variants normalised (ROSALÍA → Rosalía, Kanye West → Ye via alias)
- MusicBrainz genre tags filtered for non-genres (countries, instruments, decades, descriptors)
- Manual genre overrides for known misclassifications (Miles Davis = jazz not rock)
- Album→artist matching: Spotify direct (reliable), Apple Music via song-overlap heuristic + manual overrides
- Spotify plays <30s filtered as skips
- Spotify + Apple Music overlap 2021-2022 (both sources active, both counted)
- Hourly data: Apple Music hours can be multi-value strings ("14, 18"), split client-side
- Last.fm similar artists limited to ~10 per artist (the 2nd/3rd-degree expansion went with the recommendation engine)
