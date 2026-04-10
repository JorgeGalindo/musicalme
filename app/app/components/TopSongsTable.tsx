"use client";

import { useMemo, useState } from "react";
import { useFilter } from "./FilterContext";
import { buildSharedColorMap, NEUTRAL } from "./sharedColors";

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

const TOP_N = 20;

export default function TopSongsTable() {
  const { raw, filtered, filters } = useFilter();
  const [showAll, setShowAll] = useState(false);

  // --- Comparison mode: top songs per year ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing) return null;

    const years = filtered.comparisonYears;
    const artistFilter = filters.selectedArtist;

    // Compute top songs per year
    const perYear = years.map((year) => {
      const prefix = String(year);
      const songPlays = new Map<string, { artist: string; song: string; plays: number }>();

      for (const s of raw.songs) {
        if (artistFilter && s.a !== artistFilter) continue;
        let plays = 0;
        for (const [m, [p]] of Object.entries(s.pm)) {
          if (m.startsWith(prefix)) plays += p;
        }
        if (plays > 0) {
          const key = `${s.a}||${s.s}`;
          songPlays.set(key, { artist: s.a, song: s.s, plays });
        }
      }

      return {
        year,
        songs: [...songPlays.values()].sort((a, b) => b.plays - a.plays).slice(0, TOP_N),
      };
    });

    // Find songs that appear in multiple years
    const songYearCount = new Map<string, number>();
    for (const yData of perYear) {
      for (const s of yData.songs) {
        const key = `${s.artist}||${s.song}`;
        songYearCount.set(key, (songYearCount.get(key) || 0) + 1);
      }
    }
    const shared = new Set([...songYearCount.entries()].filter(([, c]) => c >= 2).map(([k]) => k));

    return { perYear, shared };
  }, [raw.songs, filtered.isComparing, filtered.comparisonYears]);

  // --- Normal mode ---
  const songs = useMemo(() => {
    return showAll ? filtered.topSongs.slice(0, 100) : filtered.topSongs.slice(0, 30);
  }, [filtered.topSongs, showAll]);

  // --- Render comparison ---
  if (filtered.isComparing && comparisonData) {
    const { perYear, shared } = comparisonData;
    const sharedColors = buildSharedColorMap(shared);

    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
          Top canciones — comparación
        </h2>
        <p className="text-[11px] text-zinc-600 mb-4">
          top {TOP_N} por plays · canciones en ambos años destacadas
        </p>
        <div className="flex gap-4 overflow-x-auto">
          {perYear.map((yData, yi) => (
            <div key={yData.year} className="flex-1 min-w-[220px]">
              <div
                className="text-xs font-bold mb-3 pb-2 border-b"
                style={{ color: YEAR_COLORS[yi], borderColor: `${YEAR_COLORS[yi]}33` }}
              >
                {yData.year}
              </div>
              <div className="space-y-1">
                {yData.songs.map((s, i) => {
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
                        {s.plays}
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
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
        Top canciones
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-600 text-left border-b border-zinc-800">
              <th className="pb-2 pr-3 w-8">#</th>
              <th className="pb-2 pr-3">Canción</th>
              <th className="pb-2 pr-3">Artista</th>
              <th className="pb-2 text-right">Plays</th>
              <th className="pb-2 text-right pl-3">Min</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((s, i) => (
              <tr
                key={`${s.artist}-${s.song}-${i}`}
                className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors"
              >
                <td className="py-1.5 pr-3 text-zinc-600 tabular-nums">{i + 1}</td>
                <td className="py-1.5 pr-3 text-zinc-200 truncate max-w-[250px]">
                  {s.song}
                </td>
                <td className="py-1.5 pr-3 text-zinc-500 truncate max-w-[180px]">
                  {s.artist}
                </td>
                <td className="py-1.5 text-right tabular-nums text-zinc-300">
                  {s.plays}
                </td>
                <td className="py-1.5 text-right pl-3 text-zinc-500 tabular-nums">
                  {Math.round(s.minutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.topSongs.length > 30 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showAll ? "ver menos" : `ver más (${filtered.topSongs.length} total)`}
        </button>
      )}
    </div>
  );
}
