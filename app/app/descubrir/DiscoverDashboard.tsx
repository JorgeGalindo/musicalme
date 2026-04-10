"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

type Recommendation = {
  artist: string;
  d1: number; // direct similarity
  d2: number; // 2nd degree
  d3: number; // influence
  d4: number; // genre affinity
  because: string[];
  tags: string[];
  listeners: number;
  country: string | null;
  myPlays: number;
};

type TagMode = "OR" | "AND";
type SeedMode = "OR" | "AND";
type FamiliarityLevel = 0 | 1 | 2;

const FAMILIARITY_OPTIONS: { value: FamiliarityLevel; label: string; maxPlays: number }[] = [
  { value: 0, label: "nunca escuchado", maxPlays: 0 },
  { value: 1, label: "1–4 veces", maxPlays: 4 },
  { value: 2, label: "5–20 veces", maxPlays: 20 },
];

// Presets: different weightings of the 4 dimensions
type Preset = "mix" | "similar" | "explorar" | "sorprender";
const PRESETS: { value: Preset; label: string; desc: string; w: [number, number, number, number] }[] = [
  { value: "mix", label: "mix", desc: "equilibrio de todo", w: [1, 1, 1, 1] },
  { value: "similar", label: "familiar", desc: "más parecido a lo que escuchas", w: [3, 1, 0.3, 1] },
  { value: "explorar", label: "explorar", desc: "2º grado + afinidad de género", w: [0.5, 3, 1, 2] },
  { value: "sorprender", label: "sorprender", desc: "influencias + fuera de burbuja", w: [0.3, 1, 3, 0.5] },
];

type Filters = {
  preset: Preset;
  tags: string[];
  tagMode: TagMode;
  seedArtists: string[];
  seedMode: SeedMode;
  excludeSources: string[];
  excludeRecos: string[];
  minScore: number;
  familiarity: FamiliarityLevel;
};

const DEFAULT_FILTERS: Filters = {
  preset: "mix",
  tags: [],
  tagMode: "OR",
  seedArtists: [],
  seedMode: "OR",
  excludeSources: [],
  excludeRecos: [],
  minScore: 0,
  familiarity: 2,
};

// 2×2 dot grid showing dimensional strength
function DimDots({ d1, d2, d3, d4 }: { d1: number; d2: number; d3: number; d4: number }) {
  const dims = [
    { v: d1, color: "#a78bfa", label: "similar" },
    { v: d2, color: "#60a5fa", label: "2º grado" },
    { v: d3, color: "#f472b6", label: "influencia" },
    { v: d4, color: "#34d399", label: "género" },
  ];
  // Diameter: 3px min, 10px max, proportional to value
  const maxV = Math.max(d1, d2, d3, d4, 0.01);
  return (
    <div
      className="grid grid-cols-2 gap-[3px] w-7 h-7 flex-shrink-0 place-items-center"
      title={`sim=${d1.toFixed(2)} 2nd=${d2.toFixed(2)} inf=${d3.toFixed(2)} gen=${d4.toFixed(2)}`}
    >
      {dims.map((d) => {
        const size = 3 + (d.v / maxV) * 7;
        return (
          <span
            key={d.label}
            className="rounded-full"
            style={{
              width: size,
              height: size,
              background: d.color,
              opacity: d.v > 0 ? 0.4 + (d.v / maxV) * 0.6 : 0.1,
            }}
          />
        );
      })}
    </div>
  );
}

// Persistent feedback stored in localStorage
const STORAGE_KEY = "musicalme-discover-feedback";

type Feedback = { yes: string[]; no: string[] };

function loadFeedback(): Feedback {
  if (typeof window === "undefined") return { yes: [], no: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { yes: [], no: [] };
}

function saveFeedback(fb: Feedback) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fb)); } catch {}
}

export default function DiscoverDashboard() {
  const [data, setData] = useState<Recommendation[] | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [feedback, setFeedback] = useState<Feedback>(() => loadFeedback());
  const [showAll, setShowAll] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");

  useEffect(() => {
    fetch("/data/discover.json").then((r) => r.json()).then(setData);
  }, []);

  const allTags = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const r of data) for (const t of r.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [data]);

  const allSourceArtists = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const r of data) for (const b of r.because) set.add(b);
    return [...set].sort();
  }, [data]);

  const seedSuggestions = useMemo(() => {
    if (seedInput.length < 2) return [];
    const q = seedInput.toLowerCase();
    return allSourceArtists.filter((a) => a.toLowerCase().includes(q)).slice(0, 6);
  }, [seedInput, allSourceArtists]);

  // Apply filters + scoring
  const filtered = useMemo(() => {
    if (!data) return [];
    const weights = PRESETS.find((p) => p.value === filters.preset)!.w;

    let result = data.map((r) => ({
      ...r,
      score: r.d1 * weights[0] + r.d2 * weights[1] + r.d3 * weights[2] + r.d4 * weights[3],
    }));

    // Hide "no" feedback (persistent)
    const noSet = new Set(feedback.no.map((s) => s.toLowerCase()));
    result = result.filter((r) => !noSet.has(r.artist.toLowerCase()));

    // Familiarity
    const maxPlays = FAMILIARITY_OPTIONS[filters.familiarity].maxPlays;
    result = result.filter((r) => r.myPlays <= maxPlays);

    // Tags
    if (filters.tags.length > 0) {
      if (filters.tagMode === "OR") {
        result = result.filter((r) => r.tags.some((t) => filters.tags.includes(t)));
      } else {
        result = result.filter((r) => filters.tags.every((t) => r.tags.includes(t)));
      }
    }

    // Seeds
    if (filters.seedArtists.length > 0) {
      const seeds = new Set(filters.seedArtists.map((s) => s.toLowerCase()));
      if (filters.seedMode === "OR") {
        result = result.filter((r) => r.because.some((b) => seeds.has(b.toLowerCase())));
      } else {
        result = result.filter((r) => [...seeds].every((seed) => r.because.some((b) => b.toLowerCase() === seed)));
      }
    }

    // Exclude sources
    if (filters.excludeSources.length > 0) {
      const excl = new Set(filters.excludeSources.map((s) => s.toLowerCase()));
      result = result.filter((r) => !r.because.some((b) => excl.has(b.toLowerCase())));
    }

    // Exclude recos
    if (filters.excludeRecos.length > 0) {
      const excl = new Set(filters.excludeRecos.map((s) => s.toLowerCase()));
      result = result.filter((r) => !excl.has(r.artist.toLowerCase()));
    }

    // Min score
    if (filters.minScore > 0) {
      result = result.filter((r) => r.score >= filters.minScore);
    }

    result.sort((a, b) => b.score - a.score);
    return result;
  }, [data, filters, feedback]);

  const visible = showAll ? filtered.slice(0, 200) : filtered.slice(0, 30);

  const toggleTag = useCallback((tag: string) => {
    setFilters((p) => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter((t) => t !== tag) : [...p.tags, tag] }));
    setShowAll(false);
  }, []);

  const addSeed = useCallback((a: string) => {
    if (!a.trim()) return;
    setFilters((p) => ({ ...p, seedArtists: p.seedArtists.includes(a) ? p.seedArtists : [...p.seedArtists, a] }));
    setSeedInput("");
    setShowAll(false);
  }, []);

  const markYes = useCallback((artist: string) => {
    setFeedback((prev) => {
      const next = { ...prev, yes: [...prev.yes.filter((a) => a !== artist), artist], no: prev.no.filter((a) => a !== artist) };
      saveFeedback(next);
      return next;
    });
  }, []);

  const markNo = useCallback((artist: string) => {
    setFeedback((prev) => {
      const next = { ...prev, no: [...prev.no.filter((a) => a !== artist), artist], yes: prev.yes.filter((a) => a !== artist) };
      saveFeedback(next);
      return next;
    });
  }, []);

  const [showFeedbackList, setShowFeedbackList] = useState(false);

  if (!data) return <div className="flex items-center justify-center min-h-[50vh]"><span className="text-zinc-600 text-sm animate-pulse">cargando...</span></div>;

  return (
    <main className="max-w-6xl mx-auto px-4 pb-10">
      <div className="mb-6">
        <p className="text-xs text-zinc-500 max-w-xl">
          Artistas afines a tu gusto. Cuatro dimensiones: similitud directa, 2º grado,
          influencias musicales, y afinidad de género.
        </p>
      </div>

      {/* FILTER PANEL */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-5 mb-6 space-y-4">

        {/* Presets */}
        <div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">Modo</span>
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => { setFilters((f) => ({ ...f, preset: p.value })); setShowAll(false); }}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  filters.preset === p.value
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                <div>{p.label}</div>
                <div className="text-[9px] opacity-60">{p.desc}</div>
              </button>
            ))}
          </div>
          {/* Dimension legend */}
          <div className="flex gap-4 mt-2 text-[10px]">
            {[
              { color: "#a78bfa", label: "similar" },
              { color: "#60a5fa", label: "2º grado" },
              { color: "#f472b6", label: "influencia" },
              { color: "#34d399", label: "género" },
            ].map((d) => (
              <span key={d.label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-zinc-600">{d.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Familiarity */}
        <div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">Familiaridad</span>
          <div className="flex rounded-lg overflow-hidden border border-zinc-800">
            {FAMILIARITY_OPTIONS.map((opt) => (
              <button key={opt.value}
                onClick={() => { setFilters((p) => ({ ...p, familiarity: opt.value })); setShowAll(false); }}
                className={`px-3 py-1.5 text-[11px] transition-colors ${filters.familiarity === opt.value ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-300"}`}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Géneros</span>
            <div className="flex rounded overflow-hidden border border-zinc-800">
              {(["OR", "AND"] as TagMode[]).map((mode) => (
                <button key={mode} onClick={() => setFilters((p) => ({ ...p, tagMode: mode }))}
                  className={`px-2 py-0.5 text-[10px] transition-colors ${filters.tagMode === mode ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-300"}`}
                >{mode}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {allTags.slice(0, 25).map((t) => (
              <button key={t} onClick={() => toggleTag(t)}
                className={`px-2 py-0.5 text-[11px] rounded-lg transition-colors ${filters.tags.includes(t) ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "text-zinc-500 hover:text-zinc-300 border border-zinc-800"}`}
              >{t}</button>
            ))}
          </div>
        </div>

        {/* Seeds */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Porque escucho a...</span>
            <div className="flex rounded overflow-hidden border border-zinc-800">
              {(["OR", "AND"] as SeedMode[]).map((mode) => (
                <button key={mode} onClick={() => setFilters((p) => ({ ...p, seedMode: mode }))}
                  className={`px-2 py-0.5 text-[10px] transition-colors ${filters.seedMode === mode ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-300"}`}
                >{mode}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {filters.seedArtists.map((a) => (
              <button key={a} onClick={() => setFilters((p) => ({ ...p, seedArtists: p.seedArtists.filter((x) => x !== a) }))}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25"
              >{a} <span className="text-violet-400">×</span></button>
            ))}
          </div>
          <div className="relative">
            <input type="text" value={seedInput} onChange={(e) => setSeedInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSeed(seedInput)}
              placeholder="añadir artista semilla..." className="w-56 px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
            {seedSuggestions.length > 0 && (
              <div className="absolute z-50 top-full mt-1 w-56 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl overflow-hidden">
                {seedSuggestions.map((a) => (
                  <button key={a} onClick={() => addSeed(a)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 text-zinc-300">{a}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Exclude sources */}
        <div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">No basado en...</span>
          <div className="flex flex-wrap gap-2 mb-2">
            {filters.excludeSources.map((a) => (
              <button key={a} onClick={() => setFilters((p) => ({ ...p, excludeSources: p.excludeSources.filter((x) => x !== a) }))}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-lg bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20"
              >{a} <span className="text-red-400">×</span></button>
            ))}
          </div>
          <input type="text" value={excludeInput} onChange={(e) => setExcludeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && excludeInput.trim()) { setFilters((p) => ({ ...p, excludeSources: [...p.excludeSources, excludeInput.trim()] })); setExcludeInput(""); } }}
            placeholder="excluir fuente..." className="w-56 px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600" />
        </div>

        {/* Reset */}
        {JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) && (
          <button onClick={() => { setFilters(DEFAULT_FILTERS); setShowAll(false); }}
            className="text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors">limpiar filtros</button>
        )}
      </div>

      {/* Results count + feedback stats */}
      <div className="flex items-center gap-4 text-[11px] text-zinc-600 mb-4">
        <span>{filtered.length} recomendaciones</span>
        {(feedback.yes.length > 0 || feedback.no.length > 0) && (
          <button onClick={() => setShowFeedbackList(!showFeedbackList)} className="hover:text-zinc-300 transition-colors">
            {feedback.yes.length} escuchado sí · {feedback.no.length} escuchado no
          </button>
        )}
      </div>

      {/* Feedback list (toggleable) */}
      {showFeedbackList && (feedback.yes.length > 0 || feedback.no.length > 0) && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 mb-4 text-xs">
          {feedback.yes.length > 0 && (
            <div className="mb-3">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Escuchado sí</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {feedback.yes.map((a) => (
                  <span key={a} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {feedback.no.length > 0 && (
            <div className="mb-3">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Escuchado no</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {feedback.no.map((a) => (
                  <button key={a} onClick={() => setFeedback((p) => { const next = { ...p, no: p.no.filter((x) => x !== a) }; saveFeedback(next); return next; })}
                    className="px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20">
                    {a} ×
                  </button>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => { setFeedback({ yes: [], no: [] }); saveFeedback({ yes: [], no: [] }); }}
            className="text-[10px] text-zinc-600 hover:text-zinc-300">limpiar todo</button>
        </div>
      )}

      {/* RESULTS */}
      <div className="space-y-2">
        {visible.map((r, i) => (
          <div key={r.artist}
            className="rounded-xl bg-zinc-900 border border-zinc-800/60 p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-zinc-600 text-[11px] tabular-nums w-5">{i + 1}</span>
                  <DimDots d1={r.d1} d2={r.d2} d3={r.d3} d4={r.d4} />
                  <span className="text-zinc-100 font-medium">{r.artist}</span>
                  {r.country && <span className="text-[10px] text-zinc-600">{r.country}</span>}
                  {r.myPlays > 0 && <span className="text-[10px] text-amber-500/60">{r.myPlays} plays</span>}
                </div>
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5 ml-7">
                    {r.tags.slice(0, 4).map((t) => (
                      <button key={t} onClick={() => toggleTag(t)}
                        className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${filters.tags.includes(t) ? "bg-violet-500/20 text-violet-300" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`}
                      >{t}</button>
                    ))}
                  </div>
                )}
                {r.because.length > 0 && (
                  <div className="text-[11px] text-zinc-500 ml-7">
                    porque escuchas{" "}
                    {r.because.map((b, j) => (
                      <span key={b}>
                        {j > 0 && (j === r.because.length - 1 ? " y " : ", ")}
                        <button onClick={() => addSeed(b)} className="text-violet-400/70 hover:text-violet-300 transition-colors">{b}</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => markYes(r.artist)}
                  className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${feedback.yes.includes(r.artist) ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-700 hover:text-emerald-400"}`}
                >sí</button>
                <button onClick={() => markNo(r.artist)}
                  className="px-1.5 py-0.5 text-[10px] rounded text-zinc-700 hover:text-red-400 transition-colors"
                >no</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length > 30 && (
        <button onClick={() => setShowAll(!showAll)}
          className="mt-4 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >{showAll ? "ver menos" : `ver todas (${filtered.length})`}</button>
      )}

      <footer className="text-center text-zinc-800 text-[10px] py-6 tracking-wider">musicalme</footer>
    </main>
  );
}
