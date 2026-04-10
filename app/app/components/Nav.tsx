"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/", label: "análisis" },
  { href: "/recuperar", label: "recuperar" },
  { href: "/descubrir", label: "descubrir" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="max-w-6xl mx-auto px-3 sm:px-4 pt-6 sm:pt-10 pb-4 sm:pb-6">
      <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
        <Link href="/" className="text-3xl sm:text-5xl font-light tracking-tight text-zinc-50 hover:opacity-80 transition-opacity">
          musical<span className="text-violet-400 font-light">me</span>
        </Link>
        <nav className="flex rounded-lg overflow-hidden border border-zinc-800">
          {SECTIONS.map((s) => {
            const active =
              s.href === "/"
                ? pathname === "/"
                : pathname.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs transition-colors ${
                  active
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
