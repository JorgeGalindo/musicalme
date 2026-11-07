"""
Two playlists from Jorge's own listening history. No recommendations.

  Olvidadas  50 songs he played a lot and hasn't played for two years or more.
             Each edition skips the songs of the two previous ones, so the list
             changes every quarter.
  Nuevas     50 songs he started playing in the last three months of data,
             most played first.

History = app/public/data/songs.json (Spotify 2009-2022 + Apple Music, written
by process.py) plus, when present, a newer Apple Music export in data/. For the
months the Apple export covers, the export wins: songs.json already holds the
Apple plays of the old export and adding both would count them twice.

Output: app/public/data/playlists.json (read by the /playlists page and by
apple_music_sync.py, which copies the lists into Apple Music).

    python scripts/playlists.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "app" / "public" / "data"
SONGS = OUT_DIR / "songs.json"
PLAYLISTS = OUT_DIR / "playlists.json"
DAILY_TRACKS = ROOT / "data" / "Apple Music - Play History Daily Tracks.csv"

SIZE = 50
FORGOTTEN_MIN_PLAYS = 10
FORGOTTEN_GAP_MONTHS = 24
FORGOTTEN_PER_ARTIST = 2
FORGOTTEN_MEMORY = 2          # editions whose songs are not repeated
NEW_WINDOW_MONTHS = 3
NEW_MIN_PLAYS = 2
NEW_PER_ARTIST = 3

PLAYLIST_META = {
    "olvidadas": {
        "name": "musicalme · Olvidadas",
        "description": "Canciones que escuchaste mucho y llevas dos años o más sin poner.",
    },
    "nuevas": {
        "name": "musicalme · Nuevas",
        "description": "Lo que empezaste a escuchar en los últimos tres meses.",
    },
}

History = dict[tuple[str, str], dict[str, int]]


def month_index(month: str) -> int:
    year, mon = month.split("-")
    return int(year) * 12 + int(mon) - 1


def load_songs_json(path: Path = SONGS) -> History:
    history: History = {}
    for row in json.loads(path.read_text()):
        months = {m: int(v[0]) for m, v in row["pm"].items() if v[0]}
        if months:  # songs with only zero-play months (skips) carry no signal
            history[(row["a"], row["s"])] = months
    return history


def load_apple_export() -> History:
    """Plays per song and month from a newer Apple export, cleaned like process.py."""
    if not DAILY_TRACKS.exists():
        return {}
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import process  # same cleaning rules as the dashboard; reads the same DAILY_TRACKS

    agg = process.load_apple_music().groupby(["artist", "song", "month"])["Play Count"].sum()
    history: History = defaultdict(dict)
    for (artist, song, month), plays in agg.items():
        if plays:
            history[(artist, song)][month] = int(plays)
    return dict(history)


def merge(base: History, apple: History) -> History:
    """Apple export replaces the base from its first month on."""
    if not apple:
        return base
    first = min(m for months in apple.values() for m in months)
    merged: History = {}
    for key, months in base.items():
        kept = {m: p for m, p in months.items() if m < first}
        if kept:
            merged[key] = kept
    for key, months in apple.items():
        merged.setdefault(key, {}).update(months)
    return merged


def _capped(rows: list[dict], per_artist: int) -> list[dict]:
    seen: dict[str, int] = defaultdict(int)
    out = []
    for row in rows:
        artist = row["artist"].casefold()
        if seen[artist] >= per_artist:
            continue
        seen[artist] += 1
        out.append(row)
    return out


def _row(key: tuple[str, str], months: dict[str, int]) -> dict:
    return {
        "artist": key[0], "song": key[1],
        "plays": sum(months.values()),
        "first_month": min(months), "last_month": max(months),
    }


def song_id(row: dict) -> str:
    return f"{row['artist']}␟{row['song']}".casefold()


def forgotten(history: History, through: str, recent: list[list[str]]) -> list[dict]:
    cutoff = month_index(through) - FORGOTTEN_GAP_MONTHS
    skip = {s for edition in recent[-FORGOTTEN_MEMORY:] for s in edition}
    pool = [_row(k, m) for k, m in history.items()
            if sum(m.values()) >= FORGOTTEN_MIN_PLAYS and month_index(max(m)) <= cutoff]
    pool.sort(key=lambda r: (-r["plays"], r["artist"], r["song"]))
    fresh = [r for r in pool if song_id(r) not in skip]
    chosen = _capped(fresh, FORGOTTEN_PER_ARTIST)[:SIZE]
    if len(chosen) < SIZE:  # small history: allow repeats rather than a short list
        ids = {song_id(r) for r in chosen}
        chosen += [r for r in _capped(pool, FORGOTTEN_PER_ARTIST) if song_id(r) not in ids][:SIZE - len(chosen)]
    return chosen


def new_songs(history: History, through: str) -> list[dict]:
    start = month_index(through) - (NEW_WINDOW_MONTHS - 1)
    pool = [_row(k, m) for k, m in history.items()
            if month_index(min(m)) >= start and sum(m.values()) >= NEW_MIN_PLAYS]
    pool.sort(key=lambda r: (-r["plays"], r["first_month"], r["artist"], r["song"]))
    return _capped(pool, NEW_PER_ARTIST)[:SIZE]


def build(history: History, previous: dict | None = None, now: datetime | None = None) -> dict:
    previous = previous or {}
    through = max(m for months in history.values() for m in months)
    recent = previous.get("history", {}).get("olvidadas", [])
    lists = {"olvidadas": forgotten(history, through, recent), "nuevas": new_songs(history, through)}

    old_lists = {p["id"]: p for p in previous.get("playlists", [])}
    playlists = []
    for pid, tracks in lists.items():
        playlists.append({
            "id": pid, **PLAYLIST_META[pid], "tracks": tracks,
            # Set by apple_music_sync.py once the list exists in Apple Music.
            "apple_url": old_lists.get(pid, {}).get("apple_url"),
            "synced_at": None,
        })

    # Remember which songs each Olvidadas edition used (only when it changes).
    ids = [song_id(r) for r in lists["olvidadas"]]
    editions = [e for e in recent if e != ids] + [ids]
    return {
        "generated_at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "data_through": through,
        "playlists": playlists,
        "history": {"olvidadas": editions[-(FORGOTTEN_MEMORY + 1):]},
    }


def main() -> None:
    history = merge(load_songs_json(), load_apple_export())
    previous = json.loads(PLAYLISTS.read_text()) if PLAYLISTS.exists() else None
    data = build(history, previous)
    PLAYLISTS.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f"Datos hasta {data['data_through']}")
    for p in data["playlists"]:
        print(f"  {p['name']}: {len(p['tracks'])} canciones")
        for t in p["tracks"][:5]:
            print(f"    {t['artist']} — {t['song']} ({t['plays']} escuchas, última {t['last_month']})")


if __name__ == "__main__":
    main()
