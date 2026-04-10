"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useFilter } from "./FilterContext";

export default function ArtistSearch() {
  const { filtered, setSelectedArtist } = useFilter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return filtered.topArtists
      .filter((a) => a.artist.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, filtered.topArtists]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (artist: string) => {
    setSelectedArtist(artist);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="buscar artista..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query.length >= 2 && setOpen(true)}
        className="w-full sm:w-48 px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full sm:w-64 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl overflow-hidden">
          {suggestions.map((a) => (
            <button
              key={a.artist}
              onClick={() => select(a.artist)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors flex justify-between items-center"
            >
              <span className="text-zinc-200 truncate">{a.artist}</span>
              <span className="text-zinc-600 tabular-nums ml-2 flex-shrink-0">
                {a.hours}h
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
