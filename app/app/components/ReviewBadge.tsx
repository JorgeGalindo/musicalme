"use client";

import { useEffect, useState } from "react";

type AlbumScores = Record<string, { p?: number; n?: number; r?: number }>;
type ArtistScore = { avg: number; p?: number; n?: number; r?: number; albums?: AlbumScores };
type ScoreMap = Record<string, ArtistScore>;

// Module-level cache: single fetch shared by all components
let _cache: ScoreMap | null = null;
let _promise: Promise<ScoreMap> | null = null;

function fetchScores(): Promise<ScoreMap> {
  if (!_promise) {
    _promise = fetch("/data/artist-scores.json")
      .then((r) => r.json())
      .then((data: ScoreMap) => { _cache = data; return data; })
      .catch(() => { _cache = {}; return {} as ScoreMap; });
  }
  return _promise;
}

export function useReviewScores(): ScoreMap | null {
  const [scores, setScores] = useState<ScoreMap | null>(_cache);
  useEffect(() => {
    if (_cache) { setScores(_cache); return; }
    fetchScores().then(setScores);
  }, []);
  return scores;
}

function normaliseAlbum(name: string): string {
  let s = name
    .replace(/[\u2018\u2019\u201c\u201d''""]/g, "")
    .toLowerCase()
    .trim();
  for (const suffix of [" album", " single"]) {
    if (s.endsWith(suffix)) s = s.slice(0, -suffix.length).trim();
  }
  return s;
}

const SOURCES: { key: "p" | "n"; label: string; color: string }[] = [
  { key: "p", label: "P", color: "text-amber-500/70" },
  { key: "n", label: "N", color: "text-red-400/70" },
];

export default function ReviewBadge({ artist, album }: { artist: string; album?: string }) {
  const scores = useReviewScores();
  if (!scores) return null;

  const entry = scores[artist];
  if (!entry) return null;

  let display: { p?: number; n?: number };

  if (album) {
    const norm = normaliseAlbum(album);
    const albumEntry = entry.albums?.[norm];
    if (!albumEntry) return null;
    display = albumEntry;
  } else {
    display = { p: entry.p, n: entry.n };
  }

  const badges = SOURCES.filter((s) => display[s.key] != null);
  if (badges.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-1 ml-1">
      {badges.map((s) => (
        <span key={s.key} className={`text-[9px] ${s.color} tabular-nums font-medium`}>
          {s.label}{display[s.key]!.toFixed(1)}
        </span>
      ))}
    </span>
  );
}
