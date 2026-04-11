"use client";

import { useEffect, useState, useMemo } from "react";
import MonthRangeSlider from "../components/MonthRangeSlider";
import ResurfaceArtists from "./ResurfaceArtists";
import ResurfaceSongs from "./ResurfaceSongs";

type ArtistMonth = { a: string; m: string; h: number; p: number; s: number };
type SongRow = { a: string; s: string; pm: Record<string, [number, number]> };

// Generate all months from 2008-01 to a given end
function generateAllMonths(dataMonths: string[]): string[] {
  const result: string[] = [];
  const endMonth = dataMonths[dataMonths.length - 1] || "2025-12";
  let y = 2008, m = 1;
  while (true) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    result.push(key);
    if (key >= endMonth) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

export type ResurfaceArtistData = {
  artist: string;
  totalHours: number;
  peakPeriod: string;
  lastPlayed: string;
  topSongs: { song: string; plays: number }[];
};

export type ResurfaceSongData = {
  artist: string;
  song: string;
  totalPlays: number;
  peakPeriod: string;
  lastPlayed: string;
};

export default function DiggingDashboard() {
  const [artistMonth, setArtistMonth] = useState<ArtistMonth[] | null>(null);
  const [songs, setSongs] = useState<SongRow[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/artist-month.json").then((r) => r.json()),
      fetch("/data/songs.json").then((r) => r.json()),
    ]).then(([am, sg]) => {
      setArtistMonth(am);
      setSongs(sg);
    });
  }, []);

  // All months present in data
  const dataMonths = useMemo(() => {
    if (!artistMonth) return [];
    const set = new Set<string>();
    for (const r of artistMonth) set.add(r.m);
    return [...set].sort();
  }, [artistMonth]);

  // Full month range from 2008 to end of data
  const allMonths = useMemo(() => generateAllMonths(dataMonths), [dataMonths]);

  // Slider state: default to full data range
  const [fromIdx, setFromIdx] = useState<number | null>(null);
  const [toIdx, setToIdx] = useState<number | null>(null);
  const [minPlays, setMinPlays] = useState(8);

  // Initialize slider to data range on load
  useEffect(() => {
    if (allMonths.length > 0 && dataMonths.length > 0 && fromIdx === null) {
      const startIdx = allMonths.indexOf(dataMonths[0]);
      const endIdx = allMonths.indexOf(dataMonths[dataMonths.length - 1]);
      setFromIdx(Math.max(0, startIdx));
      setToIdx(endIdx >= 0 ? endIdx : allMonths.length - 1);
    }
  }, [allMonths, dataMonths, fromIdx]);

  // Compute resurface from slider range
  const { artists, songResults } = useMemo(() => {
    if (!artistMonth || !songs || fromIdx === null || toIdx === null) {
      return { artists: [] as ResurfaceArtistData[], songResults: [] as ResurfaceSongData[] };
    }

    const rangeFrom = allMonths[fromIdx];
    const rangeTo = allMonths[toIdx];
    const rangeSet = new Set(allMonths.slice(fromIdx, toIdx + 1));

    // Recent = last 6 months of data
    const recentStart = dataMonths[Math.max(0, dataMonths.length - 6)];
    const recentSet = new Set(dataMonths.slice(Math.max(0, dataMonths.length - 6)));

    // --- Artists ---
    // Hours in range and in recent period per artist
    const artistRange = new Map<string, number>();
    const artistRecent = new Map<string, number>();
    const artistLastMonth = new Map<string, string>();

    for (const r of artistMonth) {
      if (rangeSet.has(r.m)) {
        artistRange.set(r.a, (artistRange.get(r.a) || 0) + r.h);
      }
      if (recentSet.has(r.m)) {
        artistRecent.set(r.a, (artistRecent.get(r.a) || 0) + r.h);
      }
      const prev = artistLastMonth.get(r.a);
      if (!prev || r.m > prev) artistLastMonth.set(r.a, r.m);
    }

    // Filter: >2h in range, <1h recent
    const artistResults: ResurfaceArtistData[] = [];
    for (const [artist, rangeHours] of artistRange) {
      if (rangeHours < 2) continue;
      const recentHours = artistRecent.get(artist) || 0;
      if (recentHours >= 1) continue;

      // Peak period: best months in range for this artist
      const monthHours: { m: string; h: number }[] = [];
      for (const r of artistMonth) {
        if (r.a === artist && rangeSet.has(r.m)) {
          monthHours.push({ m: r.m, h: r.h });
        }
      }
      monthHours.sort((a, b) => b.h - a.h);
      const peakMonths = monthHours.slice(0, 3).map((x) => x.m).sort();
      const peakPeriod = peakMonths.length > 1
        ? `${peakMonths[0]} — ${peakMonths[peakMonths.length - 1]}`
        : peakMonths[0] || "";

      // Top songs for this artist (from range months)
      const artistSongs = songs.filter((s) => s.a === artist);
      const songPlays: { song: string; plays: number }[] = artistSongs.map((s) => {
        let plays = 0;
        for (const [m, [p]] of Object.entries(s.pm)) {
          if (rangeSet.has(m)) plays += p;
        }
        return { song: s.s, plays };
      }).filter((s) => s.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 5);

      artistResults.push({
        artist,
        totalHours: Math.round(rangeHours * 10) / 10,
        peakPeriod,
        lastPlayed: artistLastMonth.get(artist) || "",
        topSongs: songPlays,
      });
    }

    artistResults.sort((a, b) => b.totalHours - a.totalHours);

    // --- Songs ---
    const songRes: ResurfaceSongData[] = [];
    for (const s of songs) {
      let rangePlays = 0;
      let recentPlays = 0;
      let lastMonth = "";
      let peakMonth = "";
      let peakPlays = 0;

      for (const [m, [p]] of Object.entries(s.pm)) {
        if (rangeSet.has(m)) rangePlays += p;
        if (recentSet.has(m)) recentPlays += p;
        if (m > lastMonth) lastMonth = m;
        if (rangeSet.has(m) && p > peakPlays) {
          peakPlays = p;
          peakMonth = m;
        }
      }

      if (rangePlays >= minPlays && recentPlays === 0) {
        songRes.push({
          artist: s.a,
          song: s.s,
          totalPlays: rangePlays,
          peakPeriod: peakMonth,
          lastPlayed: lastMonth,
        });
      }
    }

    songRes.sort((a, b) => a.lastPlayed.localeCompare(b.lastPlayed));

    return {
      artists: artistResults.slice(0, 50),
      songResults: songRes.slice(0, 100),
    };
  }, [artistMonth, songs, allMonths, dataMonths, fromIdx, toIdx, minPlays]);

  if (!artistMonth || !songs || fromIdx === null || toIdx === null) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-zinc-600 text-sm animate-pulse">cargando...</span>
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-4 pb-10">
      {/* Intro */}
      <div className="mb-6">
        <p className="text-xs text-zinc-500 max-w-xl">
          Artistas y canciones que escuchabas durante un periodo pero has dejado de lado.
          Ajusta el rango para explorar distintas épocas.
        </p>
      </div>

      {/* Range slider */}
      <div className="mb-8 max-w-2xl">
        <MonthRangeSlider
          months={allMonths}
          from={fromIdx}
          to={toIdx}
          onChange={(f, t) => { setFromIdx(f); setToIdx(t); }}
        />
      </div>

      {/* Results summary */}
      <div className="mb-6 text-[11px] text-zinc-600">
        {artists.length} artistas · {songResults.length} canciones olvidadas en este rango
      </div>

      {songResults.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Canciones olvidadas
            </h2>
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              min plays
              <input
                type="number"
                min={1}
                value={minPlays}
                onChange={(e) => setMinPlays(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 text-[11px] text-center focus:outline-none focus:border-zinc-500"
              />
            </label>
          </div>
          <ResurfaceSongs songs={songResults} />
        </section>
      )}

      {artists.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-5">
            Artistas olvidados
          </h2>
          <ResurfaceArtists artists={artists} />
        </section>
      )}

      {artists.length === 0 && songResults.length === 0 && (
        <div className="rounded-xl border border-zinc-800 p-8 text-center mb-10">
          <p className="text-zinc-600 text-sm">
            No hay datos suficientes en este rango. Prueba a ampliarlo.
          </p>
        </div>
      )}

<footer className="text-center text-zinc-800 text-[10px] py-6 tracking-wider">
        musicalme
      </footer>
    </main>
  );
}
