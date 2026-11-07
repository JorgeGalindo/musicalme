"use client";

import { useEffect, useState } from "react";

// Written by scripts/playlists.py; apple_url by scripts/apple_music_sync.py.
type Track = { artist: string; song: string; plays: number; first_month: string; last_month: string };
type Playlist = {
  id: string; name: string; description: string; tracks: Track[];
  apple_url: string | null; synced_at: string | null;
};
type Data = { generated_at: string; data_through: string; playlists: Playlist[] };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function searchUrl(t: Track): string {
  return `https://music.apple.com/es/search?term=${encodeURIComponent(`${t.artist} ${t.song}`)}`;
}

function PlaylistCard({ p }: { p: Playlist }) {
  const forgotten = p.id === "olvidadas";
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg text-zinc-100 font-light">{p.name.replace("musicalme · ", "")}</h2>
        {p.apple_url ? (
          <a href={p.apple_url} className="text-[11px] text-violet-300 hover:text-violet-200">
            abrir en Apple Music
          </a>
        ) : (
          <span className="text-[11px] text-zinc-600">aún no está en Apple Music</span>
        )}
      </div>
      <p className="text-xs text-zinc-500 mt-1 mb-4">{p.description}</p>
      <ol className="text-xs divide-y divide-zinc-800/40">
        {p.tracks.map((t, i) => (
          <li key={`${t.artist}-${t.song}`} className="py-2 grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-3 items-baseline">
            <span className="text-zinc-600 tabular-nums">{i + 1}</span>
            <a href={searchUrl(t)} className="min-w-0 hover:underline underline-offset-2">
              <span className="text-zinc-200 block truncate">{t.song}</span>
              <span className="text-zinc-500 block truncate">{t.artist}</span>
            </a>
            <span className="text-zinc-500 tabular-nums text-right whitespace-nowrap">
              {t.plays} · {forgotten ? `última ${monthLabel(t.last_month)}` : `desde ${monthLabel(t.first_month)}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function PlaylistsView() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/data/playlists.json").then((r) => r.json()).then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <main className="max-w-6xl mx-auto px-3 sm:px-4 text-xs text-zinc-500">cargando…</main>;

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-4 pb-16">
      <p className="text-xs text-zinc-500 mb-4">
        Salen solo de lo que has escuchado, con datos hasta {monthLabel(data.data_through)}. Se rehacen con cada export trimestral de Apple Music.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {data.playlists.map((p) => <PlaylistCard key={p.id} p={p} />)}
      </div>
    </main>
  );
}
