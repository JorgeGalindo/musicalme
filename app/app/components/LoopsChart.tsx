"use client";

import { useEffect, useMemo, useState } from "react";
import { useFilter } from "./FilterContext";
import { buildSharedColorMap, NEUTRAL } from "./sharedColors";

type LoopEvent = { a: string; s: string; d: string; m: string; p: number };

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

const TOP_N = 15;

export default function LoopsChart() {
  const [allLoops, setAllLoops] = useState<LoopEvent[] | null>(null);
  const [playFilter, setPlayFilter] = useState<number>(0);
  const { filtered, filters } = useFilter();

  useEffect(() => {
    fetch("/data/loops.json")
      .then((r) => r.json())
      .then(setAllLoops);
  }, []);

  // --- Normal mode data ---
  const loops = useMemo(() => {
    if (!allLoops) return [];
    let result = allLoops.filter((l) =>
      filtered.months.has(l.m) && (playFilter === 0 || l.p === playFilter)
    );
    if (filters.selectedArtist) {
      result = result.filter((l) => l.a === filters.selectedArtist);
    }
    if (filtered.activeArtists) {
      result = result.filter((l) => filtered.activeArtists!.has(l.a));
    }
    return result;
  }, [allLoops, filtered.months, filters.selectedArtist, filtered.activeArtists, playFilter]);

  const playValues = useMemo(() => {
    if (!allLoops) return [];
    let fa = allLoops.filter((l) => filtered.months.has(l.m));
    if (filters.selectedArtist) fa = fa.filter((l) => l.a === filters.selectedArtist);
    if (filtered.activeArtists) fa = fa.filter((l) => filtered.activeArtists!.has(l.a));
    return [...new Set(fa.map((l) => l.p))].filter((p) => p >= 3).sort((a, b) => b - a);
  }, [allLoops, filtered.months, filters.selectedArtist, filtered.activeArtists]);

  // --- Comparison mode: top looped songs per year ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing || !allLoops) return null;

    const periods = filtered.comparisonPeriods;

    const perPeriod = periods.map((period) => {
      // Aggregate: same song across multiple loop days in that period → total loop plays
      const songLoops = new Map<string, { artist: string; song: string; totalPlays: number; maxDay: number }>();

      for (const l of allLoops) {
        if (!period.months.has(l.m)) continue;
        if (filters.selectedArtist && l.a !== filters.selectedArtist) continue;
        const key = `${l.a}||${l.s}`;
        const prev = songLoops.get(key) || { artist: l.a, song: l.s, totalPlays: 0, maxDay: 0 };
        prev.totalPlays += l.p;
        prev.maxDay = Math.max(prev.maxDay, l.p);
        songLoops.set(key, prev);
      }

      return {
        label: period.label,
        songs: [...songLoops.values()].sort((a, b) => b.totalPlays - a.totalPlays).slice(0, TOP_N),
      };
    });

    // Shared songs
    const songPeriods = new Map<string, number>();
    for (const pData of perPeriod) {
      for (const s of pData.songs) {
        const key = `${s.artist}||${s.song}`;
        songPeriods.set(key, (songPeriods.get(key) || 0) + 1);
      }
    }
    const shared = new Set([...songPeriods.entries()].filter(([, c]) => c >= 2).map(([k]) => k));

    return { perPeriod, shared };
  }, [allLoops, filtered.isComparing, filtered.comparisonPeriods, filters.selectedArtist]);

  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? loops.slice(0, 100) : loops.slice(0, 20);

  if (!allLoops) return null;

  // --- Render comparison ---
  if (filtered.isComparing && comparisonData) {
    const { perPeriod, shared } = comparisonData;
    const sharedColors = buildSharedColorMap(shared);

    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
          En loop — comparación
        </h2>
        <p className="text-[11px] text-zinc-600 mb-4">
          top {TOP_N} canciones más loopeadas · en común destacadas
        </p>
        <div className="flex gap-4 overflow-x-auto">
          {perPeriod.map((pData, yi) => (
            <div key={pData.label} className="flex-1 min-w-[220px]">
              <div
                className="text-xs font-bold mb-3 pb-2 border-b"
                style={{ color: YEAR_COLORS[yi], borderColor: `${YEAR_COLORS[yi]}33` }}
              >
                {pData.label}
              </div>
              <div className="space-y-1">
                {pData.songs.map((s, i) => {
                  const key = `${s.artist}||${s.song}`;
                  const colors = sharedColors.get(key) || NEUTRAL;
                  const isShared = shared.has(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 text-[11px] py-0.5 px-1.5 rounded ${
                        isShared ? `${colors.bg} border ${colors.border}` : ""
                      }`}
                    >
                      <span className="text-zinc-600 w-4 text-right tabular-nums flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-zinc-500 tabular-nums w-6 flex-shrink-0">
                        {s.totalPlays}x
                      </span>
                      <div className="truncate">
                        <span className={isShared ? colors.text : "text-zinc-300"}>
                          {s.song}
                        </span>
                        <span className="text-zinc-600 ml-1">
                          {s.artist}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {shared.size > 0 && (
          <p className="text-[10px] text-violet-400/60 mt-3">
            {shared.size} canción{shared.size > 1 ? "es" : ""} en común
          </p>
        )}
      </div>
    );
  }

  // --- Render normal ---
  const totalLoopPlays = loops.reduce((s, l) => s + l.p, 0);
  const uniqueLoopSongs = new Set(loops.map((l) => `${l.a}||${l.s}`)).size;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
          En loop
        </h2>
        <div className="flex gap-3 text-[11px] text-zinc-600">
          <span>{uniqueLoopSongs} canciones</span>
          <span>{totalLoopPlays} reproducciones</span>
        </div>
      </div>
      <p className="text-[11px] text-zinc-600 mb-3">
        canciones escuchadas más de una vez en el mismo día
      </p>
      <div className="flex flex-wrap items-center gap-1 mb-4">
        <button
          onClick={() => { setPlayFilter(0); setShowAll(false); }}
          className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
            playFilter === 0
              ? "bg-zinc-100 text-zinc-900"
              : "text-zinc-600 hover:text-zinc-300"
          }`}
        >
          todas
        </button>
        {playValues.map((n) => (
          <button
            key={n}
            onClick={() => { setPlayFilter(n); setShowAll(false); }}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
              playFilter === n
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-600 hover:text-zinc-300"
            }`}
          >
            {n}x
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {visible.map((l, i) => (
          <div
            key={`${l.a}-${l.s}-${l.d}-${i}`}
            className="flex items-center gap-3 text-xs"
          >
            <span className="text-zinc-600 w-5 text-right tabular-nums flex-shrink-0">
              {l.p}x
            </span>
            <div className="w-16 flex-shrink-0">
              <div
                className="h-1.5 rounded bg-violet-500/50"
                style={{ width: `${Math.min(100, (l.p / (loops[0]?.p || 1)) * 100)}%` }}
              />
            </div>
            <span className="text-zinc-300 truncate flex-1">
              {l.s}
            </span>
            <span className="text-zinc-600 truncate max-w-[80px] sm:max-w-[120px] flex-shrink-0">
              {l.a}
            </span>
            <span className="text-zinc-700 tabular-nums flex-shrink-0 text-[10px] hidden sm:inline">
              {l.d}
            </span>
          </div>
        ))}
      </div>

      {loops.length > 20 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showAll ? "ver menos" : `ver más (${loops.length} total)`}
        </button>
      )}

      {loops.length === 0 && (
        <p className="text-zinc-600 text-xs py-4">Sin loops en este rango.</p>
      )}
    </div>
  );
}
