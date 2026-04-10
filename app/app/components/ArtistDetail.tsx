"use client";

import { useMemo } from "react";
import { buildSharedColorMap, NEUTRAL } from "./sharedColors";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useFilter } from "./FilterContext";
import ReviewBadge from "./ReviewBadge";

const YEAR_COLORS = ["#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399", "#fbbf24", "#fb923c", "#818cf8"];
const TOP_N = 15;

type SongRow = { a: string; s: string; pm: Record<string, [number, number]> };

function SongsComparison({ artist, years, songs }: { artist: string; years: number[]; songs: SongRow[] }) {
  const artistSongs = songs.filter((s) => s.a === artist);

  const perYear = years.map((year) => {
    const prefix = String(year);
    const songPlays = new Map<string, { song: string; plays: number }>();
    for (const s of artistSongs) {
      let plays = 0;
      for (const [m, [p]] of Object.entries(s.pm)) {
        if (m.startsWith(prefix)) plays += p;
      }
      if (plays > 0) songPlays.set(s.s, { song: s.s, plays });
    }
    return {
      year,
      songs: [...songPlays.values()].sort((a, b) => b.plays - a.plays).slice(0, TOP_N),
    };
  });

  const songYears = new Map<string, number>();
  for (const y of perYear) for (const s of y.songs) songYears.set(s.song, (songYears.get(s.song) || 0) + 1);
  const shared = new Set([...songYears.entries()].filter(([, c]) => c >= 2).map(([k]) => k));
  const sharedColors = buildSharedColorMap(shared);

  return (
    <div>
      <h3 className="text-[11px] text-zinc-600 uppercase tracking-wider mb-3">Top canciones — comparación</h3>
      <div className="flex gap-4 overflow-x-auto">
        {perYear.map((yData, yi) => (
          <div key={yData.year} className="flex-1 min-w-[180px]">
            <div className="text-xs font-bold mb-2 pb-1 border-b" style={{ color: YEAR_COLORS[yi], borderColor: `${YEAR_COLORS[yi]}33` }}>
              {yData.year}
            </div>
            <div className="space-y-1">
              {yData.songs.map((s, i) => {
                const colors = sharedColors.get(s.song) || NEUTRAL;
                const isShared = shared.has(s.song);
                return (
                  <div key={s.song} className={`flex items-center gap-2 text-[11px] py-0.5 px-1 rounded ${isShared ? `${colors.bg} border ${colors.border}` : ""}`}>
                    <span className="text-zinc-600 w-4 text-right tabular-nums flex-shrink-0">{i + 1}</span>
                    <span className="text-zinc-500 tabular-nums w-5 flex-shrink-0">{s.plays}</span>
                    <span className={`truncate ${isShared ? colors.text : "text-zinc-300"}`}>{s.song}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {shared.size > 0 && (
        <p className="text-[10px] text-violet-400/60 mt-2">{shared.size} canción{shared.size > 1 ? "es" : ""} en común</p>
      )}
    </div>
  );
}

export default function ArtistDetail() {
  const { filters, filtered, raw } = useFilter();
  const artist = filters.selectedArtist;

  const monthlyData = useMemo(() => {
    if (!artist) return [];
    const byMonth = new Map<string, number>();
    for (const r of raw.artistMonth) {
      if (r.a !== artist) continue;
      byMonth.set(r.m, (byMonth.get(r.m) || 0) + r.h);
    }
    const points = raw.allMonths
      .map((m) => ({
        month: m,
        label: m.slice(2),
        hours: Math.round((byMonth.get(m) || 0) * 100) / 100,
        ma6: 0,
      }))
      .filter((d) => d.hours > 0 || raw.allMonths.indexOf(d.month) % 4 === 0);

    // 6-month moving average
    for (let i = 0; i < points.length; i++) {
      const window = points.slice(Math.max(0, i - 5), i + 1);
      points[i].ma6 = Math.round((window.reduce((s, p) => s + p.hours, 0) / window.length) * 100) / 100;
    }

    return points;
  }, [raw, artist]);

  const stats = useMemo(() => {
    if (!artist) return { hours: 0, plays: 0, songs: 0 };
    return filtered.topArtists.find((a) => a.artist === artist) || { hours: 0, plays: 0, songs: 0 };
  }, [filtered.topArtists, artist]);

  const topSongs = useMemo(
    () => (artist ? filtered.topSongs.filter((s) => s.artist === artist).slice(0, 15) : []),
    [filtered.topSongs, artist]
  );

  // Rank position: where does this artist sit?
  const rank = useMemo(() => {
    if (!artist) return null;
    const idx = filtered.topArtists.findIndex((a) => a.artist === artist);
    return idx >= 0 ? idx + 1 : null;
  }, [filtered.topArtists, artist]);

  if (!artist) return null;

  return (
    <div className="rounded-xl bg-zinc-900 border border-violet-500/30 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-violet-300">{artist}<ReviewBadge artist={artist} /></h2>
          {rank && (
            <span className="text-[11px] text-zinc-600">
              #{rank} de {filtered.topArtists.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{stats.hours}h</span>
          <span>{stats.plays} plays</span>
          <span>{stats.songs} songs</span>
        </div>
      </div>

      <div className="h-[200px] mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="gradArtist" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c4b5fd" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#c4b5fd" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "#52525b", fontSize: 9 }}
              interval={Math.max(Math.floor(monthlyData.length / 8), 1)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value) => [`${value}h`, ""]}
              labelFormatter={(label) => `20${label}`}
            />
            <Area
              type="monotone"
              dataKey="hours"
              stroke="#52525b"
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="none"
              dot={false}
              opacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="ma6"
              stroke="#c4b5fd"
              strokeWidth={2}
              fill="url(#gradArtist)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Songs: comparison columns or flat list */}
      {filtered.isComparing && artist ? (
        <SongsComparison artist={artist} years={filtered.comparisonYears} songs={raw.songs} />
      ) : topSongs.length > 0 ? (
        <div>
          <h3 className="text-[11px] text-zinc-600 uppercase tracking-wider mb-2">
            Top canciones
          </h3>
          <div className="space-y-1">
            {topSongs.map((s, i) => (
              <div key={`${s.song}-${i}`} className="flex items-center gap-3 text-xs">
                <span className="text-zinc-600 w-5 text-right tabular-nums">{i + 1}</span>
                <span className="text-zinc-300 truncate flex-1">{s.song}</span>
                <span className="text-zinc-600 tabular-nums">{s.plays}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
