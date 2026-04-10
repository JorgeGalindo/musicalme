"use client";

import { useEffect, useMemo, useState } from "react";
import { useFilter } from "./FilterContext";

export default function ScoreCard() {
  const [scoreMap, setScoreMap] = useState<Record<string, number> | null>(null);
  const { raw, filtered, filters } = useFilter();

  useEffect(() => {
    fetch("/data/artist-scores.json").then((r) => r.json()).then(setScoreMap).catch(() => {});
  }, []);

  const hasSpecificFilter = !!filters.selectedArtist || !!filters.selectedGenre || !!filters.selectedCountry;

  const computeAvg = (artists: { artist: string; hours: number }[]) => {
    if (!scoreMap) return null;
    let tw = 0;
    let th = 0;
    let count = 0;
    for (const a of artists) {
      const s = scoreMap[a.artist];
      if (s != null) {
        tw += s * a.hours;
        th += a.hours;
        count++;
      }
    }
    return th > 0 ? { avg: tw / th, count } : null;
  };

  // Per-year scores
  const yearScores = useMemo(() => {
    if (!scoreMap || hasSpecificFilter) return null;

    const yearArtists = new Map<number, Map<string, number>>();
    for (const r of raw.artistMonth) {
      const year = parseInt(r.m.slice(0, 4));
      if (!yearArtists.has(year)) yearArtists.set(year, new Map());
      const m = yearArtists.get(year)!;
      m.set(r.a, (m.get(r.a) || 0) + r.h);
    }

    const results: { year: number; avg: number; count: number }[] = [];
    for (const [year, artists] of yearArtists) {
      const list = [...artists.entries()].map(([artist, hours]) => ({ artist, hours }));
      const result = computeAvg(list);
      if (result) results.push({ year, ...result });
    }

    return results.sort((a, b) => a.year - b.year);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreMap, raw.artistMonth, hasSpecificFilter]);

  // Filtered avg — uses filtered.topArtists which already applies artist/genre/country filters
  const filteredAvg = useMemo(() => {
    return computeAvg(filtered.topArtists);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreMap, filtered.topArtists]);

  if (!scoreMap) return null;

  // Score → color intensity (violet range)
  const scoreToColor = (score: number) => {
    // Map 6.0-8.5 range to intensity
    const t = Math.max(0, Math.min(1, (score - 6) / 2.5));
    // From dark violet to bright violet
    const alpha = 0.15 + t * 0.7;
    return `rgba(167, 139, 250, ${alpha})`;
  };

  // --- General view: year heatmap ---
  if (!hasSpecificFilter && yearScores && yearScores.length > 0) {
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-3">
          Nota media por año
        </span>
        <div className="space-y-1">
          {yearScores.map((ys) => (
            <div key={ys.year} className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500 w-10 tabular-nums">{ys.year}</span>
              <div
                className="flex-1 rounded py-0.5 px-2 text-right"
                style={{ background: scoreToColor(ys.avg) }}
              >
                <span className="text-zinc-100 tabular-nums font-medium text-[11px]">
                  {ys.avg.toFixed(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Single artist selected: show that artist's score ---
  if (filters.selectedArtist) {
    const artistScore = scoreMap[filters.selectedArtist];
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5 flex flex-col items-center justify-center">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">
          Nota en reviews
        </span>
        {artistScore != null ? (
          <span className="text-5xl font-light text-zinc-100 tabular-nums">
            {artistScore.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-zinc-600">sin reviews</span>
        )}
      </div>
    );
  }

  // --- Genre/country filtered: average of filtered artists ---
  if (!filteredAvg) return null;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5 flex flex-col items-center justify-center">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">
        Nota media en reviews
      </span>
      <span className="text-5xl font-light text-zinc-100 tabular-nums">
        {filteredAvg.avg.toFixed(1)}
      </span>
      <span className="text-[10px] text-zinc-600 mt-2">
        {filteredAvg.count} artistas con review
      </span>
    </div>
  );
}
