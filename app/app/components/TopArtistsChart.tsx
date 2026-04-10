"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { useFilter } from "./FilterContext";
import { useReviewScores } from "./ReviewBadge";

const PALETTE = [
  "#f472b6", "#e879f9", "#c084fc", "#a78bfa", "#818cf8",
  "#60a5fa", "#38bdf8", "#22d3ee", "#2dd4bf", "#34d399",
];

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

function pickColor(i: number, n: number) {
  return PALETTE[Math.floor((i / Math.max(n - 1, 1)) * (PALETTE.length - 1))];
}

type Metric = "hours" | "plays";

export default function TopArtistsChart() {
  const { raw, filtered, filters, setSelectedArtist } = useFilter();
  const selected = filters.selectedArtist;
  const [metric, setMetric] = useState<Metric>("hours");
  const [similarMap, setSimilarMap] = useState<Record<string, string[]> | null>(null);
  const scoreMap = useReviewScores();

  useEffect(() => {
    fetch("/data/artist-similar.json").then((r) => r.json()).then(setSimilarMap).catch(() => {});
  }, []);

  const handleBarClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data: any) => {
      if (data?.artist) {
        setSelectedArtist(data.artist);
      }
    },
    [setSelectedArtist]
  );

  // --- Distribution view when artist is selected ---
  const distributionData = useMemo(() => {
    if (!selected) return null;

    const all = filtered.topArtists;
    const selectedIdx = all.findIndex((a) => a.artist === selected);
    if (selectedIdx < 0) return null;

    // Log-scale buckets: most artists have very few hours, long tail to 100+
    const selH = all[selectedIdx].hours;
    const minH = Math.max(all[all.length - 1]?.hours || 0.01, 0.01);
    const maxH = all[0]?.hours || 1;
    const logMin = Math.log10(minH);
    const logMax = Math.log10(maxH);
    const bucketCount = 25;
    const logStep = (logMax - logMin) / bucketCount;

    const buckets: { range: string; count: number; from: number; to: number; hasSelected: boolean }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const from = Math.pow(10, logMin + i * logStep);
      const to = Math.pow(10, logMin + (i + 1) * logStep);
      const count = all.filter((a) => a.hours >= from && (i === bucketCount - 1 ? a.hours <= to : a.hours < to)).length;
      const hasSelected = selH >= from && (i === bucketCount - 1 ? selH <= to : selH < to);
      const label = from < 1
        ? `<1h`
        : to < 10
          ? `${from.toFixed(1)}-${to.toFixed(1)}h`
          : `${Math.round(from)}-${Math.round(to)}h`;
      buckets.push({ range: label, count, from, to, hasSelected });
    }

    return { buckets, selectedArtist: all[selectedIdx], total: all.length, rank: selectedIdx + 1 };
  }, [filtered.topArtists, selected]);

  // --- Comparison: dot-range ---
  const comparisonArtists = useMemo(() => {
    if (!filtered.isComparing) return null;

    const years = filtered.comparisonYears;
    const artistHours = new Map<string, Map<number, number>>();
    for (const r of raw.artistMonth) {
      const year = parseInt(r.m.slice(0, 4));
      if (!years.includes(year)) continue;
      if (!artistHours.has(r.a)) artistHours.set(r.a, new Map());
      const ym = artistHours.get(r.a)!;
      ym.set(year, (ym.get(year) || 0) + r.h);
    }

    return [...artistHours.entries()]
      .map(([artist, ym]) => ({
        artist,
        total: [...ym.values()].reduce((a, b) => a + b, 0),
        byYear: Object.fromEntries([...ym.entries()].map(([y, h]) => [y, Math.round(h * 10) / 10])),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [raw.artistMonth, filtered.isComparing, filtered.comparisonYears]);

  // --- Normal: top 25 sorted by chosen metric ---
  const top25 = useMemo(() => {
    const sorted = [...filtered.topArtists].sort((a, b) =>
      metric === "hours" ? b.hours - a.hours : b.plays - a.plays
    );
    return sorted.slice(0, 30);
  }, [filtered.topArtists, metric]);

  // --- Render: similar artists when artist selected ---
  const similarArtists = useMemo(() => {
    if (!selected || !similarMap) return null;
    const simNames = similarMap[selected] || [];
    if (simNames.length === 0) return null;

    // Build hours lookup from all artists (not just filtered)
    const allArtistHours = new Map<string, number>();
    for (const r of raw.artistMonth) {
      allArtistHours.set(r.a, (allArtistHours.get(r.a) || 0) + r.h);
    }

    const withHours = simNames.map((name) => ({
      name,
      hours: Math.round((allArtistHours.get(name) || 0) * 10) / 10,
    }));

    const listened = withHours.filter((a) => a.hours > 0).sort((a, b) => b.hours - a.hours);
    const notListened = withHours.filter((a) => a.hours === 0);

    return { listened, notListened };
  }, [selected, similarMap, raw.artistMonth]);

  if (selected && !filtered.isComparing) {
    // Show similar if available, or a loading/empty state
    if (!similarArtists) {
      return (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
            Similares a {selected}
          </h2>
          <p className="text-[11px] text-zinc-600">{similarMap ? "sin datos de similitud" : "cargando..."}</p>
        </div>
      );
    }
    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
            Similares a {selected}
          </h2>
          <p className="text-[11px] text-zinc-600 mb-4">según Last.fm</p>

        {similarArtists.listened.length > 0 && (
          <div className="mb-4">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Los que más escuchas
            </span>
            <div className="mt-2 space-y-1.5">
              {similarArtists.listened.map((a) => (
                <button
                  key={a.name}
                  onClick={() => setSelectedArtist(a.name)}
                  className="flex items-center gap-3 text-xs w-full text-left hover:bg-zinc-800/30 rounded px-1 py-0.5 transition-colors"
                >
                  <div className="w-16 flex-shrink-0">
                    <div
                      className="h-1.5 rounded bg-violet-500/50"
                      style={{ width: `${Math.min(100, (a.hours / (similarArtists.listened[0]?.hours || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-zinc-300 truncate flex-1">{a.name}</span>
                  <span className="text-zinc-600 tabular-nums">{a.hours}h</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {similarArtists.notListened.length > 0 && (
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              No has escuchado
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {similarArtists.notListened.map((a) => (
                <span key={a.name} className="px-2 py-0.5 text-[11px] rounded bg-zinc-800 text-zinc-400">
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Render: comparison dot-range ---
  if (filtered.isComparing && comparisonArtists) {
    const years = filtered.comparisonYears;
    const maxH = Math.max(...comparisonArtists.flatMap((a) => years.map((y) => a.byYear[y] || 0)));
    const ROW = 28;
    const PAD_L = 140;
    const PAD_R = 50;
    const W = 700;
    const H = comparisonArtists.length * ROW + 30;

    const x = (h: number) => PAD_L + (h / maxH) * (W - PAD_L - PAD_R);

    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
          Top artistas — comparación
        </h2>
        <div className="flex gap-3 mb-4 mt-2">
          {years.map((y, i) => (
            <span key={y} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: YEAR_COLORS[i] }} />
              <span className="text-zinc-400">{y}</span>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
            {comparisonArtists.map((a, ri) => {
              const cy = ri * ROW + 16;
              const vals = years.map((y) => a.byYear[y] || 0);
              const minV = Math.min(...vals);
              const maxV = Math.max(...vals);
              return (
                <g key={a.artist}>
                  <text x={PAD_L - 8} y={cy + 4} textAnchor="end" className="text-[11px] fill-zinc-400">
                    {a.artist}
                  </text>
                  <line x1={x(minV)} x2={x(maxV)} y1={cy} y2={cy} stroke="#3f3f46" strokeWidth={2} />
                  {years.map((y, yi) => {
                    const v = a.byYear[y] || 0;
                    return (
                      <g key={y}>
                        <circle cx={x(v)} cy={cy} r={5} fill={YEAR_COLORS[yi]} />
                        <text x={x(v)} y={cy - 9} textAnchor="middle" className="text-[9px] fill-zinc-500">
                          {v}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  }

  // --- Render: normal bar chart ---
  const metricLabel = metric === "hours" ? "horas" : "reproducciones";

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">
            Top artistas
          </h2>
          <p className="text-[11px] text-zinc-600">
            por {metricLabel} · click para filtrar
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-zinc-800">
          <button
            onClick={() => setMetric("hours")}
            className={`px-2.5 py-1 text-[11px] transition-colors ${
              metric === "hours"
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            horas
          </button>
          <button
            onClick={() => setMetric("plays")}
            className={`px-2.5 py-1 text-[11px] transition-colors ${
              metric === "plays"
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            plays
          </button>
        </div>
      </div>
      <div style={{ height: top25.length * 28 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={top25}
            layout="vertical"
            margin={{ left: 10, right: 55 }}
          >
            <XAxis type="number" hide />
            <YAxis
              dataKey="artist"
              type="category"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              width={120}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontSize: 12,
                color: "#a1a1aa",
              }}
              formatter={(value, _name, props) => {
                const p = (props as { payload: { artist: string; plays: number; hours: number; songs: number } }).payload;
                const sc = scoreMap?.[p.artist];
                const parts = metric === "hours"
                  ? `${value}h · ${p.plays} plays · ${p.songs} songs`
                  : `${value} plays · ${p.hours}h · ${p.songs} songs`;
                const scoreParts: string[] = [];
                if (sc?.p != null) scoreParts.push(`P ${sc.p}`);
                if (sc?.n != null) scoreParts.push(`N ${sc.n}`);
                return [
                  scoreParts.length > 0 ? `${parts} · ${scoreParts.join(" ")}` : parts,
                  "",
                ];
              }}
            />
            <Bar
              dataKey={metric}
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={handleBarClick}
            >
              {top25.map((entry, i) => (
                <Cell
                  key={entry.artist}
                  fill={pickColor(i, top25.length)}
                  opacity={selected && selected !== entry.artist ? 0.15 : 1}
                />
              ))}
              <LabelList
                dataKey={metric}
                position="right"
                formatter={(v) =>
                  metric === "hours"
                    ? `${Math.round(Number(v) * 10) / 10}h`
                    : String(v)
                }
                style={{ fill: "#71717a", fontSize: 10 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
