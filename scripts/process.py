"""
Process Apple Music data exports into JSON files for the analytics microsite.
Source: data/Apple Music - Play History Daily Tracks.csv
Output: app/public/data/*.json

Generates two core files optimised for client-side filtering:
  - artist-month.json  : every artist × month  → {hours, plays, songs}
  - songs.json         : every artist × song   → {plays, minutes, months:[]}
Plus lightweight helpers: weekday-month.json, source-month.json
"""

import json
import os
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "app" / "public" / "data"

DAILY_TRACKS = DATA_DIR / "Apple Music - Play History Daily Tracks.csv"
SPOTIFY_DIR = DATA_DIR / "spotify"


def load_apple_music() -> pd.DataFrame:
    """Load and clean Apple Music data."""
    df = pd.read_csv(DAILY_TRACKS)

    df["date"] = pd.to_datetime(df["Date Played"].astype(str), format="%Y%m%d")
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.to_period("M").astype(str)
    df["weekday"] = df["date"].dt.day_name()

    split = df["Track Description"].str.split(" - ", n=1, expand=True)
    df["artist"] = split[0]
    df["song"] = split[1]

    # Normalize artist names
    artist_map = {"ROSALÍA": "Rosalía", "Rosalía": "Rosalía"}
    for pattern, replacement in artist_map.items():
        df.loc[df["artist"].str.contains(pattern, na=False), "artist"] = replacement

    df["minutes"] = df["Play Duration Milliseconds"] / 1000 / 60

    # Apple Music Hours field is already local time of wherever the user was — no conversion needed

    # Filter noise
    noise_hours = {"0", "1", "2", "3", "4", "5", "6", "22", "23"}
    ipad_noise = (df["Source Type"] == "IPAD") & (df["Hours"].astype(str).isin(noise_hours))
    df = df[~ipad_noise].copy()
    df = df[~df["artist"].isin(["RNE R5 TN", "BBC Radio 6 Music", "Wp Sounds"])].copy()

    # Cap La Perla loop
    loop_mask = (
        (df["song"] == "La Perla")
        & (df["artist"] == "Sofia Kourtesis")
        & (df["Date Played"] == 20220405)
        & (df["Play Count"] >= 30)
    )
    if loop_mask.any():
        original = df.loc[loop_mask, "Play Count"].sum()
        df.loc[loop_mask, "Play Count"] = 5
        df.loc[loop_mask, "minutes"] = df.loc[loop_mask, "Play Duration Milliseconds"] / 1000 / 60 * (5 / original)
        print(f"  Capped loop session: La Perla 2022-04-05 ({original} → 5 plays)")

    df["source"] = "apple"
    return df[["date", "year", "month", "weekday", "artist", "song", "minutes",
               "Play Count", "Hours", "Source Type", "source"]].copy()


def load_spotify() -> pd.DataFrame:
    """Load Spotify extended streaming history and normalise to same schema."""
    if not SPOTIFY_DIR.exists():
        return pd.DataFrame()

    all_entries = []
    for f in sorted(SPOTIFY_DIR.glob("Streaming_History_Audio_*.json")):
        all_entries.extend(json.loads(f.read_text()))

    if not all_entries:
        return pd.DataFrame()

    df = pd.DataFrame(all_entries)

    # Only music (not podcasts/audiobooks)
    df = df[df["master_metadata_track_name"].notna()].copy()

    # Skip very short plays (<30s = likely skips)
    df = df[df["ms_played"] >= 30000].copy()

    # Convert UTC to local time based on conn_country
    # So hour-of-day reflects actual daily routine wherever the user was
    COUNTRY_UTC_OFFSET = {
        "CO": -5, "ES": 1, "PE": -5, "CZ": 1, "FR": 1, "DE": 1,
        "GB": 0, "US": -5, "MX": -6, "PT": 0, "IT": 1, "NL": 1,
    }
    df["_utc"] = pd.to_datetime(df["ts"])
    df["_offset"] = df["conn_country"].map(COUNTRY_UTC_OFFSET).fillna(0)
    df["date"] = df["_utc"] + pd.to_timedelta(df["_offset"], unit="h")
    df["date"] = df["date"].dt.tz_localize(None)
    df.drop(columns=["_utc", "_offset"], inplace=True)
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.to_period("M").astype(str)
    df["weekday"] = df["date"].dt.day_name()
    df["artist"] = df["master_metadata_album_artist_name"]
    df["song"] = df["master_metadata_track_name"]
    df["minutes"] = df["ms_played"] / 1000 / 60
    df["Play Count"] = 1  # Each Spotify entry is a single play
    df["Hours"] = df["date"].dt.hour
    df["Source Type"] = "SPOTIFY"
    df["source"] = "spotify"

    # Drop entries with no artist
    df = df[df["artist"].notna()].copy()

    # Normalize artist names
    artist_map = {"ROSALÍA": "Rosalía", "Rosalía": "Rosalía"}
    for pattern, replacement in artist_map.items():
        df.loc[df["artist"].str.contains(pattern, na=False), "artist"] = replacement

    # Dedupe by timestamp + track (some files overlap)
    df = df.drop_duplicates(subset=["ts", "song", "artist"])

    return df[["date", "year", "month", "weekday", "artist", "song", "minutes",
               "Play Count", "Hours", "Source Type", "source"]].copy()


def load_all_tracks() -> pd.DataFrame:
    """Load and merge Apple Music + Spotify data."""
    apple = load_apple_music()
    print(f"  Apple Music: {len(apple):,} rows")

    spotify = load_spotify()
    if len(spotify) > 0:
        print(f"  Spotify: {len(spotify):,} rows")
        df = pd.concat([apple, spotify], ignore_index=True)
    else:
        df = apple

    # Global filters (across both sources)
    df = df[~df["artist"].isin(["Wp Sounds"])].copy()
    df = df[~(df["song"] == "Rain Sounds")].copy()

    df = df.sort_values("date").reset_index(drop=True)
    print(f"  Combined: {len(df):,} rows, {df['date'].min().date()} → {df['date'].max().date()}")
    return df


# ---------------------------------------------------------------------------
# Core aggregations for client-side filtering
# ---------------------------------------------------------------------------

def make_artist_month(df: pd.DataFrame) -> list[dict]:
    """Every artist × month with hours, plays, unique songs."""
    agg = (
        df.groupby(["artist", "month"])
        .agg(
            h=("minutes", lambda x: round(x.sum() / 60, 3)),
            p=("Play Count", "sum"),
            s=("song", "nunique"),
        )
        .reset_index()
        .rename(columns={"artist": "a", "month": "m"})
    )
    # Drop rows with 0 hours and 0 plays (pure skips)
    agg = agg[(agg["h"] > 0) | (agg["p"] > 0)]
    # Convert plays to int
    agg["p"] = agg["p"].astype(int)
    agg["s"] = agg["s"].astype(int)
    return agg.to_dict(orient="records")


def make_songs(df: pd.DataFrame) -> list[dict]:
    """Every artist × song with per-month plays and minutes.

    Format: {a, s, pm: {month: [plays, minutes]}}
    This lets the client compute totals for any time range.
    """
    agg = (
        df.groupby(["artist", "song", "month"])
        .agg(
            p=("Play Count", "sum"),
            min=("minutes", lambda x: round(x.sum(), 1)),
        )
        .reset_index()
    )
    agg["p"] = agg["p"].astype(int)

    # Build nested structure: {artist, song} -> {month: [plays, mins]}
    rows = []
    for (artist, song), grp in agg.groupby(["artist", "song"]):
        pm = {}
        for _, r in grp.iterrows():
            pm[r["month"]] = [r["p"], r["min"]]
        rows.append({"a": artist, "s": song, "pm": pm})

    # Sort by total plays descending
    rows.sort(key=lambda r: sum(v[0] for v in r["pm"].values()), reverse=True)
    return rows


def make_weekday_month(df: pd.DataFrame) -> list[dict]:
    """Artist × weekday × month → hours, for filtering by artist + period."""
    agg = (
        df.groupby(["artist", "weekday", "month"])
        .agg(h=("minutes", lambda x: round(x.sum() / 60, 3)))
        .reset_index()
        .rename(columns={"artist": "a", "weekday": "w", "month": "m"})
    )
    agg = agg[agg["h"] > 0]
    return agg.to_dict(orient="records")


def make_source_month(df: pd.DataFrame) -> list[dict]:
    """Artist × source × month → hours + plays."""
    agg = (
        df.groupby(["artist", "Source Type", "month"])
        .agg(
            h=("minutes", lambda x: round(x.sum() / 60, 3)),
            p=("Play Count", "sum"),
        )
        .reset_index()
        .rename(columns={"artist": "a", "Source Type": "src", "month": "m"})
    )
    agg["p"] = agg["p"].astype(int)
    agg = agg[(agg["h"] > 0) | (agg["p"] > 0)]
    return agg.to_dict(orient="records")


def make_hourly_month(df: pd.DataFrame) -> list[dict]:
    """Hour × month → plays + minutes."""
    agg = (
        df.groupby(["Hours", "month"])
        .agg(
            p=("Play Count", "sum"),
            min=("minutes", lambda x: round(x.sum(), 1)),
        )
        .reset_index()
        .rename(columns={"Hours": "hr", "month": "m"})
    )
    agg["p"] = agg["p"].astype(int)
    return agg.to_dict(orient="records")


# ---------------------------------------------------------------------------
# Genre enrichment from MusicBrainz data
# ---------------------------------------------------------------------------

# Tags that are NOT genres — filter these out
NON_GENRE_TAGS = {
    # Countries / regions
    "american", "british", "uk", "usa", "german", "french", "japanese", "swedish",
    "australian", "canadian", "spanish", "italian", "irish", "brazilian", "colombian",
    "korean", "norwegian", "finnish", "icelandic", "belgian", "dutch", "mexican",
    "new zealand", "scottish", "welsh", "argentinian", "chilean", "cuban",
    "britannique", "united states", "united kingdom",
    # Descriptors, not genres
    "vocalist", "singer-songwriter", "female vocals", "male vocals", "icon",
    "trumpet", "guitar", "piano", "bass", "drums", "saxophone",
    "2000s", "2010s", "1990s", "1980s", "1970s", "1960s",
    "classic pop and rock", "campfire", "passionate", "mellow", "energetic",
    "united states", "seen live",
}

# Correct known misclassifications: use the most specific/accurate tag
GENRE_OVERRIDES: dict[str, list[str]] = {
    "Miles Davis": ["jazz", "jazz fusion", "modal jazz"],
    "Kendrick Lamar": ["hip hop", "rap", "west coast hip hop"],
    "Beyoncé": ["r&b", "pop", "dance"],
    "Kanye West": ["hip hop", "rap", "experimental hip hop"],
}

def make_artist_genres(enriched_path: Path) -> list[dict]:
    """Load MusicBrainz enrichment and output artist → genres mapping.

    Returns: [{a: artist, g: [genres], country: "XX", type: "Group|Person"}]
    Only includes artists with at least one genre tag.
    """
    if not enriched_path.exists():
        print("  No enrichment file found, skipping genres")
        return []

    enriched = json.loads(enriched_path.read_text())
    result = []
    for entry in enriched:
        artist = entry["artist"]

        # Use override if available
        if artist in GENRE_OVERRIDES:
            tags = GENRE_OVERRIDES[artist]
        else:
            tags = [t for t in entry.get("tags", []) if t.lower() not in NON_GENRE_TAGS][:3]

        item = {
            "a": artist,
            "g": tags,
            "country": entry.get("country"),
            "type": entry.get("type"),
            "begin": entry.get("beginYear"),
        }
        if tags or item["country"] or item["begin"]:
            result.append(item)
    return result


# ---------------------------------------------------------------------------
# Loops: songs played multiple times in a single day
# ---------------------------------------------------------------------------

def make_loops(df: pd.DataFrame) -> list[dict]:
    """Songs played more than once on a single day.

    For Apple Music: Play Count > 1 already indicates repeats.
    For Spotify: each row is one play, so group by artist+song+day and count.

    Returns list of {a, s, d (date YYYY-MM-DD), m (month), p (play count)}.
    Sorted by play count descending.
    """
    loops_df = df[df["song"].notna()].copy()
    loops_df["day"] = loops_df["date"].dt.date

    # Group by artist + song + day, sum play counts
    result = (
        loops_df.groupby(["artist", "song", "day", "month"])
        .agg(p=("Play Count", "sum"))
        .reset_index()
    )

    # Keep only days with >1 play
    result = result[result["p"] > 1].copy()

    result["d"] = pd.to_datetime(result["day"]).dt.strftime("%Y-%m-%d")
    result = result.rename(columns={"artist": "a", "song": "s", "month": "m"})
    result = result[["a", "s", "d", "m", "p"]].sort_values("p", ascending=False)
    result["p"] = result["p"].astype(int)

    return result.to_dict(orient="records")


# ---------------------------------------------------------------------------
# Recommendations: resurface
# ---------------------------------------------------------------------------

def make_resurface(df: pd.DataFrame, recent_months: int = 6, min_past_hours: float = 2) -> dict:
    """Find artists and songs that were loved in the past but dropped off recently.

    Returns:
        {
            "artists": [{artist, peakHours, peakPeriod, lastPlayed, totalHours, topSongs}],
            "songs": [{artist, song, peakPlays, peakPeriod, lastPlayed, totalPlays}]
        }
    """
    max_date = df["date"].max()
    recent_cutoff = max_date - pd.DateOffset(months=recent_months)
    recent_cutoff_month = recent_cutoff.to_period("M").start_time

    # --- Artists ---
    artist_monthly = (
        df.groupby(["artist", "month"])
        .agg(hours=("minutes", lambda x: x.sum() / 60), plays=("Play Count", "sum"))
        .reset_index()
    )
    artist_monthly["month_date"] = pd.to_datetime(artist_monthly["month"] + "-01")

    # Split into past / recent
    past = artist_monthly[artist_monthly["month_date"] < recent_cutoff_month]
    recent = artist_monthly[artist_monthly["month_date"] >= recent_cutoff_month]

    # Total hours per artist in past vs recent
    past_totals = past.groupby("artist").agg(
        past_hours=("hours", "sum"),
        past_plays=("plays", "sum"),
    ).reset_index()
    recent_totals = recent.groupby("artist").agg(
        recent_hours=("hours", "sum"),
    ).reset_index()

    merged = past_totals.merge(recent_totals, on="artist", how="left")
    merged["recent_hours"] = merged["recent_hours"].fillna(0)

    # Filter: significant past listening + little/no recent
    candidates = merged[
        (merged["past_hours"] >= min_past_hours) &
        (merged["recent_hours"] < 1)  # less than 1h in last 6 months
    ].copy()

    # Find peak period and last played for each candidate
    artist_results = []
    for _, row in candidates.iterrows():
        a = row["artist"]
        a_data = artist_monthly[artist_monthly["artist"] == a].sort_values("month")

        # Peak: best 3-month window
        a_data_sorted = a_data.sort_values("hours", ascending=False)
        peak_months = a_data_sorted.head(3)["month"].tolist()
        peak_hours = round(a_data_sorted.head(3)["hours"].sum(), 1)
        peak_period = f"{min(peak_months)} — {max(peak_months)}" if len(peak_months) > 1 else peak_months[0]

        # Last played
        last_month = a_data["month"].max()

        # Top songs
        top_songs = (
            df[df["artist"] == a]
            .groupby("song")
            .agg(plays=("Play Count", "sum"))
            .sort_values("plays", ascending=False)
            .head(5)
            .reset_index()
        )
        top_songs_list = [{"song": r["song"], "plays": int(r["plays"])} for _, r in top_songs.iterrows()]

        artist_results.append({
            "artist": a,
            "totalHours": round(row["past_hours"], 1),
            "peakHours": peak_hours,
            "peakPeriod": peak_period,
            "lastPlayed": last_month,
            "recentHours": round(row["recent_hours"], 2),
            "topSongs": top_songs_list,
        })

    # Sort by past hours descending
    artist_results.sort(key=lambda x: x["totalHours"], reverse=True)

    # --- Songs ---
    song_monthly = (
        df.groupby(["artist", "song", "month"])
        .agg(plays=("Play Count", "sum"), mins=("minutes", "sum"))
        .reset_index()
    )
    song_monthly["month_date"] = pd.to_datetime(song_monthly["month"] + "-01")

    past_songs = song_monthly[song_monthly["month_date"] < recent_cutoff_month]
    recent_songs = song_monthly[song_monthly["month_date"] >= recent_cutoff_month]

    past_song_totals = past_songs.groupby(["artist", "song"]).agg(
        past_plays=("plays", "sum"),
        past_mins=("mins", "sum"),
    ).reset_index()
    recent_song_totals = recent_songs.groupby(["artist", "song"]).agg(
        recent_plays=("plays", "sum"),
    ).reset_index()

    song_merged = past_song_totals.merge(recent_song_totals, on=["artist", "song"], how="left")
    song_merged["recent_plays"] = song_merged["recent_plays"].fillna(0)

    # Filter: at least 10 past plays, 0 recent plays
    song_candidates = song_merged[
        (song_merged["past_plays"] >= 10) &
        (song_merged["recent_plays"] == 0)
    ].copy()

    # Peak period for each song
    song_results = []
    for _, row in song_candidates.iterrows():
        s_data = song_monthly[
            (song_monthly["artist"] == row["artist"]) & (song_monthly["song"] == row["song"])
        ].sort_values("plays", ascending=False)

        peak_month = s_data.iloc[0]["month"] if len(s_data) > 0 else ""
        last_month = s_data["month"].max()

        song_results.append({
            "artist": row["artist"],
            "song": row["song"],
            "totalPlays": int(row["past_plays"]),
            "peakPeriod": peak_month,
            "lastPlayed": last_month,
        })

    song_results.sort(key=lambda x: x["totalPlays"], reverse=True)

    return {
        "artists": artist_results[:50],
        "songs": song_results[:80],
        "meta": {
            "recentCutoff": recent_cutoff.strftime("%Y-%m"),
            "recentMonths": recent_months,
        },
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    print("Loading data...")
    df = load_all_tracks()
    print(f"  {len(df):,} rows, {df['date'].min().date()} → {df['date'].max().date()}")

    outputs = {
        "artist-month.json": make_artist_month(df),
        "songs.json": make_songs(df),
        "weekday-month.json": make_weekday_month(df),
        "source-month.json": make_source_month(df),
        "hourly-month.json": make_hourly_month(df),
        "loops.json": make_loops(df),
        "artist-genres.json": make_artist_genres(DATA_DIR / "artists-enriched.json"),
        "resurface.json": make_resurface(df),
    }

    for filename, data in outputs.items():
        path = OUT_DIR / filename
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        size = os.path.getsize(path)
        print(f"  ✓ {filename} ({size / 1024:.1f} KB)")

    print("Done.")


if __name__ == "__main__":
    main()
