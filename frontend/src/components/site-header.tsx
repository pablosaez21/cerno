import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wide-shell grid min-h-20 items-stretch sm:grid-cols-[1fr_auto_auto]">
        <div className="flex items-center justify-between py-3 sm:justify-start sm:py-0">
          <Link href="/" className="brand-mark text-[var(--text-strong)]" aria-label="Cerno home">
            Cerno
          </Link>
          <span className="font-mono text-[11px] font-semibold uppercase leading-5 tracking-[0.16em] text-[var(--accent)] sm:ml-5 sm:text-xs">
            Analysis desk
          </span>
        </div>
        <div className="hidden items-center border-l border-[var(--line)] px-6 font-mono text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-[var(--muted)] sm:flex">
          Stockfish · Lichess · PGN
        </div>
        <Link href="/#analyze" className="header-link">
          New analysis
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
