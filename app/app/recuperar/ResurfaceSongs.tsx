"use client";

import { useState } from "react";

type Song = {
  artist: string;
  song: string;
  totalPlays: number;
  peakPeriod: string;
  lastPlayed: string;
};

function timeSince(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const then = new Date(y, m - 1);
  const now = new Date();
  const months = (now.getFullYear() - then.getFullYear()) * 12 + now.getMonth() - then.getMonth();
  if (months < 1) return "este mes";
  if (months === 1) return "hace 1 mes";
  if (months < 12) return `hace ${months} meses`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `hace ${years} año${years > 1 ? "s" : ""}`;
  return `hace ${years}a ${rem}m`;
}

export default function ResurfaceSongs({ songs }: { songs: Song[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? songs : songs.slice(0, 30);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-600 text-left border-b border-zinc-800">
              <th className="pb-2 pr-3 w-8">#</th>
              <th className="pb-2 pr-3">Canción</th>
              <th className="pb-2 pr-3">Artista</th>
              <th className="pb-2 text-right">Plays</th>
              <th className="pb-2 text-right pl-3">Pico</th>
              <th className="pb-2 text-right pl-3">Última vez</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => (
              <tr
                key={`${s.artist}-${s.song}-${i}`}
                className="border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors"
              >
                <td className="py-2 pr-3 text-zinc-600 tabular-nums">{i + 1}</td>
                <td className="py-2 pr-3 text-zinc-200 truncate max-w-[220px]">
                  {s.song}
                </td>
                <td className="py-2 pr-3 text-zinc-500 truncate max-w-[160px]">
                  {s.artist}
                </td>
                <td className="py-2 text-right tabular-nums text-zinc-300">
                  {s.totalPlays}
                </td>
                <td className="py-2 text-right pl-3 text-zinc-600 tabular-nums">
                  {s.peakPeriod}
                </td>
                <td className="py-2 text-right pl-3 text-zinc-600">
                  {timeSince(s.lastPlayed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {songs.length > 30 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showAll ? "ver menos" : `ver todas (${songs.length})`}
        </button>
      )}
    </div>
  );
}
