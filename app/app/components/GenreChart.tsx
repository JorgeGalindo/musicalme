"use client";

import { useMemo } from "react";
import { useFilter } from "./FilterContext";

const PALETTE = [
  "#f472b6", "#e879f9", "#c084fc", "#a78bfa", "#818cf8",
  "#60a5fa", "#38bdf8", "#22d3ee", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#f87171",
];

const YEAR_COLORS = [
  "#f472b6", "#a78bfa", "#60a5fa", "#2dd4bf", "#34d399",
  "#fbbf24", "#fb923c", "#818cf8",
];

export default function GenreChart() {
  const { raw, filtered, filters, setSelectedGenre } = useFilter();
  const selected = filters.selectedGenre;

  const computeGenreHours = (artistHoursMap: Map<string, number>) => {
    const genreHours = new Map<string, { hours: number; count: number }>();
    for (const entry of raw.artistMeta) {
      const hours = artistHoursMap.get(entry.a) || 0;
      if (hours <= 0) continue;
      for (const g of entry.g) {
        const prev = genreHours.get(g) || { hours: 0, count: 0 };
        prev.hours += hours;
        prev.count += 1;
        genreHours.set(g, prev);
      }
    }
    return genreHours;
  };

  // --- Comparison: dot-range ---
  const comparisonData = useMemo(() => {
    if (!filtered.isComparing) return null;

    const periods = filtered.comparisonPeriods;
    const periodArtistHours = periods.map((period) => {
      const map = new Map<string, number>();
      for (const r of raw.artistMonth) {
        if (!period.months.has(r.m)) continue;
        map.set(r.a, (map.get(r.a) || 0) + r.h);
      }
      return map;
    });
    const periodGenres = periodArtistHours.map((ahm) => computeGenreHours(ahm));

    const allGenres = new Map<string, number>();
    for (const pg of periodGenres) for (const [g, v] of pg) allGenres.set(g, (allGenres.get(g) || 0) + v.hours);
    const topGenres = [...allGenres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([g]) => g);

    return topGenres.map((genre) => ({
      genre,
      byPeriod: Object.fromEntries(periods.map((p, i) => [p.label, Math.round((periodGenres[i].get(genre)?.hours || 0) * 10) / 10])),
    }));
  }, [raw.artistMonth, raw.artistMeta, filtered.isComparing, filtered.comparisonPeriods]);

  // --- Normal: bubble data ---
  const data = useMemo(() => {
    if (filtered.isComparing) return [];
    const artistHoursMap = new Map(filtered.topArtists.map((a) => [a.artist, a.hours]));

    if (filters.selectedArtist) {
      const entry = raw.artistMeta.find((g) => g.a === filters.selectedArtist);
      if (!entry) return [];
      return entry.g.map((g) => ({ name: g, hours: 1, count: 1 }));
    }

    const genreHours = computeGenreHours(artistHoursMap);
    return [...genreHours.entries()]
      .map(([genre, v]) => ({ name: genre, hours: Math.round(v.hours * 10) / 10, count: v.count }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 18);
  }, [raw.artistMeta, filtered.topArtists, filters.selectedArtist, filtered.isComparing]);

  // --- Render comparison: dot-range ---
  if (filtered.isComparing && comparisonData && comparisonData.length > 0) {
    const periods = filtered.comparisonPeriods;
    const maxH = Math.max(...comparisonData.flatMap((g) => periods.map((p) => g.byPeriod[p.label] || 0)));
    const ROW = 26; const PAD_L = 100; const PAD_R = 40; const W = 550;
    const H = comparisonData.length * ROW + 30;
    const x = (h: number) => PAD_L + (h / maxH) * (W - PAD_L - PAD_R);

    return (
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">Géneros — comparación</h2>
        <div className="flex gap-3 mb-4 mt-2">
          {periods.map((p, i) => (
            <span key={p.label} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: YEAR_COLORS[i] }} />
              <span className="text-zinc-400">{p.label}</span>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
            {comparisonData.map((g, ri) => {
              const cy = ri * ROW + 16;
              const vals = periods.map((p) => g.byPeriod[p.label] || 0);
              const minV = Math.min(...vals); const maxV = Math.max(...vals);
              return (
                <g key={g.genre}>
                  <text x={PAD_L - 8} y={cy + 4} textAnchor="end" className="text-[11px] fill-zinc-400">{g.genre}</text>
                  <line x1={x(minV)} x2={x(maxV)} y1={cy} y2={cy} stroke="#3f3f46" strokeWidth={2} />
                  {periods.map((p, pi) => {
                    const v = g.byPeriod[p.label] || 0;
                    return (<g key={p.label}><circle cx={x(v)} cy={cy} r={5} fill={YEAR_COLORS[pi]} /><text x={x(v)} y={cy - 9} textAnchor="middle" className="text-[9px] fill-zinc-500">{v}</text></g>);
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  }

  // --- Render normal: packed bubbles ---
  if (data.length === 0) return null;

  const maxHours = data[0]?.hours || 1;

  // Spiral packing: place each circle along a spiral, nudging to avoid overlaps
  const CX = 280;
  const CY = 160;
  const radii = data.map((d) => 18 + Math.sqrt(d.hours / maxHours) * 42);
  const placed: { x: number; y: number; r: number }[] = [];
  const bubbles: { x: number; y: number; r: number; name: string; hours: number; count: number; idx: number }[] = [];

  for (let i = 0; i < data.length; i++) {
    const r = radii[i];
    // Spiral outward to find a spot
    let bestX = CX;
    let bestY = CY;
    if (i > 0) {
      let angle = 0;
      let dist = 0;
      let found = false;
      for (let step = 0; step < 2000 && !found; step++) {
        angle = step * 0.25;
        dist = 2 + step * 0.5;
        const tx = CX + Math.cos(angle) * dist;
        const ty = CY + Math.sin(angle) * dist;
        // Check overlap with all placed
        let ok = true;
        for (const p of placed) {
          const dx = tx - p.x;
          const dy = ty - p.y;
          if (Math.sqrt(dx * dx + dy * dy) < r + p.r + 1) {
            ok = false;
            break;
          }
        }
        if (ok) {
          bestX = tx;
          bestY = ty;
          found = true;
        }
      }
    }
    placed.push({ x: bestX, y: bestY, r });
    bubbles.push({ x: bestX, y: bestY, r, name: data[i].name, hours: data[i].hours, count: data[i].count, idx: i });
  }

  // Compute SVG bounds
  const minX = Math.min(...bubbles.map((b) => b.x - b.r)) - 10;
  const maxX = Math.max(...bubbles.map((b) => b.x + b.r)) + 10;
  const minY = Math.min(...bubbles.map((b) => b.y - b.r)) - 10;
  const maxY = Math.max(...bubbles.map((b) => b.y + b.r)) + 10;
  const W = maxX - minX;
  const totalH = maxY - minY;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-1">Géneros</h2>
      <p className="text-[11px] text-zinc-600 mb-4">tamaño = horas · click para filtrar</p>
      <div className="overflow-x-auto">
        <svg viewBox={`${minX} ${minY} ${W} ${totalH}`} className="w-full">
          {bubbles.map((b) => {
            const color = PALETTE[b.idx % PALETTE.length];
            const isSelected = selected === b.name;
            const isDimmed = selected && !isSelected;
            return (
              <g key={b.name} onClick={() => setSelectedGenre(b.name)} style={{ cursor: "pointer" }}>
                <circle cx={b.x} cy={b.y} r={b.r} fill={color}
                  opacity={isDimmed ? 0.1 : 0.5} />
                <circle cx={b.x} cy={b.y} r={b.r} fill="none"
                  stroke={color} strokeWidth={isSelected ? 2 : 0}
                  opacity={0.8} />
                {b.r > 25 && (
                  <text x={b.x} y={b.y - 4} textAnchor="middle" className="text-[11px] fill-zinc-100 pointer-events-none">
                    {b.name}
                  </text>
                )}
                {b.r > 30 && (
                  <text x={b.x} y={b.y + 10} textAnchor="middle" className="text-[9px] fill-zinc-400 pointer-events-none">
                    {b.hours}h
                  </text>
                )}
                {b.r <= 25 && b.r > 18 && (
                  <text x={b.x} y={b.y + 2} textAnchor="middle" className="text-[9px] fill-zinc-200 pointer-events-none">
                    {b.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
