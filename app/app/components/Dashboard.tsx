"use client";

import { useEffect, useState } from "react";
import {
  FilterProvider,
  useFilter,
  type ArtistMonth,
  type ArtistMeta,
  type SongRow,
  type WeekdayMonth,
  type SourceMonth,
  type HourlyMonth,
  type RawData,
} from "./FilterContext";
import TimeSelector from "./TimeSelector";
import ArtistSearch from "./ArtistSearch";
import ActiveFilters from "./ActiveFilters";
import StatsRow from "./StatsRow";
import MonthlyTrendChart from "./MonthlyTrendChart";
import TopArtistsChart from "./TopArtistsChart";
import ArtistDetail from "./ArtistDetail";
import TopSongsTable from "./TopSongsTable";
import WeekdayChart from "./WeekdayChart";
import TopAlbumsChart from "./TopAlbumsChart";
import GenreChart from "./GenreChart";
import CountryChart from "./CountryChart";
import DecadeChart from "./DecadeChart";
import ScoreCard from "./ScoreCard";
import HourlyChart from "./HourlyChart";
import LoopsChart from "./LoopsChart";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return res.json();
}

const MIN_YEAR = 2009;

function DashboardInner({ raw }: { raw: RawData }) {
  const { filters, filtered } = useFilter();
  const hasArtist = !!filters.selectedArtist;

  return (
    <main className="max-w-6xl mx-auto px-4 pb-10">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <TimeSelector />
        <div className="h-5 w-px bg-zinc-800" />
        <ArtistSearch />
      </div>

      {/* Active filters */}
      <div className="mb-6">
        <ActiveFilters />
      </div>

      {/* Big numbers */}
      <div className="mb-8">
        <StatsRow />
      </div>

      {/* Monthly trend — hide when viewing single artist (detail has its own) */}
      {!hasArtist && (
        <div className="mb-8">
          <MonthlyTrendChart />
        </div>
      )}

      {/* Artist detail */}
      <div className="mb-8">
        <ArtistDetail />
      </div>

      {/* Two columns: artists + songs (hide songs when artist selected — shown in detail) */}
      <div className={`grid grid-cols-1 ${hasArtist ? "" : "lg:grid-cols-2"} gap-6 mb-8`}>
        <TopArtistsChart />
        {!hasArtist && <TopSongsTable />}
      </div>

      {/* Loops */}
      <div className="mb-8">
        <LoopsChart />
      </div>

      {/* Top albums */}
      <div className="mb-8">
        <TopAlbumsChart />
      </div>

      {/* Genre + score side by side */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 mb-8">
        <GenreChart />
        <ScoreCard />
      </div>

      {/* Two columns: weekday + hourly */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <WeekdayChart />
        <HourlyChart />
      </div>

      {/* Two columns: country + decade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <CountryChart />
        <DecadeChart />
      </div>

      <footer className="text-center text-zinc-800 text-[10px] py-6 tracking-wider">
        musicalme
      </footer>
    </main>
  );
}

export default function Dashboard() {
  const [raw, setRaw] = useState<RawData | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<ArtistMonth[]>("/data/artist-month.json"),
      fetchJson<SongRow[]>("/data/songs.json"),
      fetchJson<WeekdayMonth[]>("/data/weekday-month.json"),
      fetchJson<SourceMonth[]>("/data/source-month.json"),
      fetchJson<HourlyMonth[]>("/data/hourly-month.json"),
      fetchJson<ArtistMeta[]>("/data/artist-genres.json"),
    ]).then(([artistMonth, songs, weekdayMonth, sourceMonth, hourlyMonth, artistMeta]) => {
      const minMonth = `${MIN_YEAR}-01`;
      const filterMonth = (m: string) => m >= minMonth;

      const am = artistMonth.filter((r) => filterMonth(r.m));
      const wm = weekdayMonth.filter((r) => filterMonth(r.m));
      const sm = sourceMonth.filter((r) => filterMonth(r.m));
      const hm = hourlyMonth.filter((r) => filterMonth(r.m));

      const filteredSongs = songs
        .map((s) => {
          const pm: Record<string, [number, number]> = {};
          for (const [m, v] of Object.entries(s.pm)) {
            if (filterMonth(m)) pm[m] = v;
          }
          return { ...s, pm };
        })
        .filter((s) => Object.keys(s.pm).length > 0);

      const allMonthsSet = new Set<string>();
      for (const r of am) allMonthsSet.add(r.m);
      const allMonths = [...allMonthsSet].sort();
      const allYears = [...new Set(allMonths.map((m) => parseInt(m.slice(0, 4))))].sort();

      setRaw({
        artistMonth: am,
        songs: filteredSongs,
        weekdayMonth: wm,
        sourceMonth: sm,
        hourlyMonth: hm,
        artistMeta,
        allMonths,
        allYears,
      });
    });
  }, []);

  if (!raw) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-zinc-600 text-sm animate-pulse">cargando datos...</span>
      </div>
    );
  }

  return (
    <FilterProvider raw={raw}>
      <DashboardInner raw={raw} />
    </FilterProvider>
  );
}
