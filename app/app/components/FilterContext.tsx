"use client";

import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from "react";

// --- Types -----------------------------------------------------------

export type ArtistMonth = { a: string; m: string; h: number; p: number; s: number };
export type SongRow = { a: string; s: string; pm: Record<string, [number, number]> };
export type WeekdayMonth = { a: string; w: string; m: string; h: number };
export type SourceMonth = { a: string; src: string; m: string; h: number; p: number };
export type HourlyMonth = { hr: number; m: string; p: number; min: number };

export type ArtistMeta = { a: string; g: string[]; country: string | null; begin: number | null };

export type RawData = {
  artistMonth: ArtistMonth[];
  songs: SongRow[];
  weekdayMonth: WeekdayMonth[];
  sourceMonth: SourceMonth[];
  hourlyMonth: HourlyMonth[];
  artistMeta: ArtistMeta[];
  allMonths: string[];
  allYears: number[];
};

export type TimeRange =
  | { type: "all" }
  | { type: "years"; years: number[] }  // 1 year = filter, 2+ = compare
  | { type: "month"; month: string };

type FilterState = {
  timeRange: TimeRange;
  selectedArtist: string | null;
  selectedGenre: string | null;
  selectedCountry: string | null;
};

export type SongComputed = {
  artist: string;
  song: string;
  plays: number;
  minutes: number;
};

export type FilteredData = {
  months: Set<string>;
  activeArtists: Set<string> | null; // null = no genre/country filter active
  artistMonth: ArtistMonth[];
  weekdayMonth: WeekdayMonth[];
  sourceMonth: SourceMonth[];
  hourlyMonth: HourlyMonth[];
  // Derived
  totalHours: number;
  totalPlays: number;
  uniqueArtists: number;
  uniqueSongs: number;
  topArtists: { artist: string; hours: number; plays: number; songs: number }[];
  topSongs: SongComputed[];
  // Comparison mode
  isComparing: boolean;
  comparisonYears: number[];
};

type CtxValue = {
  raw: RawData;
  filters: FilterState;
  filtered: FilteredData;
  setTimeRange: (tr: TimeRange) => void;
  toggleYear: (year: number) => void;
  setSelectedArtist: (a: string | null) => void;
  setSelectedGenre: (g: string | null) => void;
  setSelectedCountry: (c: string | null) => void;
};

const Ctx = createContext<CtxValue | null>(null);

// --- Helpers ---------------------------------------------------------

function monthsForRange(allMonths: string[], tr: TimeRange): Set<string> {
  if (tr.type === "all") return new Set(allMonths);
  if (tr.type === "years") {
    const prefixes = tr.years.map(String);
    return new Set(allMonths.filter((m) => prefixes.some((p) => m.startsWith(p))));
  }
  return new Set([tr.month]);
}

function songTotalsInMonths(song: SongRow, months: Set<string>): { plays: number; minutes: number } {
  let plays = 0;
  let minutes = 0;
  for (const [m, [p, min]] of Object.entries(song.pm)) {
    if (months.has(m)) {
      plays += p;
      minutes += min;
    }
  }
  return { plays, minutes };
}

function deriveFiltered(raw: RawData, filters: FilterState): FilteredData {
  const months = monthsForRange(raw.allMonths, filters.timeRange);
  const isComparing = filters.timeRange.type === "years" && filters.timeRange.years.length >= 2;
  const comparisonYears = isComparing ? (filters.timeRange as { years: number[] }).years : [];

  // Artist-month filtered by time
  const amTime = raw.artistMonth.filter((r) => months.has(r.m));

  // Artist-month for display (also by selected artist if applicable)
  const am = filters.selectedArtist
    ? amTime.filter((r) => r.a === filters.selectedArtist)
    : amTime;

  // Build genre/country artist set early (needed for all dimensions)
  let genreCountrySet: Set<string> | null = null;
  if (filters.selectedGenre || filters.selectedCountry) {
    const metaMap = new Map(raw.artistMeta.map((m) => [m.a, m]));
    genreCountrySet = new Set(
      [...amTime.map((r) => r.a)].filter((a) => {
        const meta = metaMap.get(a);
        if (!meta) return false;
        if (filters.selectedGenre && !meta.g.includes(filters.selectedGenre)) return false;
        if (filters.selectedCountry && meta.country !== filters.selectedCountry) return false;
        return true;
      })
    );
  }

  // Other dimensions: time + artist + genre/country
  let wm = raw.weekdayMonth.filter((r) => months.has(r.m));
  let sm = raw.sourceMonth.filter((r) => months.has(r.m));
  const hm = raw.hourlyMonth.filter((r) => months.has(r.m));
  if (filters.selectedArtist) {
    wm = wm.filter((r) => r.a === filters.selectedArtist);
    sm = sm.filter((r) => r.a === filters.selectedArtist);
  }
  if (genreCountrySet) {
    wm = wm.filter((r) => genreCountrySet!.has(r.a));
    sm = sm.filter((r) => genreCountrySet!.has(r.a));
  }

  // Stats: use artist-filtered data when artist selected
  const statsSource = filters.selectedArtist ? am : amTime;
  const totalHours = Math.round(statsSource.reduce((s, r) => s + r.h, 0) * 10) / 10;
  const totalPlays = statsSource.reduce((s, r) => s + r.p, 0);
  const uniqueArtists = new Set(statsSource.map((r) => r.a)).size;

  // Top artists from time-filtered data
  const artistMap = new Map<string, { hours: number; plays: number; songs: number }>();
  for (const r of amTime) {
    const prev = artistMap.get(r.a) || { hours: 0, plays: 0, songs: 0 };
    prev.hours += r.h;
    prev.plays += r.p;
    prev.songs += r.s;
    artistMap.set(r.a, prev);
  }
  let topArtists = [...artistMap.entries()]
    .map(([artist, v]) => ({
      artist,
      hours: Math.round(v.hours * 100) / 100,
      plays: v.plays,
      songs: v.songs,
    }))
    .sort((a, b) => b.hours - a.hours);

  // Filter by genre/country if selected
  if (filters.selectedGenre || filters.selectedCountry) {
    const metaMap = new Map(raw.artistMeta.map((m) => [m.a, m]));
    topArtists = topArtists.filter((a) => {
      const meta = metaMap.get(a.artist);
      if (!meta) return false;
      if (filters.selectedGenre && !meta.g.includes(filters.selectedGenre)) return false;
      if (filters.selectedCountry && meta.country !== filters.selectedCountry) return false;
      return true;
    });
  }

  // Songs: compute totals within the time range, optionally filtered by artist
  let songsFiltered = raw.songs;
  if (filters.selectedArtist) {
    songsFiltered = songsFiltered.filter((s) => s.a === filters.selectedArtist);
  }
  if (filters.selectedGenre || filters.selectedCountry) {
    const artistsInFilter = new Set(topArtists.map((a) => a.artist));
    songsFiltered = songsFiltered.filter((s) => artistsInFilter.has(s.a));
  }

  const topSongs: SongComputed[] = songsFiltered
    .map((s) => {
      const { plays, minutes } = songTotalsInMonths(s, months);
      return { artist: s.a, song: s.s, plays, minutes };
    })
    .filter((s) => s.plays > 0)
    .sort((a, b) => b.plays - a.plays);

  const uniqueSongs = topSongs.length;

  const activeArtists = (filters.selectedGenre || filters.selectedCountry)
    ? new Set(topArtists.map((a) => a.artist))
    : null;

  return {
    months,
    activeArtists,
    artistMonth: am,
    weekdayMonth: wm,
    sourceMonth: sm,
    hourlyMonth: hm,
    totalHours,
    totalPlays,
    uniqueArtists,
    uniqueSongs,
    topArtists,
    topSongs,
    isComparing,
    comparisonYears,
  };
}

// --- Provider --------------------------------------------------------

export function FilterProvider({ raw, children }: { raw: RawData; children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>({
    timeRange: { type: "all" },
    selectedArtist: null,
    selectedGenre: null,
    selectedCountry: null,
  });

  const filtered = useMemo(() => deriveFiltered(raw, filters), [raw, filters]);

  const setTimeRange = (tr: TimeRange) =>
    setFilters((prev) => ({ ...prev, timeRange: tr }));

  const toggleYear = (year: number) =>
    setFilters((prev) => {
      const current = prev.timeRange;

      // If coming from "all" or "month", start fresh with this year
      if (current.type !== "years") {
        return { ...prev, timeRange: { type: "years", years: [year] } };
      }

      const years = current.years.includes(year)
        ? current.years.filter((y) => y !== year)
        : [...current.years, year].sort();

      // If no years left, go back to "all"
      if (years.length === 0) {
        return { ...prev, timeRange: { type: "all" } };
      }

      return { ...prev, timeRange: { type: "years", years } };
    });

  const setSelectedArtist = (a: string | null) =>
    setFilters((prev) => ({
      ...prev,
      selectedArtist: prev.selectedArtist === a ? null : a,
    }));

  const setSelectedGenre = (g: string | null) =>
    setFilters((prev) => ({
      ...prev,
      selectedGenre: prev.selectedGenre === g ? null : g,
    }));

  const setSelectedCountry = (c: string | null) =>
    setFilters((prev) => ({
      ...prev,
      selectedCountry: prev.selectedCountry === c ? null : c,
    }));

  return (
    <Ctx.Provider value={{ raw, filters, filtered, setTimeRange, toggleYear, setSelectedArtist, setSelectedGenre, setSelectedCountry }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFilter must be inside FilterProvider");
  return ctx;
}
