"use client";

import { useEffect, useMemo, useState } from "react";
import { useFilter } from "./FilterContext";
import { buildSharedColorMap, NEUTRAL } from "./sharedColors";
import ReviewBadge from "./ReviewBadge";

type AlbumSession = { a: string; al: string; d: string; m: string; t: number };

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

const TOP_N = 15;

export default function TopAlbumsChart() {
  const [allSessions, setAllSessions] = useState<AlbumSession[] | null>(null);
  const { filtered, filters } = useFilter();

  useEffect(() => {
    fetch("/data/album-sessions.json")
      .then((r) => r.json())
      .then(setAllSessions);
  }, []);

  // --- Normal: score albums in current time + artist filter ---
  const albums = useMemo(() => {
    if (!allSessions || filtered.isComparing) return [];

    let sessions = allSessions.filter((s) => filtered.months.has(s.m));
    if (filters.selectedArtist) {
      sessions = sessions.filter((s) => s.a === filters.selectedArtist);
    }
    if (filtered.activeArtists) {
      sessions = sessions.filter((s) => filtered.activeArtists!.has(s.a));
    }

    // Aggregate by album
    const albumMap = new Map<string, { artist: string; album: string; score: number; sessions: number; totalTracks: number }>();
    for (const s of sessions) {
      const key = `${s.a}||${s.al}`;
      const prev = albumMap.get(key) || { artist: s.a, album: s.al, score: 0, sessions: 0, totalTracks: 0 };
      prev.score += s.t;
      prev.sessions += 1;
      prev.totalTracks += s.t;
      albumMap.set(key, prev);
    }

    return [...albumMap.values()]
      .map((a) => ({ ...a, avgTracks: Math.round((a.totalTracks / a.sessions) * 10) / 10 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [allSessions, filtered.months, filters.selectedArtist, filtered.isComparing]);

  // --- Comparison: top albums per year ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing || !allSessions) return null;

    const periods = filtered.comparisonPeriods;

    const perPeriod = periods.map((period) => {
      let sessions = allSessions.filter((s) => period.months.has(s.m));
      if (filters.selectedArtist) {
        sessions = sessions.filter((s) => s.a === filters.selectedArtist);
      }

      const albumMap = new Map<string, { artist: string; album: string; score: number }>();
      for (const s of sessions) {
        const key = `${s.a}||${s.al}`;
        const prev = albumMap.get(key) || { artist: s.a, album: s.al, score: 0 };
        prev.score += s.t;
        albumMap.set(key, prev);
      }

      return {
        label: period.label,
        albums: [...albumMap.values()].sort((a, b) => b.score - a.score).slice(0, TOP_N),
      };
    });

    // Shared albums
    const albumPeriods = new Map<string, number>();
    for (const pData of perPeriod) {
      for (const a of pData.albums) {
        const key = `${a.artist}||${a.album}`;
        albumPeriods.set(key, (albumPeriods.get(key) || 0) + 1);
      }
    }
    const shared = new Set([...albumPeriods.entries()].filter(([, c]) => c >= 2).map(([k]) => k));

    return { perPeriod, shared };
  }, [allSessions, filtered.isComparing, filtered.comparisonPeriods, filters.selectedArtist]);

  const [showAll, setShowAll] = useState(false);

  if (!allSessions) return null;

  // --- Render comparison ---
  if (filtered.isComparing && comparisonData) {
    const { perPeriod, shared } = comparisonData;
    const sharedColors = buildSharedColorMap(shared);

    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
          Top álbumes — comparación
        </h2>
        <p className="text-[11px] text-zinc-600 mb-4">
          top {TOP_N} por escucha profunda · en común destacados
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
                {pData.albums.map((a, i) => {
                  const key = `${a.artist}||${a.album}`;
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
                        {a.score}
                      </span>
                      <div className="truncate">
                        <span className={isShared ? colors.text : "text-zinc-300"}>
                          {a.album}
                        </span>
                        <span className="text-zinc-600 ml-1">
                          {a.artist}
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
            {shared.size} álbum{shared.size > 1 ? "es" : ""} en común
          </p>
        )}
      </div>
    );
  }

  // --- Render normal ---
  if (albums.length === 0) return null;

  const visible = showAll ? albums : albums.slice(0, TOP_N);
  const maxScore = albums[0]?.score || 1;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
        Top álbumes
      </h2>
      <p className="text-[11px] text-zinc-600 mb-4">
        escucha profunda: sesiones de 3+ canciones distintas del mismo disco
      </p>
      <div className="space-y-2">
        {visible.map((a, i) => (
          <div key={`${a.artist}-${a.album}-${i}`} className="flex items-center gap-3 text-xs">
            <span className="text-zinc-600 w-5 text-right tabular-nums flex-shrink-0">
              {i + 1}
            </span>
            {/* Ring gauge */}
            <div className="w-7 h-7 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-7 h-7">
                <circle cx="18" cy="18" r="13" fill="none" stroke="#27272a" strokeWidth="5" />
                <circle cx="18" cy="18" r="13" fill="none" stroke="#a78bfa"
                  strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${(a.score / maxScore) * 82} 82`}
                  transform="rotate(-90 18 18)"
                  opacity={0.5 + (a.score / maxScore) * 0.5}
                />
              </svg>
            </div>
            {/* Album info */}
            <div className="flex-1 min-w-0">
              <div className="truncate">
                <span className="text-zinc-200">{a.album}</span>
                <ReviewBadge artist={a.artist} album={a.album} />
              </div>
              <div className="text-[10px] text-zinc-600 truncate">
                {a.artist}
              </div>
            </div>
            {/* Stats */}
            <div className="flex gap-3 flex-shrink-0 text-[10px] text-zinc-500 tabular-nums">
              <span title="score total">{a.score}</span>
              <span title="sesiones">{a.sessions}s</span>
              <span title="media tracks/sesión">~{a.avgTracks}t</span>
            </div>
          </div>
        ))}
      </div>
      {albums.length > TOP_N && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showAll ? "ver menos" : `ver más (${albums.length})`}
        </button>
      )}
    </div>
  );
}
